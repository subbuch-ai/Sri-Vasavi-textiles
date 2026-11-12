from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.auth import User
from app.models.organization import BusinessSettings
from app.models.sales import Sale, SaleItem, SaleReturn
from app.schemas.common import PaginatedResponse
from app.schemas.sales import SaleCreate, SaleItemOut, SaleOut, SaleReturnCreate, SaleReturnOut
from app.services.audit_service import record_audit_log
from app.services.export_service import build_invoice_pdf
from app.services.sales_service import create_sale, create_sale_return

router = APIRouter(prefix="/sales", tags=["Sales & Billing"])


def _to_sale_out(s: Sale) -> SaleOut:
    return SaleOut(
        id=s.id,
        invoice_number=s.invoice_number,
        customer_id=s.customer_id,
        customer_name_snapshot=s.customer_name_snapshot,
        customer_order_id=s.customer_order_id,
        branch_id=s.branch_id,
        sale_type=s.sale_type,
        sale_date=s.sale_date,
        subtotal=s.subtotal,
        discount_amount=s.discount_amount,
        cgst_amount=s.cgst_amount,
        sgst_amount=s.sgst_amount,
        igst_amount=s.igst_amount,
        tax_amount=s.tax_amount,
        round_off=s.round_off,
        total_amount=s.total_amount,
        total_cogs=s.total_cogs,
        paid_amount=s.paid_amount,
        pending_amount=s.pending_amount,
        payment_status=s.payment_status,
        status=s.status,
        payment_mode=s.payment_mode,
        notes=s.notes,
        created_at=s.created_at,
        items=[
            SaleItemOut(
                id=it.id,
                product_id=it.product_id,
                product_code=it.product.product_code if it.product else None,
                product_name=it.product.name if it.product else None,
                hsn_code=it.product.hsn_code if it.product else None,
                unit=it.product.unit if it.product else None,
                quantity=it.quantity,
                returned_quantity=it.returned_quantity,
                unit_price=it.unit_price,
                cost_price=it.cost_price,
                discount_amount=it.discount_amount,
                gst_rate=it.gst_rate,
                gst_amount=it.gst_amount,
                total_amount=it.total_amount,
            )
            for it in s.items
        ],
    )


@router.get("", response_model=PaginatedResponse[SaleOut])
def list_sales(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sale_type: Optional[str] = None,
    payment_status: Optional[str] = None,
    customer_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    _: User = Depends(require_permission("sales:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[SaleOut]:
    stmt = select(Sale).options(joinedload(Sale.items).joinedload(SaleItem.product))
    if sale_type:
        stmt = stmt.where(Sale.sale_type == sale_type)
    if payment_status:
        stmt = stmt.where(Sale.payment_status == payment_status)
    if customer_id:
        stmt = stmt.where(Sale.customer_id == customer_id)
    if start_date:
        stmt = stmt.where(Sale.sale_date >= start_date)
    if end_date:
        stmt = stmt.where(Sale.sale_date <= end_date)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(or_(Sale.invoice_number.ilike(pat), Sale.customer_name_snapshot.ilike(pat)))

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(Sale.id).subquery())) or 0
    rows = db.scalars(stmt.order_by(desc(Sale.id)).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return PaginatedResponse(
        items=[_to_sale_out(s) for s in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("", response_model=SaleOut, status_code=201)
def create_sale_endpoint(
    payload: SaleCreate,
    request: Request,
    user: User = Depends(require_permission("sales:create")),
    db: Session = Depends(get_db),
) -> SaleOut:
    sale = create_sale(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="sales",
        entity_type="sale",
        entity_id=sale.id,
        description=f"Created {sale.sale_type} Invoice {sale.invoice_number} for '{sale.customer_name_snapshot}' (Rs. {sale.total_amount}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(Sale).options(joinedload(Sale.items).joinedload(SaleItem.product)).where(Sale.id == sale.id)
    )
    return _to_sale_out(loaded)


@router.get("/returns", response_model=PaginatedResponse[SaleReturnOut])
def list_sale_returns(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: User = Depends(require_permission("sales:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[SaleReturnOut]:
    total = db.scalar(select(func.count()).select_from(SaleReturn)) or 0
    rows = db.scalars(
        select(SaleReturn).order_by(desc(SaleReturn.id)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[SaleReturnOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("/returns", response_model=SaleReturnOut, status_code=201)
def create_sale_return_endpoint(
    payload: SaleReturnCreate,
    request: Request,
    user: User = Depends(require_permission("sales:edit")),
    db: Session = Depends(get_db),
) -> SaleReturnOut:
    ret = create_sale_return(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="SALE_RETURN",
        module="sales",
        entity_type="sale_return",
        entity_id=ret.id,
        description=f"Processed Sales Return {ret.return_number} (Rs. {ret.total_amount}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(ret)
    return SaleReturnOut.model_validate(ret)


@router.get("/{sale_id}", response_model=SaleOut)
def get_sale(
    sale_id: int,
    _: User = Depends(require_permission("sales:view")),
    db: Session = Depends(get_db),
) -> SaleOut:
    s = db.scalar(select(Sale).options(joinedload(Sale.items).joinedload(SaleItem.product)).where(Sale.id == sale_id))
    if not s:
        raise NotFoundError("Sales invoice not found.")
    return _to_sale_out(s)


@router.get("/{sale_id}/pdf")
def download_sale_invoice_pdf(
    sale_id: int,
    _: User = Depends(require_permission("sales:view")),
    db: Session = Depends(get_db),
) -> Response:
    s = db.scalar(select(Sale).options(joinedload(Sale.items).joinedload(SaleItem.product)).where(Sale.id == sale_id))
    if not s:
        raise NotFoundError("Sales invoice not found.")
    biz = db.scalar(select(BusinessSettings).limit(1))
    pdf_bytes = build_invoice_pdf(s, biz)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={s.invoice_number}.pdf"},
    )

