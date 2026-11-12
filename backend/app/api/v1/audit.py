from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.auth import User
from app.models.inventory import Product
from app.models.organization import AuditLog, Notification
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.organization import AuditLogOut, NotificationOut

router = APIRouter(tags=["Audit Logs & Notifications"])


@router.get("/audit/logs", response_model=PaginatedResponse[AuditLogOut])
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    module: Optional[str] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    _: User = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[AuditLogOut]:
    """List immutable system-wide audit logs (Owner / audit:view)."""
    stmt = select(AuditLog)
    if module:
        stmt = stmt.where(AuditLog.module == module)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                AuditLog.description.ilike(pattern),
                AuditLog.action.ilike(pattern),
                AuditLog.username.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(AuditLog.created_at)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedResponse(
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/audit/my-activity", response_model=PaginatedResponse[AuditLogOut])
def list_my_activity(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[AuditLogOut]:
    """Allow any logged-in employee/user to inspect their own activity history."""
    stmt = select(AuditLog).where(AuditLog.user_id == current_user.id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(AuditLog.created_at)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedResponse(
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/notifications")
def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Return user/global notifications plus live low-stock alert summary."""
    rows = db.scalars(
        select(Notification)
        .where(or_(Notification.user_id == current_user.id, Notification.user_id.is_(None)))
        .order_by(desc(Notification.created_at))
        .limit(20)
    ).all()

    low_stock_products = db.scalars(
        select(Product)
        .where(Product.is_active.is_(True), Product.current_stock <= Product.min_stock_level)
        .order_by(Product.current_stock.asc())
        .limit(10)
    ).all()

    unread_count = sum(1 for r in rows if not r.is_read) + len(low_stock_products)

    return {
        "unread_count": unread_count,
        "notifications": [NotificationOut.model_validate(r) for r in rows],
        "low_stock_alerts": [
            {
                "id": p.id,
                "product_code": p.product_code,
                "name": p.name,
                "current_stock": float(p.current_stock),
                "min_stock_level": float(p.min_stock_level),
            }
            for p in low_stock_products
        ],
    }


@router.patch("/notifications/{notification_id}/read", response_model=MessageResponse)
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    row = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            or_(Notification.user_id == current_user.id, Notification.user_id.is_(None)),
        )
    )
    if row:
        row.is_read = True
        db.commit()
    return MessageResponse(message="Notification marked as read.")


@router.post("/notifications/mark-all-read", response_model=MessageResponse)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    rows = db.scalars(
        select(Notification).where(
            Notification.is_read.is_(False),
            or_(Notification.user_id == current_user.id, Notification.user_id.is_(None)),
        )
    ).all()
    for row in rows:
        row.is_read = True
    db.commit()
    return MessageResponse(message="All notifications marked as read.")

