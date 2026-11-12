from typing import List

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.models.auth import User
from app.models.inventory import Category
from app.schemas.common import MessageResponse
from app.schemas.inventory import CategoryCreate, CategoryOut, CategoryUpdate
from app.services.audit_service import record_audit_log
from app.services.numbering_service import generate_sequential_code

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("", response_model=List[CategoryOut])
def list_categories(
    include_inactive: bool = False,
    _: User = Depends(require_permission("products:view")),
    db: Session = Depends(get_db),
) -> List[CategoryOut]:
    stmt = select(Category)
    if not include_inactive:
        stmt = stmt.where(Category.is_active.is_(True))
    rows = db.scalars(stmt.order_by(Category.name)).all()
    return [CategoryOut.model_validate(r) for r in rows]


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    request: Request,
    user: User = Depends(require_permission("products:create")),
    db: Session = Depends(get_db),
) -> CategoryOut:
    name = payload.name.strip()
    if db.scalar(select(Category.id).where(Category.name.ilike(name))):
        raise ConflictError(f"Category '{name}' already exists.")

    code = (
        payload.code.strip().upper()
        if payload.code
        else generate_sequential_code(db, Category, "code", "CAT-", 3)
    )
    if db.scalar(select(Category.id).where(Category.code == code)):
        raise ConflictError(f"Category code '{code}' already exists.")

    cat = Category(
        name=name,
        code=code,
        description=payload.description,
        parent_id=payload.parent_id,
        is_active=payload.is_active,
    )
    db.add(cat)
    db.flush()

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="products",
        entity_type="category",
        entity_id=cat.id,
        description=f"Created product category '{cat.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    request: Request,
    user: User = Depends(require_permission("products:edit")),
    db: Session = Depends(get_db),
) -> CategoryOut:
    cat = db.scalar(select(Category).where(Category.id == category_id))
    if not cat:
        raise NotFoundError("Category not found.")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        existing = db.scalar(
            select(Category.id).where(Category.name.ilike(updates["name"].strip()), Category.id != category_id)
        )
        if existing:
            raise ConflictError("Another category with this name already exists.")
        updates["name"] = updates["name"].strip()

    for k, v in updates.items():
        setattr(cat, k, v)

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="products",
        entity_type="category",
        entity_id=cat.id,
        description=f"Updated product category '{cat.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.delete("/{category_id}", response_model=MessageResponse)
def delete_category(
    category_id: int,
    request: Request,
    user: User = Depends(require_permission("products:delete")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    cat = db.scalar(select(Category).where(Category.id == category_id))
    if not cat:
        raise NotFoundError("Category not found.")
    cat.is_active = False
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="DEACTIVATE",
        module="products",
        entity_type="category",
        entity_id=cat.id,
        description=f"Deactivated product category '{cat.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"Category '{cat.name}' deactivated.")

