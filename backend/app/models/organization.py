from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin

JSONType = JSON().with_variant(JSONB(), "postgresql")


class Branch(Base, TimestampMixin):
    """Store / Warehouse branches to support scalable multi-branch operations and transfers."""

    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class BusinessSettings(Base):
    """Singleton business configuration for Sri Vasavi Textiles."""

    __tablename__ = "business_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_name: Mapped[str] = mapped_column(String(200), default="Sri Vasavi Textiles", nullable=False)
    tagline: Mapped[Optional[str]] = mapped_column(String(255), default="Wholesale & Retail Textile Trading", nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pincode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    gstin: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    invoice_prefix: Mapped[str] = mapped_column(String(20), default="SVT-INV-", nullable=False)
    next_invoice_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    po_prefix: Mapped[str] = mapped_column(String(20), default="SVT-PO-", nullable=False)
    next_po_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    order_prefix: Mapped[str] = mapped_column(String(20), default="SVT-ORD-", nullable=False)
    next_order_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    currency_code: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)
    currency_symbol: Mapped[str] = mapped_column(String(10), default="₹", nullable=False)
    financial_year: Mapped[str] = mapped_column(String(20), default="2026-2027", nullable=False)
    default_gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("5.00"), nullable=False)

    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    low_stock_alert_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    require_expense_approval: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expense_approval_threshold: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("5000.00"), nullable=False
    )

    payment_methods: Mapped[Dict[str, Any]] = mapped_column(
        JSONType,
        default=lambda: {"methods": ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "CREDIT"]},
        nullable=False,
    )
    tax_settings: Mapped[Dict[str, Any]] = mapped_column(
        JSONType,
        default=lambda: {"gst_enabled": True, "default_rates": [0, 5, 12, 18], "split_cgst_sgst": True},
        nullable=False,
    )

    updated_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AuditLog(Base):
    """Immutable audit trail for security, compliance, and employee activity monitoring."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    old_values: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    new_values: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class Notification(Base):
    """System notifications for low stock alerts, pending approvals, and orders."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="INFO", nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

