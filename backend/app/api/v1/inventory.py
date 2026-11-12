from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.models.auth import User
from app.models.inventory import BranchStock, Product, StockTransaction
from app.models.organization import Branch
from app.schemas.common import PaginatedResponse
from app.schemas.inventory import (
    ProductOut,
    StockAdjustmentCreate,
    StockTransactionOut,
    StockTransferCreate,
)
from app.services.audit_service import record_audit_log
from app.services.inventory_service import (
    apply_stock_movement,
    transfer_stock_between_branches,
)

router = APIRouter(prefix="/inventory", tags=["Inventory & Stock"])


@router.get("/valuation")
def get_inventory_valuation(
    _: User = Depends(require_permission("inventory:view")),
    db: Session = Depends(get_db),
) -> dict:
    products = db.scalars(
        select(Product).options(joinedload(Product.category)).where(Product.is_active.is_(True))
    ).all()
    total_cost_val = sum(Decimal(p.current_stock) * Decimal(p.purchase_price) for p in products)
    total_wholesale_val = sum(Decimal(p.current_stock) * Decimal(p.wholesale_price) for p in products)
    total_retail_val = sum(Decimal(p.current_stock) * Decimal(p.retail_price) for p in products)
    low_stock_count = sum(1 for p in products if p.current_stock <= p.min_stock_level)
    out_of_stock_count = sum(1 for p in products if p.current_stock <= Decimal("0"))

    return {
        "total_skus": len(products),
        "total_units": float(sum(p.current_stock for p in products)),
        "total_cost_value": float(Decimal(total_cost_val).quantize(Decimal("0.01"))),
        "total_wholesale_value": float(Decimal(total_wholesale_val).quantize(Decimal("0.01"))),
        "total_retail_value": float(Decimal(total_retail_val).quantize(Decimal("0.01"))),
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count,
    }


@router.get("/low-stock", response_model=List[ProductOut])
def list_low_stock_products(
    _: User = Depends(require_permission("inventory:view")),
    db: Session = Depends(get_db),
) -> List[ProductOut]:
    rows = db.scalars(
        select(Product)
        .options(joinedload(Product.category))
        .where(Product.is_active.is_(True), Product.current_stock <= Product.min_stock_level)
        .order_by(Product.current_stock.asc())
    ).all()
    return [
        ProductOut(
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
            is_low_stock=True,
            stock_value=Decimal(p.current_stock * p.purchase_price).quantize(Decimal("0.01")),
            created_at=p.created_at,
        )
        for p in rows
    ]


@router.get("/branch-stocks")
def list_branch_stocks(
    branch_id: Optional[int] = None,
    _: User = Depends(require_permission("inventory:view")),
    db: Session = Depends(get_db),
) -> List[dict]:
    stmt = select(BranchStock, Product, Branch).join(Product, BranchStock.product_id == Product.id).join(
        Branch, BranchStock.branch_id == Branch.id
    )
    if branch_id:
        stmt = stmt.where(BranchStock.branch_id == branch_id)
    rows = db.execute(stmt.order_by(Branch.name, Product.name)).all()
    return [
        {
            "branch_id": bs.branch_id,
            "branch_name": b.name,
            "product_id": p.id,
            "product_code": p.product_code,
            "product_name": p.name,
            "unit": p.unit,
            "quantity": float(bs.quantity),
        }
        for bs, p, b in rows
    ]


@router.get("/transactions", response_model=PaginatedResponse[StockTransactionOut])
def list_stock_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    product_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    _: User = Depends(require_permission("inventory:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[StockTransactionOut]:
    stmt = select(StockTransaction).options(joinedload(StockTransaction.product))
    if product_id:
        stmt = stmt.where(StockTransaction.product_id == product_id)
    if transaction_type:
        stmt = stmt.where(StockTransaction.transaction_type == transaction_type)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(StockTransaction.id)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    branches = {b.id: b.name for b in db.scalars(select(Branch)).all()}

    items = [
        StockTransactionOut(
            id=tx.id,
            transaction_number=tx.transaction_number,
            product_id=tx.product_id,
            product_code=tx.product.product_code if tx.product else None,
            product_name=tx.product.name if tx.product else None,
            branch_id=tx.branch_id,
            branch_name=branches.get(tx.branch_id),
            target_branch_id=tx.target_branch_id,
            transaction_type=tx.transaction_type,
            quantity_change=tx.quantity_change,
            stock_before=tx.stock_before,
            stock_after=tx.stock_after,
            unit_cost=tx.unit_cost,
            reference_type=tx.reference_type,
            reference_id=tx.reference_id,
            reference_number=tx.reference_number,
            notes=tx.notes,
            created_by=tx.created_by,
            created_at=tx.created_at,
        )
        for tx in rows
    ]
    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


@router.post("/adjust", response_model=StockTransactionOut, status_code=201)
def adjust_stock(
    payload: StockAdjustmentCreate,
    request: Request,
    user: User = Depends(require_permission("inventory:adjust")),
    db: Session = Depends(get_db),
) -> StockTransactionOut:
    """Record manual Stock In, Stock Out, Damaged Stock, Returned Stock, or Stock Adjustment."""
    qty_change = Decimal(payload.quantity)
    if payload.transaction_type in ("STOCK_OUT", "DAMAGED", "RETURNED_OUT") and qty_change > 0:
        qty_change = -qty_change
    elif payload.transaction_type in ("STOCK_IN", "RETURNED_IN") and qty_change < 0:
        qty_change = abs(qty_change)

    tx = apply_stock_movement(
        db,
        product_id=payload.product_id,
        branch_id=payload.branch_id,
        transaction_type=payload.transaction_type,
        quantity_change=qty_change,
        unit_cost=payload.unit_cost,
        reference_type="MANUAL_ADJUSTMENT",
        notes=payload.notes,
        user_id=user.id,
    )
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action=payload.transaction_type,
        module="inventory",
        entity_type="stock_transaction",
        entity_id=tx.id,
        description=f"Stock {payload.transaction_type} ({qty_change}) on product #{payload.product_id}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(tx)
    prod = db.scalar(select(Product).where(Product.id == tx.product_id))
    return StockTransactionOut(
        id=tx.id,
        transaction_number=tx.transaction_number,
        product_id=tx.product_id,
        product_code=prod.product_code if prod else None,
        product_name=prod.name if prod else None,
        branch_id=tx.branch_id,
        target_branch_id=tx.target_branch_id,
        transaction_type=tx.transaction_type,
        quantity_change=tx.quantity_change,
        stock_before=tx.stock_before,
        stock_after=tx.stock_after,
        unit_cost=tx.unit_cost,
        reference_type=tx.reference_type,
        reference_id=tx.reference_id,
        reference_number=tx.reference_number,
        notes=tx.notes,
        created_by=tx.created_by,
        created_at=tx.created_at,
    )


@router.post("/transfer", response_model=StockTransactionOut, status_code=201)
def transfer_stock(
    payload: StockTransferCreate,
    request: Request,
    user: User = Depends(require_permission("inventory:adjust")),
    db: Session = Depends(get_db),
) -> StockTransactionOut:
    """Transfer stock between two store/warehouse branches."""
    tx = transfer_stock_between_branches(
        db,
        product_id=payload.product_id,
        source_branch_id=payload.source_branch_id,
        target_branch_id=payload.target_branch_id,
        quantity=payload.quantity,
        notes=payload.notes,
        user_id=user.id,
    )
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="STOCK_TRANSFER",
        module="inventory",
        entity_type="stock_transaction",
        entity_id=tx.id,
        description=f"Transferred {payload.quantity} units of product #{payload.product_id} from branch #{payload.source_branch_id} to #{payload.target_branch_id}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(tx)
    prod = db.scalar(select(Product).where(Product.id == tx.product_id))
    return StockTransactionOut(
        id=tx.id,
        transaction_number=tx.transaction_number,
        product_id=tx.product_id,
        product_code=prod.product_code if prod else None,
        product_name=prod.name if prod else None,
        branch_id=tx.branch_id,
        target_branch_id=tx.target_branch_id,
        transaction_type=tx.transaction_type,
        quantity_change=tx.quantity_change,
        stock_before=tx.stock_before,
        stock_after=tx.stock_after,
        unit_cost=tx.unit_cost,
        reference_type=tx.reference_type,
        reference_id=tx.reference_id,
        reference_number=tx.reference_number,
        notes=tx.notes,
        created_by=tx.created_by,
        created_at=tx.created_at,
    )

