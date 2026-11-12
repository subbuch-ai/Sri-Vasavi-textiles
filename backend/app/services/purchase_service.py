from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.models.inventory import Product
from app.models.parties import Supplier
from app.models.purchase import (
    GoodsReceipt,
    GoodsReceiptItem,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReturn,
    PurchaseReturnItem,
)
from app.schemas.finance import PaymentCreate
from app.schemas.purchase import (
    GoodsReceiptCreate,
    PurchaseInvoiceCreate,
    PurchaseOrderCreate,
    PurchaseReturnCreate,
)
from app.services.finance_service import create_payment_record
from app.services.inventory_service import apply_stock_movement, get_default_branch_id
from app.services.numbering_service import generate_sequential_code, next_settings_document_number


def _q2(val: Decimal) -> Decimal:
    return Decimal(val).quantize(Decimal("0.01"))


def create_purchase_order(db: Session, payload: PurchaseOrderCreate, user_id: Optional[int]) -> PurchaseOrder:
    """Create a Purchase Order. Does NOT increment inventory stock until GRN is received."""
    supplier = db.scalar(select(Supplier).where(Supplier.id == payload.supplier_id))
    if not supplier:
        raise NotFoundError("Supplier not found.")

    branch_id = payload.branch_id or get_default_branch_id(db)
    po_number = next_settings_document_number(db, "PO")

    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    po_items: list[PurchaseOrderItem] = []

    for item in payload.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id))
        if not product:
            raise NotFoundError(f"Product #{item.product_id} not found.")
        line_base = _q2(Decimal(item.quantity) * Decimal(item.unit_price) - Decimal(item.discount_amount))
        if line_base < Decimal("0.00"):
            raise ValidationError(f"Line discount exceeds line subtotal for product '{product.name}'.")
        gst_amt = _q2(line_base * Decimal(item.gst_rate) / Decimal("100"))
        line_total = _q2(line_base + gst_amt)

        subtotal += line_base
        tax_total += gst_amt
        po_items.append(
            PurchaseOrderItem(
                product_id=product.id,
                quantity=item.quantity,
                received_quantity=Decimal("0.000"),
                unit_price=item.unit_price,
                discount_amount=item.discount_amount,
                gst_rate=item.gst_rate,
                gst_amount=gst_amt,
                total_amount=line_total,
            )
        )

    total_amount = _q2(subtotal - Decimal(payload.discount_amount) + tax_total + Decimal(payload.transport_charges))
    if total_amount < Decimal("0.00"):
        raise ValidationError("Total purchase order amount cannot be negative.")

    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=supplier.id,
        branch_id=branch_id,
        order_date=payload.order_date,
        expected_date=payload.expected_date,
        status=payload.status,
        subtotal=subtotal,
        discount_amount=payload.discount_amount,
        tax_amount=tax_total,
        transport_charges=payload.transport_charges,
        total_amount=total_amount,
        notes=payload.notes,
        created_by=user_id,
        items=po_items,
    )
    db.add(po)
    db.flush()
    return po


def record_goods_receipt(db: Session, payload: GoodsReceiptCreate, user_id: Optional[int]) -> GoodsReceipt:
    """
    Record physical receipt of goods (GRN), updating PO received quantities and incrementing stock.
    """
    supplier = db.scalar(select(Supplier).where(Supplier.id == payload.supplier_id))
    if not supplier:
        raise NotFoundError("Supplier not found.")

    branch_id = payload.branch_id or get_default_branch_id(db)
    po: Optional[PurchaseOrder] = None
    if payload.purchase_order_id:
        po = db.scalar(
            select(PurchaseOrder).where(PurchaseOrder.id == payload.purchase_order_id).with_for_update()
        )
        if not po:
            raise NotFoundError("Linked Purchase Order not found.")
        if po.status == "CANCELLED":
            raise ValidationError("Cannot receive goods against a cancelled Purchase Order.")

    grn_number = generate_sequential_code(db, GoodsReceipt, "grn_number", "GRN-", 5)
    grn = GoodsReceipt(
        grn_number=grn_number,
        purchase_order_id=po.id if po else None,
        supplier_id=supplier.id,
        branch_id=branch_id,
        received_date=payload.received_date,
        challan_number=payload.challan_number,
        notes=payload.notes,
        received_by=user_id,
    )
    db.add(grn)
    db.flush()

    for item in payload.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
        if not product:
            raise NotFoundError(f"Product #{item.product_id} not found.")

        unit_cost = item.unit_cost if item.unit_cost is not None else product.purchase_price
        po_item: Optional[PurchaseOrderItem] = None
        if item.po_item_id:
            po_item = db.scalar(
                select(PurchaseOrderItem)
                .where(PurchaseOrderItem.id == item.po_item_id)
                .with_for_update()
            )
            if not po_item or (po and po_item.purchase_order_id != po.id):
                raise ValidationError("Invalid Purchase Order item reference.")
            remaining = Decimal(po_item.quantity) - Decimal(po_item.received_quantity)
            if Decimal(item.quantity_received) > remaining:
                raise ValidationError(
                    f"Received qty ({item.quantity_received}) exceeds pending PO qty ({remaining}) for '{product.name}'."
                )
            po_item.received_quantity = Decimal(po_item.received_quantity) + Decimal(item.quantity_received)
            if item.unit_cost is None:
                unit_cost = po_item.unit_price

        db.add(
            GoodsReceiptItem(
                goods_receipt_id=grn.id,
                po_item_id=po_item.id if po_item else None,
                product_id=product.id,
                quantity_received=item.quantity_received,
                unit_cost=unit_cost,
            )
        )

        if unit_cost > Decimal("0.00"):
            product.purchase_price = unit_cost

        apply_stock_movement(
            db,
            product_id=product.id,
            branch_id=branch_id,
            transaction_type="STOCK_IN",
            quantity_change=Decimal(item.quantity_received),
            unit_cost=unit_cost,
            reference_type="GOODS_RECEIPT",
            reference_id=grn.id,
            reference_number=grn.grn_number,
            notes=f"Goods received from {supplier.company_name}",
            user_id=user_id,
        )

    if po:
        po_items = db.scalars(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
        ).all()
        if all(Decimal(pi.received_quantity) >= Decimal(pi.quantity) for pi in po_items):
            po.status = "RECEIVED"
        else:
            po.status = "PARTIALLY_RECEIVED"

    db.flush()
    return grn


def create_purchase_invoice(
    db: Session,
    payload: PurchaseInvoiceCreate,
    user_id: Optional[int],
) -> PurchaseInvoice:
    """
    Create a supplier purchase invoice, update supplier payable balance,
    optionally trigger Goods Receipt if stock was not already received via GRN,
    and optionally record initial payment.
    """
    supplier = db.scalar(select(Supplier).where(Supplier.id == payload.supplier_id).with_for_update())
    if not supplier:
        raise NotFoundError("Supplier not found.")

    branch_id = payload.branch_id or get_default_branch_id(db)
    invoice_number = generate_sequential_code(db, PurchaseInvoice, "invoice_number", "PINV-", 5)

    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    inv_items: list[PurchaseInvoiceItem] = []

    for item in payload.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id))
        if not product:
            raise NotFoundError(f"Product #{item.product_id} not found.")
        line_base = _q2(Decimal(item.quantity) * Decimal(item.unit_price) - Decimal(item.discount_amount))
        if line_base < Decimal("0.00"):
            raise ValidationError(f"Line discount exceeds line subtotal for '{product.name}'.")
        gst_amt = _q2(line_base * Decimal(item.gst_rate) / Decimal("100"))
        line_total = _q2(line_base + gst_amt)

        subtotal += line_base
        tax_total += gst_amt
        inv_items.append(
            PurchaseInvoiceItem(
                product_id=product.id,
                quantity=item.quantity,
                returned_quantity=Decimal("0.000"),
                unit_price=item.unit_price,
                discount_amount=item.discount_amount,
                gst_rate=item.gst_rate,
                gst_amount=gst_amt,
                total_amount=line_total,
            )
        )

    if payload.is_interstate:
        igst_amount = tax_total
        cgst_amount = Decimal("0.00")
        sgst_amount = Decimal("0.00")
    else:
        cgst_amount = _q2(tax_total / Decimal("2"))
        sgst_amount = _q2(tax_total - cgst_amount)
        igst_amount = Decimal("0.00")

    raw_total = subtotal - Decimal(payload.discount_amount) + tax_total + Decimal(payload.transport_charges)
    rounded_total = raw_total.quantize(Decimal("1."))
    round_off = _q2(rounded_total - raw_total)
    total_amount = _q2(rounded_total)

    if payload.paid_amount > total_amount:
        raise ValidationError("Paid amount cannot exceed total purchase invoice amount.")

    grn_id = payload.goods_receipt_id
    if payload.receive_stock_now and not grn_id:
        grn = record_goods_receipt(
            db,
            GoodsReceiptCreate(
                purchase_order_id=payload.purchase_order_id,
                supplier_id=supplier.id,
                branch_id=branch_id,
                received_date=payload.invoice_date,
                challan_number=payload.supplier_invoice_no,
                notes=f"Auto-GRN from Purchase Invoice {invoice_number}",
                items=[
                    {
                        "product_id": it.product_id,
                        "quantity_received": it.quantity,
                        "unit_cost": it.unit_price,
                    }
                    for it in payload.items
                ],
            ),
            user_id=user_id,
        )
        grn_id = grn.id

    pending_amount = _q2(total_amount - Decimal(payload.paid_amount))
    payment_status = (
        "PAID" if pending_amount == Decimal("0.00") else ("PARTIAL" if payload.paid_amount > Decimal("0.00") else "UNPAID")
    )

    inv = PurchaseInvoice(
        invoice_number=invoice_number,
        supplier_invoice_no=payload.supplier_invoice_no.strip(),
        purchase_order_id=payload.purchase_order_id,
        goods_receipt_id=grn_id,
        supplier_id=supplier.id,
        branch_id=branch_id,
        invoice_date=payload.invoice_date,
        due_date=payload.due_date,
        subtotal=subtotal,
        discount_amount=payload.discount_amount,
        cgst_amount=cgst_amount,
        sgst_amount=sgst_amount,
        igst_amount=igst_amount,
        tax_amount=tax_total,
        transport_charges=payload.transport_charges,
        round_off=round_off,
        total_amount=total_amount,
        paid_amount=Decimal("0.00"),
        pending_amount=total_amount,
        payment_status="UNPAID",
        status="POSTED",
        notes=payload.notes,
        created_by=user_id,
        items=inv_items,
    )
    db.add(inv)
    db.flush()

    supplier.total_purchases = Decimal(supplier.total_purchases) + total_amount
    supplier.outstanding_balance = Decimal(supplier.outstanding_balance) + total_amount

    if payload.paid_amount > Decimal("0.00"):
        create_payment_record(
            db,
            PaymentCreate(
                payment_date=payload.invoice_date,
                direction="OUTBOUND",
                party_type="SUPPLIER",
                supplier_id=supplier.id,
                purchase_invoice_id=inv.id,
                account_id=payload.account_id,
                amount=payload.paid_amount,
                payment_mode=payload.payment_mode,
                reference_number=inv.invoice_number,
                notes=f"Initial payment against {inv.invoice_number}",
            ),
            user_id=user_id,
        )

    db.flush()
    return inv


def create_purchase_return(
    db: Session,
    payload: PurchaseReturnCreate,
    user_id: Optional[int],
) -> PurchaseReturn:
    """Return purchased goods back to supplier, deducting stock and reducing supplier payable."""
    inv = db.scalar(
        select(PurchaseInvoice).where(PurchaseInvoice.id == payload.purchase_invoice_id).with_for_update()
    )
    if not inv:
        raise NotFoundError("Purchase invoice not found.")

    supplier = db.scalar(select(Supplier).where(Supplier.id == inv.supplier_id).with_for_update())
    inv_items = db.scalars(
        select(PurchaseInvoiceItem).where(PurchaseInvoiceItem.purchase_invoice_id == inv.id).with_for_update()
    ).all()
    item_by_product = {it.product_id: it for it in inv_items}

    return_number = generate_sequential_code(db, PurchaseReturn, "return_number", "PRET-", 5)
    ret_items: list[PurchaseReturnItem] = []
    total_return_amount = Decimal("0.00")

    for req_item in payload.items:
        inv_item = item_by_product.get(req_item.product_id)
        if not inv_item:
            raise ValidationError(f"Product #{req_item.product_id} was not part of invoice {inv.invoice_number}.")
        returnable = Decimal(inv_item.quantity) - Decimal(inv_item.returned_quantity)
        if Decimal(req_item.quantity) > returnable:
            raise ValidationError(f"Return quantity ({req_item.quantity}) exceeds returnable quantity ({returnable}).")

        inv_item.returned_quantity = Decimal(inv_item.returned_quantity) + Decimal(req_item.quantity)
        line_base = _q2(Decimal(req_item.quantity) * Decimal(inv_item.unit_price))
        gst_amt = _q2(line_base * Decimal(inv_item.gst_rate) / Decimal("100"))
        line_total = _q2(line_base + gst_amt)
        total_return_amount += line_total

        ret_items.append(
            PurchaseReturnItem(
                product_id=req_item.product_id,
                quantity=req_item.quantity,
                unit_price=inv_item.unit_price,
                gst_amount=gst_amt,
                total_amount=line_total,
            )
        )

        apply_stock_movement(
            db,
            product_id=req_item.product_id,
            branch_id=inv.branch_id,
            transaction_type="RETURNED_OUT",
            quantity_change=-Decimal(req_item.quantity),
            unit_cost=inv_item.unit_price,
            reference_type="PURCHASE_RETURN",
            reference_number=return_number,
            notes=payload.reason or f"Returned against {inv.invoice_number}",
            user_id=user_id,
        )

    ret = PurchaseReturn(
        return_number=return_number,
        purchase_invoice_id=inv.id,
        supplier_id=inv.supplier_id,
        branch_id=inv.branch_id,
        return_date=payload.return_date,
        reason=payload.reason,
        total_amount=total_return_amount,
        created_by=user_id,
        items=ret_items,
    )
    db.add(ret)

    inv.pending_amount = max(Decimal("0.00"), Decimal(inv.pending_amount) - total_return_amount)
    if inv.pending_amount == Decimal("0.00"):
        inv.payment_status = "PAID"
    if supplier:
        supplier.outstanding_balance = Decimal(supplier.outstanding_balance) - total_return_amount

    db.flush()
    return ret

