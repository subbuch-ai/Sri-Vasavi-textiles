from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.auth import User
from app.models.sales import CustomerOrder, CustomerOrderItem, Sale, SaleItem
from app.schemas.common import PaginatedResponse
from app.schemas.sales import (
    ConvertOrderToSaleRequest,
    CustomerOrderCreate,
    CustomerOrderItemOut,
    CustomerOrderOut,
    CustomerOrderUpdate,
    SaleItemOut,
    SaleOut,
)
from app.services.audit_service import record_audit_log
from app.services.sales_service import (
    convert_order_to_sale,
    create_customer_order,
    update_customer_order,
)

router = APIRouter(prefix="/orders", tags=["Customer Orders"])


def _to_order_out(o: CustomerOrder) -> CustomerOrderOut:
    return CustomerOrderOut(
        id=o.id,
        order_number=o.order_number,
        customer_id=o.customer_id,
        customer_name=o.customer.name if o.customer else None,
        branch_id=o.branch_id,
        order_date=o.order_date,
        expected_delivery_date=o.expected_delivery_date,
        order_type=o.order_type,
        subtotal=o.subtotal,
        discount_amount=o.discount_amount,
        tax_amount=o.tax_amount,
        total_amount=o.total_amount,
        advance_amount=o.advance_amount,
        remaining_amount=o.remaining_amount,
        order_status=o.order_status,
        payment_status=o.payment_status,
        converted_sale_id=o.converted_sale_id,
        stock_deducted=o.stock_deducted,
        notes=o.notes,
        created_at=o.created_at,
        items=[
            CustomerOrderItemOut(
                id=it.id,
                product_id=it.product_id,
                product_code=it.product.product_code if it.product else None,
                product_name=it.product.name if it.product else None,
                quantity=it.quantity,
                unit_price=it.unit_price,
                discount_amount=it.discount_amount,
                gst_rate=it.gst_rate,
                gst_amount=it.gst_amount,
                total_amount=it.total_amount,
            )
            for it in o.items
        ],
    )


@router.get("", response_model=PaginatedResponse[CustomerOrderOut])
def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    customer_id: Optional[int] = None,
    order_status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    _: User = Depends(require_permission("orders:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[CustomerOrderOut]:
    stmt = select(CustomerOrder).options(
        joinedload(CustomerOrder.customer),
        joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
    )
    if customer_id:
        stmt = stmt.where(CustomerOrder.customer_id == customer_id)
    if order_status:
        stmt = stmt.where(CustomerOrder.order_status == order_status)
    if start_date:
        stmt = stmt.where(CustomerOrder.order_date >= start_date)
    if end_date:
        stmt = stmt.where(CustomerOrder.order_date <= end_date)
    if search:
        stmt = stmt.where(CustomerOrder.order_number.ilike(f"%{search.strip()}%"))

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(CustomerOrder.id).subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(CustomerOrder.id)).offset((page - 1) * page_size).limit(page_size)
    ).unique().all()
    return PaginatedResponse(
        items=[_to_order_out(o) for o in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/{order_id}", response_model=CustomerOrderOut)
def get_order(
    order_id: int,
    _: User = Depends(require_permission("orders:view")),
    db: Session = Depends(get_db),
) -> CustomerOrderOut:
    o = db.scalar(
        select(CustomerOrder)
        .options(joinedload(CustomerOrder.customer), joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product))
        .where(CustomerOrder.id == order_id)
    )
    if not o:
        raise NotFoundError("Customer order not found.")
    return _to_order_out(o)


@router.post("", response_model=CustomerOrderOut, status_code=201)
def create_order_endpoint(
    payload: CustomerOrderCreate,
    request: Request,
    user: User = Depends(require_permission("orders:create")),
    db: Session = Depends(get_db),
) -> CustomerOrderOut:
    order = create_customer_order(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="orders",
        entity_type="customer_order",
        entity_id=order.id,
        description=f"Created Order {order.order_number} (Rs. {order.total_amount}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(CustomerOrder)
        .options(joinedload(CustomerOrder.customer), joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product))
        .where(CustomerOrder.id == order.id)
    )
    return _to_order_out(loaded)


@router.patch("/{order_id}", response_model=CustomerOrderOut)
def update_order_endpoint(
    order_id: int,
    payload: CustomerOrderUpdate,
    request: Request,
    user: User = Depends(require_permission("orders:edit")),
    db: Session = Depends(get_db),
) -> CustomerOrderOut:
    order = update_customer_order(db, order_id, payload)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="orders",
        entity_type="customer_order",
        entity_id=order.id,
        description=f"Updated Order {order.order_number} (status: {order.order_status}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(CustomerOrder)
        .options(joinedload(CustomerOrder.customer), joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product))
        .where(CustomerOrder.id == order.id)
    )
    return _to_order_out(loaded)


@router.post("/{order_id}/convert-to-sale", response_model=SaleOut, status_code=201)
def convert_order_endpoint(
    order_id: int,
    payload: ConvertOrderToSaleRequest,
    request: Request,
    user: User = Depends(require_permission("orders:convert")),
    db: Session = Depends(get_db),
) -> SaleOut:
    sale = convert_order_to_sale(db, order_id, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CONVERT_TO_SALE",
        module="orders",
        entity_type="sale",
        entity_id=sale.id,
        description=f"Converted Order #{order_id} to Sales Invoice {sale.invoice_number}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(Sale).options(joinedload(Sale.items).joinedload(SaleItem.product)).where(Sale.id == sale.id)
    )
    return SaleOut(
        id=loaded.id,
        invoice_number=loaded.invoice_number,
        customer_id=loaded.customer_id,
        customer_name_snapshot=loaded.customer_name_snapshot,
        customer_order_id=loaded.customer_order_id,
        branch_id=loaded.branch_id,
        sale_type=loaded.sale_type,
        sale_date=loaded.sale_date,
        subtotal=loaded.subtotal,
        discount_amount=loaded.discount_amount,
        cgst_amount=loaded.cgst_amount,
        sgst_amount=loaded.sgst_amount,
        igst_amount=loaded.igst_amount,
        tax_amount=loaded.tax_amount,
        round_off=loaded.round_off,
        total_amount=loaded.total_amount,
        total_cogs=loaded.total_cogs,
        paid_amount=loaded.paid_amount,
        pending_amount=loaded.pending_amount,
        payment_status=loaded.payment_status,
        status=loaded.status,
        payment_mode=loaded.payment_mode,
        notes=loaded.notes,
        created_at=loaded.created_at,
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
            for it in loaded.items
        ],
    )

