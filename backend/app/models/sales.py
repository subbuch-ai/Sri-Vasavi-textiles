from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class CustomerOrder(Base, TimestampMixin):
    """Wholesale and retail customer orders convertible into sales invoices without double stock deduction."""

    __tablename__ = "customer_orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    expected_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    order_type: Mapped[str] = mapped_column(String(20), default="WHOLESALE", nullable=False)
    order_source: Mapped[str] = mapped_column(String(20), default="ERP", nullable=False, index=True)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    delivery_charge: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    advance_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    remaining_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)

    order_status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False, index=True)
    payment_status: Mapped[str] = mapped_column(String(20), default="UNPAID", nullable=False, index=True)
    payment_method: Mapped[str] = mapped_column(String(30), default="CASH", nullable=False)
    converted_sale_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sales.id", ondelete="SET NULL", use_alter=True, name="fk_order_converted_sale"),
        unique=True,
        nullable=True,
    )
    stock_deducted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stock_reserved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shipping_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    shipping_mobile: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    shipping_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shipping_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    shipping_state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    shipping_pincode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cancellation_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    customer = relationship("Customer")
    items: Mapped[List["CustomerOrderItem"]] = relationship(
        "CustomerOrderItem", back_populates="order", cascade="all, delete-orphan"
    )
    status_history = relationship(
        "OrderStatusHistory", back_populates="order", cascade="all, delete-orphan", order_by="OrderStatusHistory.created_at"
    )
    delivery_detail = relationship("DeliveryDetail", back_populates="order", uselist=False, cascade="all, delete-orphan")


class CustomerOrderItem(Base):
    """Line items within a customer order."""

    __tablename__ = "customer_order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("5.00"), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    order: Mapped["CustomerOrder"] = relationship("CustomerOrder", back_populates="items")
    product = relationship("Product")


class Sale(Base, TimestampMixin):
    """Wholesale and retail sales invoices with GST breakdown, COGS tracking, and payment status."""

    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    invoice_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    customer_name_snapshot: Mapped[str] = mapped_column(String(200), default="Walk-in Customer", nullable=False)
    customer_order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True)
    sale_type: Mapped[str] = mapped_column(String(20), default="RETAIL", nullable=False, index=True)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    cgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    sgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    igst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    delivery_charge: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    round_off: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    total_cogs: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    pending_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(20), default="PAID", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="CONFIRMED", nullable=False, index=True)
    payment_mode: Mapped[str] = mapped_column(String(30), default="CASH", nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    customer = relationship("Customer")
    items: Mapped[List["SaleItem"]] = relationship(
        "SaleItem", back_populates="sale", cascade="all, delete-orphan"
    )


class SaleItem(Base):
    """Line items within a sale invoice, storing cost_price snapshot for accurate Profit & Loss."""

    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    returned_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=Decimal("0.000"), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("5.00"), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    sale: Mapped["Sale"] = relationship("Sale", back_populates="items")
    product = relationship("Product")


class SaleReturn(Base):
    """Customer sales return / credit note restoring inventory and adjusting revenue/receivable."""

    __tablename__ = "sale_returns"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    return_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="RESTRICT"), nullable=False, index=True)
    customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False)
    return_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    items: Mapped[List["SaleReturnItem"]] = relationship(
        "SaleReturnItem", back_populates="sale_return", cascade="all, delete-orphan"
    )


class SaleReturnItem(Base):
    """Line items within a sales return."""

    __tablename__ = "sale_return_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_return_id: Mapped[int] = mapped_column(
        ForeignKey("sale_returns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    sale_return: Mapped["SaleReturn"] = relationship("SaleReturn", back_populates="items")
    product = relationship("Product")

