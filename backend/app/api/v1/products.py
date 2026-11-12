import shutil
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.auth import User
from app.models.inventory import Category, Product
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.inventory import ProductCreate, ProductOut, ProductUpdate
from app.services.audit_service import record_audit_log
from app.services.inventory_service import apply_stock_movement, get_default_branch_id
from app.services.numbering_service import generate_sequential_code

router = APIRouter(prefix="/products", tags=["Products"])


def _to_product_out(p: Product) -> ProductOut:
    return ProductOut(
        id=p.id,
        product_code=p.product_code,
        name=p.name,
        category_id=p.category_id,
        category_name=p.category.name if p.category else None,
        brand=p.brand,
        description=p.description,
        size=p.size,
        color=p.color,
        fabric_type=p.fabric_type,
        hsn_code=p.hsn_code,
        unit=p.unit,
        purchase_price=p.purchase_price,
        wholesale_price=p.wholesale_price,
        retail_price=p.retail_price,
        gst_rate=p.gst_rate,
        barcode=p.barcode,
        current_stock=p.current_stock,
        min_stock_level=p.min_stock_level,
        image_url=p.image_url,
        is_active=p.is_active,
        is_low_stock=p.current_stock <= p.min_stock_level,
        stock_value=Decimal(p.current_stock * p.purchase_price).quantize(Decimal("0.01")),
        created_at=p.created_at,
    )


@router.get("", response_model=PaginatedResponse[ProductOut])
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    low_stock_only: bool = False,
    include_inactive: bool = False,
    _: User = Depends(require_permission("products:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ProductOut]:
    stmt = select(Product).options(joinedload(Product.category))
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if low_stock_only:
        stmt = stmt.where(Product.current_stock <= Product.min_stock_level)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(pat),
                Product.product_code.ilike(pat),
                Product.barcode.ilike(pat),
                Product.brand.ilike(pat),
                Product.fabric_type.ilike(pat),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(Product.id)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedResponse(
        items=[_to_product_out(p) for p in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/lookup", response_model=List[ProductOut])
def lookup_products(
    q: str = Query("", max_length=100),
    _: User = Depends(require_permission("products:view")),
    db: Session = Depends(get_db),
) -> List[ProductOut]:
    """Quick lookup by barcode, SKU, or product name for POS and Purchase entry."""
    stmt = select(Product).options(joinedload(Product.category)).where(Product.is_active.is_(True))
    if q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.barcode == q.strip(),
                Product.product_code.ilike(pat),
                Product.name.ilike(pat),
            )
        )
    rows = db.scalars(stmt.order_by(Product.name).limit(30)).all()
    return [_to_product_out(p) for p in rows]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    _: User = Depends(require_permission("products:view")),
    db: Session = Depends(get_db),
) -> ProductOut:
    p = db.scalar(select(Product).options(joinedload(Product.category)).where(Product.id == product_id))
    if not p:
        raise NotFoundError("Product not found.")
    return _to_product_out(p)


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    request: Request,
    user: User = Depends(require_permission("products:create")),
    db: Session = Depends(get_db),
) -> ProductOut:
    cat = db.scalar(select(Category).where(Category.id == payload.category_id))
    if not cat:
        raise NotFoundError("Selected product category does not exist.")

    code = (
        payload.product_code.strip().upper()
        if payload.product_code
        else generate_sequential_code(db, Product, "product_code", "SVT-PRD-", 5)
    )
    if db.scalar(select(Product.id).where(Product.product_code == code)):
        raise ConflictError(f"Product code '{code}' already exists.")
    if payload.barcode and db.scalar(select(Product.id).where(Product.barcode == payload.barcode.strip())):
        raise ConflictError(f"Barcode '{payload.barcode}' is already assigned to another product.")

    p = Product(
        product_code=code,
        name=payload.name.strip(),
        category_id=cat.id,
        brand=payload.brand,
        description=payload.description,
        size=payload.size,
        color=payload.color,
        fabric_type=payload.fabric_type,
        hsn_code=payload.hsn_code,
        unit=payload.unit.upper(),
        purchase_price=payload.purchase_price,
        wholesale_price=payload.wholesale_price,
        retail_price=payload.retail_price,
        gst_rate=payload.gst_rate,
        barcode=payload.barcode.strip() if payload.barcode else None,
        current_stock=Decimal("0.000"),
        min_stock_level=payload.min_stock_level,
        image_url=payload.image_url,
        is_active=payload.is_active,
    )
    db.add(p)
    db.flush()

    if payload.initial_stock > Decimal("0.000"):
        apply_stock_movement(
            db,
            product_id=p.id,
            branch_id=get_default_branch_id(db),
            transaction_type="STOCK_IN",
            quantity_change=payload.initial_stock,
            unit_cost=payload.purchase_price,
            reference_type="OPENING_STOCK",
            reference_id=p.id,
            reference_number=p.product_code,
            notes="Opening stock on product creation",
            user_id=user.id,
        )

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="products",
        entity_type="product",
        entity_id=p.id,
        description=f"Created textile product '{p.name}' ({p.product_code}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(select(Product).options(joinedload(Product.category)).where(Product.id == p.id))
    return _to_product_out(loaded)


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    request: Request,
    user: User = Depends(require_permission("products:edit")),
    db: Session = Depends(get_db),
) -> ProductOut:
    p = db.scalar(select(Product).options(joinedload(Product.category)).where(Product.id == product_id))
    if not p:
        raise NotFoundError("Product not found.")

    updates = payload.model_dump(exclude_unset=True)
    if "category_id" in updates:
        if not db.scalar(select(Category.id).where(Category.id == updates["category_id"])):
            raise NotFoundError("Category not found.")
    if "barcode" in updates and updates["barcode"]:
        conflict = db.scalar(
            select(Product.id).where(Product.barcode == updates["barcode"].strip(), Product.id != p.id)
        )
        if conflict:
            raise ConflictError("Barcode already assigned to another product.")
        updates["barcode"] = updates["barcode"].strip()

    for k, v in updates.items():
        setattr(p, k, v)

    if p.wholesale_price >= p.retail_price:
        raise ValidationError(
            "Wholesale price must be strictly lower than retail price so wholesale and retail customers have different rates."
        )

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="products",
        entity_type="product",
        entity_id=p.id,
        description=f"Updated product '{p.name}' ({p.product_code}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(p)
    return _to_product_out(p)


@router.post("/{product_id}/image", response_model=ProductOut)
def upload_product_image(
    product_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_permission("products:edit")),
    db: Session = Depends(get_db),
) -> ProductOut:
    p = db.scalar(select(Product).options(joinedload(Product.category)).where(Product.id == product_id))
    if not p:
        raise NotFoundError("Product not found.")

    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise ValidationError("Product image must be PNG, JPG, or WEBP.")

    target_dir = settings.upload_path / "products"
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"prod_{p.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
    with (target_dir / filename).open("wb") as buf:
        shutil.copyfileobj(file.file, buf)

    p.image_url = f"/uploads/products/{filename}"
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPLOAD_IMAGE",
        module="products",
        entity_type="product",
        entity_id=p.id,
        description=f"Uploaded image for '{p.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(p)
    return _to_product_out(p)


@router.delete("/{product_id}", response_model=MessageResponse)
def delete_product(
    product_id: int,
    request: Request,
    user: User = Depends(require_permission("products:delete")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    p = db.scalar(select(Product).where(Product.id == product_id))
    if not p:
        raise NotFoundError("Product not found.")
    p.is_active = False
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="DEACTIVATE",
        module="products",
        entity_type="product",
        entity_id=p.id,
        description=f"Deactivated product '{p.name}' ({p.product_code}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"Product '{p.name}' deactivated.")

