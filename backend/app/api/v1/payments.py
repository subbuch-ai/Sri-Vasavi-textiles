from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.models.auth import User
from app.models.finance import Payment
from app.schemas.common import PaginatedResponse
from app.schemas.finance import PaymentCreate, PaymentOut
from app.services.audit_service import record_audit_log
from app.services.finance_service import create_payment_record

router = APIRouter(prefix="/payments", tags=["Payments & Collections"])


@router.get("", response_model=PaginatedResponse[PaymentOut])
def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    direction: Optional[str] = None,
    party_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    _: User = Depends(require_permission("payments:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[PaymentOut]:
    stmt = select(Payment).options(
        joinedload(Payment.customer),
        joinedload(Payment.supplier),
        joinedload(Payment.account),
    )
    if direction:
        stmt = stmt.where(Payment.direction == direction)
    if party_type:
        stmt = stmt.where(Payment.party_type == party_type)
    if start_date:
        stmt = stmt.where(Payment.payment_date >= start_date)
    if end_date:
        stmt = stmt.where(Payment.payment_date <= end_date)

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(Payment.id).subquery())) or 0
    rows = db.scalars(stmt.order_by(desc(Payment.payment_date), desc(Payment.id)).offset((page - 1) * page_size).limit(page_size)).all()

    return PaginatedResponse(
        items=[
            PaymentOut(
                id=p.id,
                payment_number=p.payment_number,
                payment_date=p.payment_date,
                direction=p.direction,
                party_type=p.party_type,
                customer_id=p.customer_id,
                customer_name=p.customer.name if p.customer else None,
                supplier_id=p.supplier_id,
                supplier_name=p.supplier.company_name if p.supplier else None,
                sale_id=p.sale_id,
                purchase_invoice_id=p.purchase_invoice_id,
                account_id=p.account_id,
                account_name=p.account.name if p.account else None,
                amount=p.amount,
                payment_mode=p.payment_mode,
                reference_number=p.reference_number,
                notes=p.notes,
                status=p.status,
                created_at=p.created_at,
            )
            for p in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment_endpoint(
    payload: PaymentCreate,
    request: Request,
    user: User = Depends(require_permission("payments:create")),
    db: Session = Depends(get_db),
) -> PaymentOut:
    payment = create_payment_record(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE_PAYMENT",
        module="accounts",
        entity_type="payment",
        entity_id=payment.id,
        description=f"Recorded {payment.party_type} {payment.direction} payment {payment.payment_number} (Rs. {payment.amount}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(Payment)
        .options(joinedload(Payment.customer), joinedload(Payment.supplier), joinedload(Payment.account))
        .where(Payment.id == payment.id)
    )
    return PaymentOut(
        id=loaded.id,
        payment_number=loaded.payment_number,
        payment_date=loaded.payment_date,
        direction=loaded.direction,
        party_type=loaded.party_type,
        customer_id=loaded.customer_id,
        customer_name=loaded.customer.name if loaded.customer else None,
        supplier_id=loaded.supplier_id,
        supplier_name=loaded.supplier.company_name if loaded.supplier else None,
        sale_id=loaded.sale_id,
        purchase_invoice_id=loaded.purchase_invoice_id,
        account_id=loaded.account_id,
        account_name=loaded.account.name if loaded.account else None,
        amount=loaded.amount,
        payment_mode=loaded.payment_mode,
        reference_number=loaded.reference_number,
        notes=loaded.notes,
        status=loaded.status,
        created_at=loaded.created_at,
    )

