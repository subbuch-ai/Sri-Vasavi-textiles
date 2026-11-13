from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin

JSONType = JSON().with_variant(JSONB(), "postgresql")


class CustomerAccount(Base, TimestampMixin):
    """Storefront login credentials for retail & wholesale customers, strictly isolated from ERP users."""

    __tablename__ = "customer_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    mobile: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reset_token_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    reset_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    customer = relationship("Customer", back_populates="account")


class CustomerRefreshToken(Base):
    """Hashed refresh tokens for storefront customer sessions."""

    __tablename__ = "customer_refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_account_id: Mapped[int] = mapped_column(
        ForeignKey("customer_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CustomerAddress(Base, TimestampMixin):
    """Saved delivery addresses for storefront checkout."""

    __tablename__ = "customer_addresses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(50), default="Home", nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(150), nullable=False)
    mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    address_line1: Mapped[str] = mapped_column(Text, nullable=False)
    address_line2: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    pincode: Mapped[str] = mapped_column(String(20), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    customer = relationship("Customer", back_populates="addresses")


class CustomerCart(Base, TimestampMixin):
    """Persistent storefront shopping cart per customer."""

    __tablename__ = "customer_carts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    promo_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    items: Mapped[List["CartItem"]] = relationship(
        "CartItem", back_populates="cart", cascade="all, delete-orphan"
    )


class CartItem(Base):
    """Line item inside a customer's shopping cart."""

    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "product_id", "selected_size", "selected_color", name="uq_cart_product_variant"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cart_id: Mapped[int] = mapped_column(
        ForeignKey("customer_carts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    selected_size: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    selected_color: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    cart: Mapped["CustomerCart"] = relationship("CustomerCart", back_populates="items")
    product = relationship("Product")


class WholesaleApplication(Base, TimestampMixin):
    """B2B wholesale buyer verification requests reviewed by Owner/Admin."""

    __tablename__ = "wholesale_applications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    business_name: Mapped[str] = mapped_column(String(200), nullable=False)
    gst_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    shop_address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    pincode: Mapped[str] = mapped_column(String(20), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    contact_email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    estimated_monthly_volume: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    customer = relationship("Customer")


class WholesaleEnquiry(Base, TimestampMixin):
    """Bulk order enquiries and negotiated pricing requests from wholesale buyers."""

    __tablename__ = "wholesale_enquiries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    enquiry_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    product_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    contact_name: Mapped[str] = mapped_column(String(150), nullable=False)
    business_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    requested_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=Decimal("10.000"), nullable=False)
    target_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False, index=True)
    quoted_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    admin_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    responded_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    customer = relationship("Customer")
    product = relationship("Product")


class ProductImage(Base):
    """Multiple product gallery images shared between ERP product manager and Storefront."""

    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    alt_text: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product = relationship("Product", back_populates="images")


class StorefrontBanner(Base, TimestampMixin):
    """Promotional homepage banners managed by the Owner in ERP Storefront Admin."""

    __tablename__ = "storefront_banners"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    subtitle: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    badge_text: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cta_text: Mapped[str] = mapped_column(String(80), default="Shop Collection", nullable=False)
    cta_link: Mapped[str] = mapped_column(String(255), default="/shop/catalog", nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class Promotion(Base, TimestampMixin):
    """Storefront discount codes and promotional offers managed in ERP."""

    __tablename__ = "promotions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discount_type: Mapped[str] = mapped_column(String(20), default="PERCENT", nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    min_order_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    max_discount_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    applicable_customer_type: Mapped[str] = mapped_column(String(20), default="ALL", nullable=False)
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class OnlinePayment(Base, TimestampMixin):
    """Online gateway payment records (Razorpay / UPI / Bank Transfer) tied to CustomerOrder."""

    __tablename__ = "online_payments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    gateway_name: Mapped[str] = mapped_column(String(30), default="RAZORPAY", nullable=False)
    payment_method: Mapped[str] = mapped_column(String(30), default="RAZORPAY", nullable=False)
    gateway_order_id: Mapped[Optional[str]] = mapped_column(String(120), unique=True, nullable=True, index=True)
    gateway_payment_id: Mapped[Optional[str]] = mapped_column(String(120), unique=True, nullable=True, index=True)
    gateway_signature: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    verified_server_side: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONType, nullable=True)

    order = relationship("CustomerOrder")
    transactions: Mapped[List["PaymentTransaction"]] = relationship(
        "PaymentTransaction", back_populates="online_payment", cascade="all, delete-orphan"
    )


class PaymentTransaction(Base):
    """Append-only gateway capture & refund transaction log."""

    __tablename__ = "payment_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    online_payment_id: Mapped[int] = mapped_column(
        ForeignKey("online_payments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)  # CAPTURE | REFUND
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    gateway_reference: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    online_payment: Mapped["OnlinePayment"] = relationship("OnlinePayment", back_populates="transactions")


class OrderStatusHistory(Base):
    """Audit timeline of every status change on a CustomerOrder."""

    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by_type: Mapped[str] = mapped_column(String(20), default="SYSTEM", nullable=False)
    changed_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order = relationship("CustomerOrder", back_populates="status_history")


class DeliveryDetail(Base, TimestampMixin):
    """Courier tracking and dispatch info for an order."""

    __tablename__ = "delivery_details"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    courier_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tracking_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tracking_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_delivery_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    order = relationship("CustomerOrder", back_populates="delivery_detail")


class CustomerNotification(Base):
    """In-website, Email, and WhatsApp notification log for customers."""

    __tablename__ = "customer_notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(String(20), default="IN_APP", nullable=False)  # IN_APP | EMAIL | WHATSAPP
    delivery_status: Mapped[str] = mapped_column(String(20), default="SENT", nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class StorefrontConfig(Base):
    """Singleton Owner-controlled configuration for Customer E-Commerce Storefront."""

    __tablename__ = "storefront_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    hero_title: Mapped[str] = mapped_column(
        String(200), default="Authentic Silk, Cotton & Wholesale Apparel", nullable=False
    )
    hero_subtitle: Mapped[str] = mapped_column(
        String(400),
        default="Direct from Sri Vasavi Textiles — curated sarees, menswear, ethnic fabrics & B2B bulk collections.",
        nullable=False,
    )
    contact_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    contact_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    whatsapp_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    free_delivery_threshold: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("1500.00"), nullable=False
    )
    standard_delivery_charge: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("80.00"), nullable=False
    )

    cod_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    upi_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    upi_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bank_transfer_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bank_details_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    gateway_provider: Mapped[str] = mapped_column(String(30), default="RAZORPAY", nullable=False)
    razorpay_key_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    razorpay_key_secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    email_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    smtp_host: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    smtp_port: Mapped[int] = mapped_column(Integer, default=587, nullable=False)
    smtp_user: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    smtp_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    smtp_from_email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    whatsapp_api_url: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    whatsapp_access_token: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    whatsapp_phone_number_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    cancellation_policy_text: Mapped[str] = mapped_column(
        Text,
        default="Orders can be cancelled before dispatch (Order Placed / Confirmed / Processing). Verified online payments are refunded within 5–7 business days.",
        nullable=False,
    )
    return_policy_text: Mapped[str] = mapped_column(
        Text,
        default="7-day exchange or return for unused textiles with original tags and invoice.",
        nullable=False,
    )
    privacy_policy_text: Mapped[str] = mapped_column(
        Text,
        default="Customer contact and order details are used solely for order fulfillment, GST billing, and delivery updates.",
        nullable=False,
    )

    updated_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

