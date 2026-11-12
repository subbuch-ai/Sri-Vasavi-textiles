from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError
from app.models.auth import User
from app.models.purchase import (
    GoodsReceipt,
    GoodsReceiptItem,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReturn,
)
from app.schemas.common import PaginatedResponse
from app.schemas.purchase import (
    GoodsReceiptCreate,
    GoodsReceiptItemOut,
    GoodsReceiptOut,
    PurchaseInvoiceCreate,
    PurchaseInvoiceItemOut,
    PurchaseInvoiceOut,
    PurchaseOrderCreate,
    PurchaseOrderItemOut,
    PurchaseOrderOut,
    PurchaseOrderStatusUpdate,
    PurchaseReturnCreate,
    PurchaseReturnOut,
)
from app.services.audit_service import record_audit_log
from app.services.purchase_service import (
    create_purchase_invoice,
    create_purchase_order,
    create_purchase_return,
    record_goods_receipt,
)

router = APIRouter(prefix="/purchases", tags=["Purchases & Suppliers"])


def _to_po_out(po: PurchaseOrder) -> PurchaseOrderOut:
    return PurchaseOrderOut(
        id=po.id,
        po_number=po.po_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier.company_name if po.supplier else None,
        branch_id=po.branch_id,
        order_date=po.order_date,
        expected_date=po.expected_date,
        status=po.status,
        subtotal=po.subtotal,
        discount_amount=po.discount_amount,
        tax_amount=po.tax_amount,
        transport_charges=po.transport_charges,
        total_amount=po.total_amount,
        notes=po.notes,
        created_at=po.created_at,
        items=[
            PurchaseOrderItemOut(
                id=it.id,
                product_id=it.product_id,
                product_code=it.product.product_code if it.product else None,
                product_name=it.product.name if it.product else None,
                quantity=it.quantity,
                received_quantity=it.received_quantity,
                unit_price=it.unit_price,
                discount_amount=it.discount_amount,
                gst_rate=it.gst_rate,
                gst_amount=it.gst_amount,
                total_amount=it.total_amount,
            )
            for it in po.items
        ],
    )


def _to_grn_out(grn: GoodsReceipt) -> GoodsReceiptOut:
    return GoodsReceiptOut(
        id=grn.id,
        grn_number=grn.grn_number,
        purchase_order_id=grn.purchase_order_id,
        po_number=grn.purchase_order.po_number if grn.purchase_order else None,
        supplier_id=grn.supplier_id,
        supplier_name=grn.supplier.company_name if grn.supplier else None,
        branch_id=grn.branch_id,
        received_date=grn.received_date,
        challan_number=grn.challan_number,
        notes=grn.notes,
        created_at=grn.created_at,
        items=[
            GoodsReceiptItemOut(
                id=it.id,
                po_item_id=it.po_item_id,
                product_id=it.product_id,
                product_code=it.product.product_code if it.product else None,
                product_name=it.product.name if it.product else None,
                quantity_received=it.quantity_received,
                unit_cost=it.unit_cost,
            )
            for it in grn.items
        ],
    )


def _to_pinv_out(inv: PurchaseInvoice) -> PurchaseInvoiceOut:
    return PurchaseInvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        supplier_invoice_no=inv.supplier_invoice_no,
        purchase_order_id=inv.purchase_order_id,
        goods_receipt_id=inv.goods_receipt_id,
        supplier_id=inv.supplier_id,
        supplier_name=inv.supplier.company_name if inv.supplier else None,
        branch_id=inv.branch_id,
        invoice_date=inv.invoice_date,
        due_date=inv.due_date,
        subtotal=inv.subtotal,
        discount_amount=inv.discount_amount,
        cgst_amount=inv.cgst_amount,
        sgst_amount=inv.sgst_amount,
        igst_amount=inv.igst_amount,
        tax_amount=inv.tax_amount,
        transport_charges=inv.transport_charges,
        round_off=inv.round_off,
        total_amount=inv.total_amount,
        paid_amount=inv.paid_amount,
        pending_amount=inv.pending_amount,
        payment_status=inv.payment_status,
        status=inv.status,
        notes=inv.notes,
        created_at=inv.created_at,
        items=[
            PurchaseInvoiceItemOut(
                id=it.id,
                product_id=it.product_id,
                product_code=it.product.product_code if it.product else None,
                product_name=it.product.name if it.product else None,
                quantity=it.quantity,
                returned_quantity=it.returned_quantity,
                unit_price=it.unit_price,
                discount_amount=it.discount_amount,
                gst_rate=it.gst_rate,
                gst_amount=it.gst_amount,
                total_amount=it.total_amount,
            )
            for it in inv.items
        ],
    )


@router.get("/orders", response_model=PaginatedResponse[PurchaseOrderOut])
def list_purchase_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status: Optional[str] = None,
    supplier_id: Optional[int] = None,
    search: Optional[str] = None,
    _: User = Depends(require_permission("purchases:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[PurchaseOrderOut]:
    stmt = select(PurchaseOrder).options(
        joinedload(PurchaseOrder.supplier),
        joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
    )
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    if supplier_id:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
    if search:
        stmt = stmt.where(PurchaseOrder.po_number.ilike(f"%{search.strip()}%"))

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(PurchaseOrder.id).subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(PurchaseOrder.id)).offset((page - 1) * page_size).limit(page_size)
    ).unique().all()
    return PaginatedResponse(
        items=[_to_po_out(po) for po in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("/orders", response_model=PurchaseOrderOut, status_code=201)
def create_po_endpoint(
    payload: PurchaseOrderCreate,
    request: Request,
    user: User = Depends(require_permission("purchases:create")),
    db: Session = Depends(get_db),
) -> PurchaseOrderOut:
    po = create_purchase_order(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="purchases",
        entity_type="purchase_order",
        entity_id=po.id,
        description=f"Created Purchase Order {po.po_number} for Rs. {po.total_amount}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product))
        .where(PurchaseOrder.id == po.id)
    )
    return _to_po_out(loaded)


@router.patch("/orders/{po_id}/status", response_model=PurchaseOrderOut)
def update_po_status(
    po_id: int,
    payload: PurchaseOrderStatusUpdate,
    request: Request,
    user: User = Depends(require_permission("purchases:edit")),
    db: Session = Depends(get_db),
) -> PurchaseOrderOut:
    po = db.scalar(
        select(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product))
        .where(PurchaseOrder.id == po_id)
    )
    if not po:
        raise NotFoundError("Purchase order not found.")
    if po.status in ("PARTIALLY_RECEIVED", "RECEIVED"):
        raise ValidationError("Cannot change status after goods have been received.")
    po.status = payload.status
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE_STATUS",
        module="purchases",
        entity_type="purchase_order",
        entity_id=po.id,
        description=f"Changed PO {po.po_number} status to {po.status}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return _to_po_out(po)


@router.get("/grns", response_model=PaginatedResponse[GoodsReceiptOut])
def list_grns(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: User = Depends(require_permission("purchases:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[GoodsReceiptOut]:
    stmt = select(GoodsReceipt).options(
        joinedload(GoodsReceipt.supplier),
        joinedload(GoodsReceipt.purchase_order),
        joinedload(GoodsReceipt.items).joinedload(GoodsReceiptItem.product),
    )
    total = db.scalar(select(func.count()).select_from(GoodsReceipt)) or 0
    rows = db.scalars(stmt.order_by(desc(GoodsReceipt.id)).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return PaginatedResponse(
        items=[_to_grn_out(g) for g in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("/grns", response_model=GoodsReceiptOut, status_code=201)
def create_grn_endpoint(
    payload: GoodsReceiptCreate,
    request: Request,
    user: User = Depends(require_permission("purchases:receive")),
    db: Session = Depends(get_db),
) -> GoodsReceiptOut:
    grn = record_goods_receipt(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="RECEIVE_GOODS",
        module="purchases",
        entity_type="goods_receipt",
        entity_id=grn.id,
        description=f"Recorded Goods Receipt {grn.grn_number} and updated inventory stock.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(GoodsReceipt)
        .options(
            joinedload(GoodsReceipt.supplier),
            joinedload(GoodsReceipt.purchase_order),
            joinedload(GoodsReceipt.items).joinedload(GoodsReceiptItem.product),
        )
        .where(GoodsReceipt.id == grn.id)
    )
    return _to_grn_out(loaded)


@router.get("/invoices", response_model=PaginatedResponse[PurchaseInvoiceOut])
def list_purchase_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    supplier_id: Optional[int] = None,
    payment_status: Optional[str] = None,
    search: Optional[str] = None,
    _: User = Depends(require_permission("purchases:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[PurchaseInvoiceOut]:
    stmt = select(PurchaseInvoice).options(
        joinedload(PurchaseInvoice.supplier),
        joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.product),
    )
    if supplier_id:
        stmt = stmt.where(PurchaseInvoice.supplier_id == supplier_id)
    if payment_status:
        stmt = stmt.where(PurchaseInvoice.payment_status == payment_status)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(or_(PurchaseInvoice.invoice_number.ilike(pat), PurchaseInvoice.supplier_invoice_no.ilike(pat)))

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(PurchaseInvoice.id).subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(PurchaseInvoice.id)).offset((page - 1) * page_size).limit(page_size)
    ).unique().all()
    return PaginatedResponse(
        items=[_to_pinv_out(inv) for inv in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("/invoices", response_model=PurchaseInvoiceOut, status_code=201)
def create_purchase_invoice_endpoint(
    payload: PurchaseInvoiceCreate,
    request: Request,
    user: User = Depends(require_permission("purchases:create")),
    db: Session = Depends(get_db),
) -> PurchaseInvoiceOut:
    inv = create_purchase_invoice(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="purchases",
        entity_type="purchase_invoice",
        entity_id=inv.id,
        description=f"Posted Purchase Invoice {inv.invoice_number} (Total Rs. {inv.total_amount}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(PurchaseInvoice)
        .options(joinedload(PurchaseInvoice.supplier), joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.product))
        .where(PurchaseInvoice.id == inv.id)
    )
    return _to_pinv_out(loaded)


@router.get("/returns", response_model=PaginatedResponse[PurchaseReturnOut])
def list_purchase_returns(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: User = Depends(require_permission("purchases:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[PurchaseReturnOut]:
    total = db.scalar(select(func.count()).select_from(PurchaseReturn)) or 0
    rows = db.scalars(
        select(PurchaseReturn)
        .options(joinedload(PurchaseReturn.supplier))
        .order_by(desc(PurchaseReturn.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[
            PurchaseReturnOut(
                id=r.id,
                return_number=r.return_number,
                purchase_invoice_id=r.purchase_invoice_id,
                supplier_id=r.supplier_id,
                supplier_name=r.supplier.company_name if r.supplier else None,
                return_date=r.return_date,
                reason=r.reason,
                total_amount=r.total_amount,
                created_at=r.created_at,
            )
            for r in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("/returns", response_model=PurchaseReturnOut, status_code=201)
def create_purchase_return_endpoint(
    payload: PurchaseReturnCreate,
    request: Request,
    user: User = Depends(require_permission("purchases:return")),
    db: Session = Depends(get_db),
) -> PurchaseReturnOut:
    ret = create_purchase_return(db, payload, user.id)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="PURCHASE_RETURN",
        module="purchases",
        entity_type="purchase_return",
        entity_id=ret.id,
        description=f"Processed Purchase Return {ret.return_number} (Rs. {ret.total_amount}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(PurchaseReturn).options(joinedload(PurchaseReturn.supplier)).where(PurchaseReturn.id == ret.id)
    )
    return PurchaseReturnOut(
        id=loaded.id,
        return_number=loaded.return_number,
        purchase_invoice_id=loaded.purchase_invoice_id,
        supplier_id=loaded.supplier_id,
        supplier_name=loaded.supplier.company_name if loaded.supplier else None,
        return_date=loaded.return_date,
        reason=loaded.reason,
        total_amount=loaded.total_amount,
        created_at=loaded.created_at,
    )

