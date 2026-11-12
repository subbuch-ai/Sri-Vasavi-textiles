from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.models.finance import Account, FinancialTransaction, Payment
from app.models.parties import Customer, Supplier
from app.models.purchase import PurchaseInvoice
from app.models.sales import CustomerOrder, Sale
from app.schemas.finance import PaymentCreate
from app.services.numbering_service import generate_sequential_code


def resolve_account(db: Session, account_id: Optional[int], payment_mode: str = "CASH") -> Account:
    """Resolve explicit account_id or choose default Cash/Bank account matching payment_mode."""
    if account_id:
        acc = db.scalar(select(Account).where(Account.id == account_id, Account.is_active.is_(True)))
        if not acc:
            raise NotFoundError(f"Account #{account_id} not found or inactive.")
        return acc

    target_type = "CASH" if payment_mode == "CASH" else "BANK"
    acc = db.scalar(
        select(Account)
        .where(Account.account_type == target_type, Account.is_active.is_(True))
        .order_by(Account.is_default.desc(), Account.id)
    )
    if not acc:
        acc = db.scalar(select(Account).where(Account.is_active.is_(True)).order_by(Account.id))
    if not acc:
        raise ValidationError("No active Cash or Bank account is configured.")
    return acc


def record_financial_entry(
    db: Session,
    *,
    account_id: int,
    tx_date: date,
    tx_type: str,
    debit: Decimal = Decimal("0.00"),
    credit: Decimal = Decimal("0.00"),
    payment_mode: str = "CASH",
    description: str,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    reference_number: Optional[str] = None,
    user_id: Optional[int] = None,
) -> FinancialTransaction:
    """
    Append an entry to financial_transactions and update Account.current_balance atomically.
    Convention: credit increases cash/bank balance (+inflow), debit decreases balance (-outflow).
    """
    account = db.scalar(select(Account).where(Account.id == account_id).with_for_update())
    if not account:
        raise NotFoundError(f"Account #{account_id} not found.")

    account.current_balance = Decimal(account.current_balance) + Decimal(credit) - Decimal(debit)

    tx = FinancialTransaction(
        transaction_number=generate_sequential_code(db, FinancialTransaction, "transaction_number", "FIN-", 6),
        transaction_date=tx_date,
        account_id=account.id,
        transaction_type=tx_type,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_number=reference_number,
        description=description,
        debit=debit,
        credit=credit,
        payment_mode=payment_mode,
        created_by=user_id,
    )
    db.add(tx)
    db.flush()
    return tx


def create_payment_record(
    db: Session,
    payload: PaymentCreate,
    user_id: Optional[int],
) -> Payment:
    """
    Record a customer collection (INBOUND) or supplier payment (OUTBOUND),
    updating linked invoice/order, party outstanding balance, account balance,
    and financial transaction ledger atomically.
    """
    account = resolve_account(db, payload.account_id, payload.payment_mode)
    amount = Decimal(payload.amount)

    if payload.party_type == "CUSTOMER":
        if payload.direction != "INBOUND":
            raise ValidationError("Customer collections must use direction INBOUND.")
        if not payload.customer_id:
            raise ValidationError("customer_id is required for CUSTOMER payments.")
        customer = db.scalar(select(Customer).where(Customer.id == payload.customer_id).with_for_update())
        if not customer:
            raise NotFoundError("Customer not found.")

        sale_ref_num = None
        effective_sale_id = payload.sale_id
        if payload.sale_id:
            sale = db.scalar(select(Sale).where(Sale.id == payload.sale_id).with_for_update())
            if not sale:
                raise NotFoundError("Linked sales invoice not found.")
            if sale.customer_id != customer.id:
                raise ValidationError("Linked sales invoice belongs to a different customer.")
            if amount > sale.pending_amount:
                raise ValidationError(
                    f"Payment amount ({amount}) exceeds pending invoice balance ({sale.pending_amount})."
                )
            sale.paid_amount = Decimal(sale.paid_amount) + amount
            sale.pending_amount = Decimal(sale.total_amount) - Decimal(sale.paid_amount)
            sale.payment_status = "PAID" if sale.pending_amount <= Decimal("0.00") else "PARTIAL"
            sale_ref_num = sale.invoice_number
        elif not payload.customer_order_id:
            # FIFO allocate customer collections across oldest pending sales invoices
            remaining = amount
            pending_sales = db.scalars(
                select(Sale)
                .where(
                    Sale.customer_id == customer.id,
                    Sale.status == "CONFIRMED",
                    Sale.pending_amount > 0,
                )
                .order_by(Sale.sale_date.asc(), Sale.id.asc())
                .with_for_update()
            ).all()
            allocated_sales: list[Sale] = []
            for pending_sale in pending_sales:
                if remaining <= Decimal("0.00"):
                    break
                apply_amt = min(remaining, Decimal(pending_sale.pending_amount))
                pending_sale.paid_amount = Decimal(pending_sale.paid_amount) + apply_amt
                pending_sale.pending_amount = Decimal(pending_sale.total_amount) - Decimal(pending_sale.paid_amount)
                pending_sale.payment_status = "PAID" if pending_sale.pending_amount <= Decimal("0.00") else "PARTIAL"
                remaining -= apply_amt
                allocated_sales.append(pending_sale)
            if len(allocated_sales) == 1:
                effective_sale_id = allocated_sales[0].id
            if allocated_sales:
                sale_ref_num = ", ".join(s.invoice_number for s in allocated_sales)

        if payload.customer_order_id:
            order = db.scalar(
                select(CustomerOrder).where(CustomerOrder.id == payload.customer_order_id).with_for_update()
            )
            if not order:
                raise NotFoundError("Linked customer order not found.")
            order.advance_amount = Decimal(order.advance_amount) + amount
            order.remaining_amount = max(Decimal("0.00"), Decimal(order.total_amount) - order.advance_amount)
            order.payment_status = "PAID" if order.remaining_amount == Decimal("0.00") else "PARTIAL"
            sale_ref_num = sale_ref_num or order.order_number

        customer.total_payments = Decimal(customer.total_payments) + amount
        customer.outstanding_balance = Decimal(customer.outstanding_balance) - amount

        payment = Payment(
            payment_number=generate_sequential_code(db, Payment, "payment_number", "PAY-", 6),
            payment_date=payload.payment_date,
            direction="INBOUND",
            party_type="CUSTOMER",
            customer_id=customer.id,
            sale_id=effective_sale_id,
            customer_order_id=payload.customer_order_id,
            account_id=account.id,
            amount=amount,
            payment_mode=payload.payment_mode,
            reference_number=payload.reference_number,
            notes=payload.notes,
            status="APPROVED",
            created_by=user_id,
            approved_by=user_id,
        )
        db.add(payment)
        db.flush()

        record_financial_entry(
            db,
            account_id=account.id,
            tx_date=payload.payment_date,
            tx_type="CUSTOMER_RECEIPT",
            debit=Decimal("0.00"),
            credit=amount,
            payment_mode=payload.payment_mode,
            description=f"Customer collection from {customer.name}" + (f" ({sale_ref_num})" if sale_ref_num else ""),
            reference_type="PAYMENT",
            reference_id=payment.id,
            reference_number=payment.payment_number,
            user_id=user_id,
        )
        return payment

    else:
        if payload.direction != "OUTBOUND":
            raise ValidationError("Supplier payments must use direction OUTBOUND.")
        if not payload.supplier_id:
            raise ValidationError("supplier_id is required for SUPPLIER payments.")
        supplier = db.scalar(select(Supplier).where(Supplier.id == payload.supplier_id).with_for_update())
        if not supplier:
            raise NotFoundError("Supplier not found.")

        inv_ref_num = None
        effective_purchase_id = payload.purchase_invoice_id
        if payload.purchase_invoice_id:
            inv = db.scalar(
                select(PurchaseInvoice).where(PurchaseInvoice.id == payload.purchase_invoice_id).with_for_update()
            )
            if not inv:
                raise NotFoundError("Linked purchase invoice not found.")
            if inv.supplier_id != supplier.id:
                raise ValidationError("Linked purchase invoice belongs to a different supplier.")
            if amount > inv.pending_amount:
                raise ValidationError(
                    f"Payment amount ({amount}) exceeds pending invoice balance ({inv.pending_amount})."
                )
            inv.paid_amount = Decimal(inv.paid_amount) + amount
            inv.pending_amount = Decimal(inv.total_amount) - Decimal(inv.paid_amount)
            inv.payment_status = "PAID" if inv.pending_amount <= Decimal("0.00") else "PARTIAL"
            inv_ref_num = inv.invoice_number
        else:
            # FIFO allocate supplier payouts across oldest pending purchase bills
            remaining = amount
            pending_bills = db.scalars(
                select(PurchaseInvoice)
                .where(
                    PurchaseInvoice.supplier_id == supplier.id,
                    PurchaseInvoice.status != "CANCELLED",
                    PurchaseInvoice.pending_amount > 0,
                )
                .order_by(PurchaseInvoice.invoice_date.asc(), PurchaseInvoice.id.asc())
                .with_for_update()
            ).all()
            allocated_bills: list[PurchaseInvoice] = []
            for bill in pending_bills:
                if remaining <= Decimal("0.00"):
                    break
                apply_amt = min(remaining, Decimal(bill.pending_amount))
                bill.paid_amount = Decimal(bill.paid_amount) + apply_amt
                bill.pending_amount = Decimal(bill.total_amount) - Decimal(bill.paid_amount)
                bill.payment_status = "PAID" if bill.pending_amount <= Decimal("0.00") else "PARTIAL"
                remaining -= apply_amt
                allocated_bills.append(bill)
            if len(allocated_bills) == 1:
                effective_purchase_id = allocated_bills[0].id
            if allocated_bills:
                inv_ref_num = ", ".join(b.invoice_number for b in allocated_bills)

        supplier.total_payments = Decimal(supplier.total_payments) + amount
        supplier.outstanding_balance = Decimal(supplier.outstanding_balance) - amount

        payment = Payment(
            payment_number=generate_sequential_code(db, Payment, "payment_number", "PAY-", 6),
            payment_date=payload.payment_date,
            direction="OUTBOUND",
            party_type="SUPPLIER",
            supplier_id=supplier.id,
            purchase_invoice_id=effective_purchase_id,
            account_id=account.id,
            amount=amount,
            payment_mode=payload.payment_mode,
            reference_number=payload.reference_number,
            notes=payload.notes,
            status="APPROVED",
            created_by=user_id,
            approved_by=user_id,
        )
        db.add(payment)
        db.flush()

        record_financial_entry(
            db,
            account_id=account.id,
            tx_date=payload.payment_date,
            tx_type="SUPPLIER_PAYMENT",
            debit=amount,
            credit=Decimal("0.00"),
            payment_mode=payload.payment_mode,
            description=f"Supplier payment to {supplier.company_name}" + (f" ({inv_ref_num})" if inv_ref_num else ""),
            reference_type="PAYMENT",
            reference_id=payment.id,
            reference_number=payment.payment_number,
            user_id=user_id,
        )
        return payment

