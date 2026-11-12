from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Account(Base, TimestampMixin):
    """Cash, Bank, and Ledger accounts for Cash Book, Bank Book, and Financial Accounting."""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    account_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)

    bank_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    account_number: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    ifsc_code: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    upi_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Payment(Base):
    """Customer collections (INBOUND) and Supplier payouts (OUTBOUND)."""

    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_date_direction", "payment_date", "direction"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    payment_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    party_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    supplier_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    sale_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sales.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purchase_invoice_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("purchase_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True)

    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(30), default="CASH", nullable=False)
    reference_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="APPROVED", nullable=False, index=True)

    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    account = relationship("Account")
    customer = relationship("Customer")
    supplier = relationship("Supplier")


class Expense(Base, TimestampMixin):
    """Operating expenses with categories, bill attachments, and approval workflow."""

    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    expense_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    payment_mode: Mapped[str] = mapped_column(String(30), default="CASH", nullable=False)
    account_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    vendor_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    attachment_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    approval_status: Mapped[str] = mapped_column(String(20), default="APPROVED", nullable=False, index=True)
    approved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    account = relationship("Account")


class FinancialTransaction(Base):
    """Double-entry-inspired cash/bank transaction ledger powering Cash Book, Bank Book & Cash Flow."""

    __tablename__ = "financial_transactions"
    __table_args__ = (
        Index("ix_fin_tx_date_account", "transaction_date", "account_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    transaction_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)

    reference_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[Optional[int]] = mapped_column(nullable=True)
    reference_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(30), default="CASH", nullable=False)

    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    account = relationship("Account")

