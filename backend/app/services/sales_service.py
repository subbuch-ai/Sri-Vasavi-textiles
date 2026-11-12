from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.inventory import Product
from app.models.parties import Customer
from app.models.sales import (
    CustomerOrder,
    CustomerOrderItem,
    Sale,
    SaleItem,
    SaleReturn,
    SaleReturnItem,
)
from app.schemas.finance import PaymentCreate
from app.schemas.sales import (
    ConvertOrderToSaleRequest,
    CustomerOrderCreate,
    CustomerOrderUpdate,
    SaleCreate,
    SaleReturnCreate,
)
from app.services.finance_service import create_payment_record, record_financial_entry, resolve_account
from app.services.inventory_service import apply_stock_movement, get_default_branch_id
from app.services.numbering_service import generate_sequential_code, next_settings_document_number


def _q2(val: Decimal) -> Decimal:
    return Decimal(val).quantize(Decimal("0.01"))


def create_customer_order(db: Session, payload: CustomerOrderCreate, user_id: Optional[int]) -> CustomerOrder:
    """Create a customer order without deducting inventory yet."""
    customer = db.scalar(select(Customer).where(Customer.id == payload.customer_id))
    if not customer:
        raise NotFoundError("Customer not found.")

    branch_id = payload.branch_id or get_default_branch_id(db)
    order_number = next_settings_document_number(db, "ORDER")

    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    order_items: list[CustomerOrderItem] = []

    for item in payload.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id))
        if not product:
            raise NotFoundError(f"Product #{item.product_id} not found.")
        default_price = product.wholesale_price if payload.order_type == "WHOLESALE" else product.retail_price
        unit_price = item.unit_price if item.unit_price is not None else default_price
        gst_rate = item.gst_rate if item.gst_rate is not None else product.gst_rate

        line_base = _q2(Decimal(item.quantity) * Decimal(unit_price) - Decimal(item.discount_amount))
        if line_base < Decimal("0.00"):
            raise ValidationError(f"Line discount exceeds subtotal for '{product.name}'.")
        gst_amt = _q2(line_base * Decimal(gst_rate) / Decimal("100"))
        line_total = _q2(line_base + gst_amt)

        subtotal += line_base
        tax_total += gst_amt
        order_items.append(
            CustomerOrderItem(
                product_id=product.id,
                quantity=item.quantity,
                unit_price=unit_price,
                discount_amount=item.discount_amount,
                gst_rate=gst_rate,
                gst_amount=gst_amt,
                total_amount=line_total,
            )
        )

    total_amount = _q2(subtotal - Decimal(payload.discount_amount) + tax_total)
    if total_amount < Decimal("0.00"):
        raise ValidationError("Order total cannot be negative.")
    if payload.advance_amount > total_amount:
        raise ValidationError("Advance payment cannot exceed total order amount.")

    remaining = _q2(total_amount - Decimal(payload.advance_amount))
    pay_status = (
        "PAID" if remaining == Decimal("0.00") else ("PARTIAL" if payload.advance_amount > Decimal("0.00") else "UNPAID")
    )

    order = CustomerOrder(
        order_number=order_number,
        customer_id=customer.id,
        branch_id=branch_id,
        order_date=payload.order_date,
        expected_delivery_date=payload.expected_delivery_date,
        order_type=payload.order_type,
        subtotal=subtotal,
        discount_amount=payload.discount_amount,
        tax_amount=tax_total,
        total_amount=total_amount,
        advance_amount=Decimal("0.00"),
        remaining_amount=total_amount,
        order_status="CONFIRMED" if payload.advance_amount > Decimal("0.00") else "PENDING",
        payment_status="UNPAID",
        stock_deducted=False,
        notes=payload.notes,
        created_by=user_id,
        items=order_items,
    )
    db.add(order)
    db.flush()

    if payload.advance_amount > Decimal("0.00"):
        create_payment_record(
            db,
            PaymentCreate(
                payment_date=payload.order_date,
                direction="INBOUND",
                party_type="CUSTOMER",
                customer_id=customer.id,
                customer_order_id=order.id,
                account_id=payload.account_id,
                amount=payload.advance_amount,
                payment_mode=payload.payment_mode,
                reference_number=order.order_number,
                notes=f"Advance received on order {order.order_number}",
            ),
            user_id=user_id,
        )
        order.payment_status = pay_status

    db.flush()
    return order


def update_customer_order(
    db: Session,
    order_id: int,
    payload: CustomerOrderUpdate,
) -> CustomerOrder:
    order = db.scalar(select(CustomerOrder).where(CustomerOrder.id == order_id).with_for_update())
    if not order:
        raise NotFoundError("Customer order not found.")
    if order.converted_sale_id is not None and payload.items is not None:
        raise ValidationError("Cannot modify items on an order already converted to a sales invoice.")

    if payload.expected_delivery_date is not None:
        order.expected_delivery_date = payload.expected_delivery_date
    if payload.order_status is not None:
        if order.converted_sale_id and payload.order_status == "CANCELLED":
            raise ValidationError("Cannot cancel an order that has already been invoiced.")
        order.order_status = payload.order_status
    if payload.notes is not None:
        order.notes = payload.notes

    if payload.items is not None:
        order.items.clear()
        subtotal = Decimal("0.00")
        tax_total = Decimal("0.00")
        for item in payload.items:
            product = db.scalar(select(Product).where(Product.id == item.product_id))
            if not product:
                raise NotFoundError(f"Product #{item.product_id} not found.")
            default_price = product.wholesale_price if order.order_type == "WHOLESALE" else product.retail_price
            unit_price = item.unit_price if item.unit_price is not None else default_price
            gst_rate = item.gst_rate if item.gst_rate is not None else product.gst_rate
            line_base = _q2(Decimal(item.quantity) * Decimal(unit_price) - Decimal(item.discount_amount))
            gst_amt = _q2(line_base * Decimal(gst_rate) / Decimal("100"))
            line_total = _q2(line_base + gst_amt)
            subtotal += line_base
            tax_total += gst_amt
            order.items.append(
                CustomerOrderItem(
                    product_id=product.id,
                    quantity=item.quantity,
                    unit_price=unit_price,
                    discount_amount=item.discount_amount,
                    gst_rate=gst_rate,
                    gst_amount=gst_amt,
                    total_amount=line_total,
                )
            )
        order.subtotal = subtotal
        order.tax_amount = tax_total
        order.total_amount = _q2(subtotal - Decimal(order.discount_amount) + tax_total)
        order.remaining_amount = max(Decimal("0.00"), order.total_amount - order.advance_amount)
        order.payment_status = (
            "PAID" if order.remaining_amount == Decimal("0.00") else ("PARTIAL" if order.advance_amount > 0 else "UNPAID")
        )

    db.flush()
    return order


def create_sale(
    db: Session,
    payload: SaleCreate,
    user_id: Optional[int],
    *,
    linked_order: Optional[CustomerOrder] = None,
    carried_advance_amount: Decimal = Decimal("0.00"),
) -> Sale:
    """
    Create and confirm a wholesale or retail sale atomically:
    validates available stock, deducts stock once, records COGS, creates GST invoice,
    updates customer ledger, and records payment + financial transaction.
    """
    customer: Optional[Customer] = None
    if payload.customer_id:
        customer = db.scalar(select(Customer).where(Customer.id == payload.customer_id).with_for_update())
        if not customer:
            raise NotFoundError("Customer not found.")

    branch_id = payload.branch_id or get_default_branch_id(db)
    invoice_number = next_settings_document_number(db, "INVOICE")

    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    total_cogs = Decimal("0.00")
    sale_items: list[SaleItem] = []

    for item in payload.items:
        product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
        if not product:
            raise NotFoundError(f"Product #{item.product_id} not found.")

        default_price = product.wholesale_price if payload.sale_type == "WHOLESALE" else product.retail_price
        unit_price = item.unit_price if item.unit_price is not None else default_price
        gst_rate = item.gst_rate if item.gst_rate is not None else product.gst_rate

        line_base = _q2(Decimal(item.quantity) * Decimal(unit_price) - Decimal(item.discount_amount))
        if line_base < Decimal("0.00"):
            raise ValidationError(f"Line discount exceeds subtotal for '{product.name}'.")
        gst_amt = _q2(line_base * Decimal(gst_rate) / Decimal("100"))
        line_total = _q2(line_base + gst_amt)

        cost_price = Decimal(product.purchase_price)
        total_cogs += _q2(Decimal(item.quantity) * cost_price)
        subtotal += line_base
        tax_total += gst_amt

        sale_items.append(
            SaleItem(
                product_id=product.id,
                quantity=item.quantity,
                returned_quantity=Decimal("0.000"),
                unit_price=unit_price,
                cost_price=cost_price,
                discount_amount=item.discount_amount,
                gst_rate=gst_rate,
                gst_amount=gst_amt,
                total_amount=line_total,
            )
        )

        # Deduct inventory once (enforcing BusinessSettings.allow_negative_stock)
        apply_stock_movement(
            db,
            product_id=product.id,
            branch_id=branch_id,
            transaction_type="STOCK_OUT",
            quantity_change=-Decimal(item.quantity),
            unit_cost=cost_price,
            reference_type="SALE",
            reference_number=invoice_number,
            notes=f"{payload.sale_type} sale invoice {invoice_number}",
            user_id=user_id,
        )

    if payload.is_interstate:
        igst_amount = tax_total
        cgst_amount = Decimal("0.00")
        sgst_amount = Decimal("0.00")
    else:
        cgst_amount = _q2(tax_total / Decimal("2"))
        sgst_amount = _q2(tax_total - cgst_amount)
        igst_amount = Decimal("0.00")

    raw_total = subtotal - Decimal(payload.discount_amount) + tax_total
    if raw_total < Decimal("0.00"):
        raise ValidationError("Invoice total cannot be negative.")
    rounded_total = raw_total.quantize(Decimal("1."))
    round_off = _q2(rounded_total - raw_total)
    total_amount = _q2(rounded_total)

    new_payment = payload.paid_amount if payload.paid_amount is not None else (
        Decimal("0.00")
        if payload.payment_mode == "CREDIT" or (customer and payload.sale_type == "WHOLESALE")
        else _q2(total_amount - carried_advance_amount)
    )
    if new_payment < Decimal("0.00"):
        new_payment = Decimal("0.00")

    total_paid_combined = _q2(carried_advance_amount + new_payment)
    if total_paid_combined > total_amount:
        raise ValidationError(
            f"Combined paid amount ({total_paid_combined}) exceeds total invoice amount ({total_amount})."
        )
    if not customer and total_paid_combined < total_amount:
        raise ValidationError("Credit sales require selecting a registered customer.")

    customer_name_snap = (
        customer.name
        if customer
        else (payload.customer_name_snapshot.strip() if payload.customer_name_snapshot else "Walk-in Retail Customer")
    )

    sale = Sale(
        invoice_number=invoice_number,
        customer_id=customer.id if customer else None,
        customer_name_snapshot=customer_name_snap,
        customer_order_id=linked_order.id if linked_order else None,
        branch_id=branch_id,
        sale_type=payload.sale_type,
        sale_date=payload.sale_date,
        subtotal=subtotal,
        discount_amount=payload.discount_amount,
        cgst_amount=cgst_amount,
        sgst_amount=sgst_amount,
        igst_amount=igst_amount,
        tax_amount=tax_total,
        round_off=round_off,
        total_amount=total_amount,
        total_cogs=total_cogs,
        paid_amount=carried_advance_amount,
        pending_amount=_q2(total_amount - carried_advance_amount),
        payment_status=(
            "PAID"
            if carried_advance_amount >= total_amount
            else ("PARTIAL" if carried_advance_amount > Decimal("0.00") else "UNPAID")
        ),
        status="CONFIRMED",
        payment_mode=payload.payment_mode,
        notes=payload.notes,
        created_by=user_id,
        items=sale_items,
    )
    db.add(sale)
    db.flush()

    if customer:
        customer.total_purchases = Decimal(customer.total_purchases) + total_amount
        customer.outstanding_balance = Decimal(customer.outstanding_balance) + total_amount

    if new_payment > Decimal("0.00"):
        if customer:
            create_payment_record(
                db,
                PaymentCreate(
                    payment_date=payload.sale_date,
                    direction="INBOUND",
                    party_type="CUSTOMER",
                    customer_id=customer.id,
                    sale_id=sale.id,
                    account_id=payload.account_id,
                    amount=new_payment,
                    payment_mode=payload.payment_mode,
                    reference_number=sale.invoice_number,
                    notes=f"Payment received on invoice {sale.invoice_number}",
                ),
                user_id=user_id,
            )
        else:
            account = resolve_account(db, payload.account_id, payload.payment_mode)
            sale.paid_amount = _q2(sale.paid_amount + new_payment)
            sale.pending_amount = _q2(sale.total_amount - sale.paid_amount)
            sale.payment_status = "PAID" if sale.pending_amount == Decimal("0.00") else "PARTIAL"
            record_financial_entry(
                db,
                account_id=account.id,
                tx_date=payload.sale_date,
                tx_type="SALES_INCOME",
                debit=Decimal("0.00"),
                credit=new_payment,
                payment_mode=payload.payment_mode,
                description=f"Walk-in Retail Sale {sale.invoice_number} ({customer_name_snap})",
                reference_type="SALE",
                reference_id=sale.id,
                reference_number=sale.invoice_number,
                user_id=user_id,
            )

    db.flush()
    return sale


def convert_order_to_sale(
    db: Session,
    order_id: int,
    payload: ConvertOrderToSaleRequest,
    user_id: Optional[int],
) -> Sale:
    """
    Convert a confirmed CustomerOrder into a Sale invoice cleanly:
    guarantees stock cannot be deducted twice via lock + converted_sale_id + stock_deducted check,
    and carries forward order advance_amount without duplicating cash receipts.
    """
    order = db.scalar(select(CustomerOrder).where(CustomerOrder.id == order_id).with_for_update())
    if not order:
        raise NotFoundError("Customer order not found.")
    if order.converted_sale_id is not None or order.stock_deducted:
        raise ConflictError("This order has already been converted to a sales invoice.")
    if order.order_status == "CANCELLED":
        raise ValidationError("Cancelled orders cannot be converted into sales invoices.")

    order_items = db.scalars(
        select(CustomerOrderItem).where(CustomerOrderItem.order_id == order.id)
    ).all()
    if not order_items:
        raise ValidationError("Order has no line items.")

    sale_payload = SaleCreate(
        customer_id=order.customer_id,
        branch_id=order.branch_id,
        sale_type=order.order_type,
        sale_date=payload.sale_date or date.today(),
        discount_amount=order.discount_amount,
        is_interstate=payload.is_interstate,
        paid_amount=payload.additional_paid_amount,
        payment_mode=payload.payment_mode,
        account_id=payload.account_id,
        notes=payload.notes or f"Converted from Order {order.order_number}",
        items=[
            {
                "product_id": it.product_id,
                "quantity": it.quantity,
                "unit_price": it.unit_price,
                "discount_amount": it.discount_amount,
                "gst_rate": it.gst_rate,
            }
            for it in order_items
        ],
    )

    sale = create_sale(
        db,
        sale_payload,
        user_id=user_id,
        linked_order=order,
        carried_advance_amount=Decimal(order.advance_amount),
    )

    order.converted_sale_id = sale.id
    order.stock_deducted = True
    order.order_status = "DELIVERED"
    order.payment_status = sale.payment_status
    order.remaining_amount = sale.pending_amount

    db.flush()
    return sale


def create_sale_return(
    db: Session,
    payload: SaleReturnCreate,
    user_id: Optional[int],
) -> SaleReturn:
    """Process customer sales return, restore stock, adjust COGS/receivable or issue refund."""
    sale = db.scalar(select(Sale).where(Sale.id == payload.sale_id).with_for_update())
    if not sale:
        raise NotFoundError("Sales invoice not found.")

    sale_items = db.scalars(select(SaleItem).where(SaleItem.sale_id == sale.id).with_for_update()).all()
    item_by_product = {it.product_id: it for it in sale_items}

    return_number = generate_sequential_code(db, SaleReturn, "return_number", "SRET-", 5)
    ret_items: list[SaleReturnItem] = []
    total_return_amount = Decimal("0.00")
    cogs_reversed = Decimal("0.00")

    for req_item in payload.items:
        sale_item = item_by_product.get(req_item.product_id)
        if not sale_item:
            raise ValidationError(f"Product #{req_item.product_id} was not in invoice {sale.invoice_number}.")
        returnable = Decimal(sale_item.quantity) - Decimal(sale_item.returned_quantity)
        if Decimal(req_item.quantity) > returnable:
            raise ValidationError(
                f"Return quantity ({req_item.quantity}) exceeds returnable quantity ({returnable})."
            )

        sale_item.returned_quantity = Decimal(sale_item.returned_quantity) + Decimal(req_item.quantity)
        line_base = _q2(Decimal(req_item.quantity) * Decimal(sale_item.unit_price))
        gst_amt = _q2(line_base * Decimal(sale_item.gst_rate) / Decimal("100"))
        line_total = _q2(line_base + gst_amt)
        total_return_amount += line_total
        cogs_reversed += _q2(Decimal(req_item.quantity) * Decimal(sale_item.cost_price))

        ret_items.append(
            SaleReturnItem(
                product_id=req_item.product_id,
                quantity=req_item.quantity,
                unit_price=sale_item.unit_price,
                gst_amount=gst_amt,
                total_amount=line_total,
            )
        )

        apply_stock_movement(
            db,
            product_id=req_item.product_id,
            branch_id=sale.branch_id,
            transaction_type="RETURNED_IN",
            quantity_change=Decimal(req_item.quantity),
            unit_cost=sale_item.cost_price,
            reference_type="SALE_RETURN",
            reference_number=return_number,
            notes=payload.reason or f"Sales return against {sale.invoice_number}",
            user_id=user_id,
        )

    ret = SaleReturn(
        return_number=return_number,
        sale_id=sale.id,
        customer_id=sale.customer_id,
        branch_id=sale.branch_id,
        return_date=payload.return_date,
        reason=payload.reason,
        total_amount=total_return_amount,
        created_by=user_id,
        items=ret_items,
    )
    db.add(ret)

    sale.total_cogs = max(Decimal("0.00"), Decimal(sale.total_cogs) - cogs_reversed)
    if payload.refund_to_customer:
        account = resolve_account(db, payload.account_id, payload.payment_mode)
        record_financial_entry(
            db,
            account_id=account.id,
            tx_date=payload.return_date,
            tx_type="ADJUSTMENT",
            debit=total_return_amount,
            credit=Decimal("0.00"),
            payment_mode=payload.payment_mode,
            description=f"Cash/Bank refund for Sales Return {return_number} ({sale.invoice_number})",
            reference_type="SALE_RETURN",
            reference_number=return_number,
            user_id=user_id,
        )
    else:
        sale.pending_amount = max(Decimal("0.00"), Decimal(sale.pending_amount) - total_return_amount)
        if sale.pending_amount == Decimal("0.00"):
            sale.payment_status = "PAID"
        if sale.customer_id:
            customer = db.scalar(select(Customer).where(Customer.id == sale.customer_id).with_for_update())
            if customer:
                customer.outstanding_balance = Decimal(customer.outstanding_balance) - total_return_amount

    db.flush()
    return ret

