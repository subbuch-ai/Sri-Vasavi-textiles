from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.sales import CustomerOrderItemOut


# ---------------- Customer Auth & Profile ----------------
class CustomerRegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    mobile: str = Field(min_length=8, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    customer_type: str = Field(default="RETAIL", pattern="^(RETAIL|WHOLESALE)$")
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    business_name: Optional[str] = None
    gst_number: Optional[str] = None
    estimated_monthly_volume: Optional[str] = None


class CustomerLoginRequest(BaseModel):
    email_or_mobile: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=1, max_length=128)


class CustomerForgotPasswordRequest(BaseModel):
    email: EmailStr


class CustomerResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=6, max_length=128)


class CustomerProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    gst_number: Optional[str] = None


class CustomerAddressCreate(BaseModel):
    label: str = Field(default="Home", max_length=50)
    recipient_name: str = Field(min_length=2, max_length=150)
    mobile: str = Field(min_length=8, max_length=20)
    address_line1: str = Field(min_length=5)
    address_line2: Optional[str] = None
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pincode: str = Field(min_length=4, max_length=20)
    is_default: bool = False


class CustomerAddressUpdate(BaseModel):
    label: Optional[str] = None
    recipient_name: Optional[str] = None
    mobile: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    is_default: Optional[bool] = None


class CustomerAddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    label: str
    recipient_name: str
    mobile: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    is_default: bool


class CustomerMeOut(BaseModel):
    id: int
    customer_id: int
    customer_code: str
    name: str
    email: str
    mobile: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    customer_type: str
    wholesale_status: str
    is_wholesale_approved: bool
    gst_number: Optional[str] = None
    credit_limit: Decimal
    outstanding_balance: Decimal
    addresses: List[CustomerAddressOut] = []


class CustomerAuthOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    customer: CustomerMeOut


# ---------------- Public Storefront & Catalogue ----------------
class StoreProductImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: str
    alt_text: Optional[str] = None
    display_order: int
    is_primary: bool


class StoreProductOut(BaseModel):
    id: int
    product_code: str
    name: str
    category_id: int
    category_name: str
    category_code: str
    brand: Optional[str] = None
    description: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    available_sizes: List[str] = []
    available_colors: List[str] = []
    fabric_type: Optional[str] = None
    hsn_code: Optional[str] = None
    unit: str
    retail_price: Decimal
    wholesale_price: Optional[Decimal] = None  # strictly None unless is_wholesale_approved
    wholesale_eligible: bool = True
    wholesale_min_qty: Decimal = Decimal("5.000")
    gst_rate: Decimal
    available_stock: Decimal
    in_stock: bool
    image_url: Optional[str] = None
    images: List[StoreProductImageOut] = []
    is_featured: bool
    is_new_arrival: bool
    is_best_seller: bool
    specifications: Optional[Dict[str, Any]] = None
    created_at: datetime


class StoreBannerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    subtitle: Optional[str] = None
    badge_text: Optional[str] = None
    image_url: Optional[str] = None
    cta_text: str
    cta_link: str
    display_order: int
    is_active: bool


class StorePromotionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    title: str
    description: Optional[str] = None
    discount_type: str
    discount_value: Decimal
    min_order_amount: Decimal
    max_discount_amount: Optional[Decimal] = None
    applicable_customer_type: str
    ends_at: Optional[datetime] = None


class StorefrontConfigPublicOut(BaseModel):
    store_enabled: bool
    business_name: str
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    hero_title: str
    hero_subtitle: str
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    whatsapp_number: Optional[str] = None
    free_delivery_threshold: Decimal
    standard_delivery_charge: Decimal
    cod_enabled: bool
    upi_enabled: bool
    upi_id: Optional[str] = None
    bank_transfer_enabled: bool
    bank_details_text: Optional[str] = None
    gateway_provider: str
    razorpay_enabled: bool
    razorpay_key_id: Optional[str] = None
    cancellation_policy_text: str
    return_policy_text: str
    privacy_policy_text: str


# ---------------- Shopping Cart ----------------
class CartItemAdd(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)
    selected_size: str = Field(default="", max_length=40)
    selected_color: str = Field(default="", max_length=40)


class CartItemUpdate(BaseModel):
    quantity: Decimal = Field(ge=0)
    selected_size: Optional[str] = None
    selected_color: Optional[str] = None


class CartPromoApply(BaseModel):
    promo_code: Optional[str] = None


class CartItemOut(BaseModel):
    id: int
    product_id: int
    product_code: str
    product_name: str
    category_name: str
    image_url: Optional[str] = None
    unit: str
    selected_size: str
    selected_color: str
    quantity: Decimal
    available_stock: Decimal
    unit_price: Decimal
    pricing_tier: str  # RETAIL | WHOLESALE
    wholesale_min_qty: Decimal
    gst_rate: Decimal
    line_subtotal: Decimal
    line_gst: Decimal
    line_total: Decimal


class CartOut(BaseModel):
    items: List[CartItemOut] = []
    item_count: int = 0
    promo_code: Optional[str] = None
    promo_message: Optional[str] = None
    subtotal: Decimal = Decimal("0.00")
    discount_amount: Decimal = Decimal("0.00")
    gst_amount: Decimal = Decimal("0.00")
    delivery_charge: Decimal = Decimal("0.00")
    total_amount: Decimal = Decimal("0.00")


# ---------------- Checkout & Gateway ----------------
class StoreCheckoutRequest(BaseModel):
    address_id: Optional[int] = None
    recipient_name: str = Field(min_length=2, max_length=150)
    mobile: str = Field(min_length=8, max_length=20)
    address: str = Field(min_length=5)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pincode: str = Field(min_length=4, max_length=20)
    payment_method: str = Field(default="COD", pattern="^(COD|UPI|RAZORPAY|BANK_TRANSFER)$")
    promo_code: Optional[str] = None
    notes: Optional[str] = None


class RazorpayVerifyRequest(BaseModel):
    order_id: int
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class ManualPaymentVerifyRequest(BaseModel):
    order_id: int
    transaction_reference: str = Field(min_length=3, max_length=120)
    notes: Optional[str] = None


class OrderCancelRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class OrderStatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    notes: Optional[str] = None
    changed_by_type: str
    created_at: datetime


class DeliveryDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    courier_name: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    dispatched_at: Optional[datetime] = None
    estimated_delivery_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    notes: Optional[str] = None


class OnlinePaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    gateway_name: str
    payment_method: str
    gateway_order_id: Optional[str] = None
    gateway_payment_id: Optional[str] = None
    amount: Decimal
    currency: str
    status: str
    verified_server_side: bool
    created_at: datetime


class StoreOrderOut(BaseModel):
    id: int
    order_number: str
    order_date: str
    order_type: str
    order_source: str
    order_status: str
    payment_status: str
    payment_method: str
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    delivery_charge: Decimal
    total_amount: Decimal
    advance_amount: Decimal
    remaining_amount: Decimal
    shipping_name: Optional[str] = None
    shipping_mobile: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None
    shipping_pincode: Optional[str] = None
    cancellation_requested: bool
    cancellation_reason: Optional[str] = None
    converted_sale_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    items: List[CustomerOrderItemOut] = []
    status_history: List[OrderStatusHistoryOut] = []
    delivery_detail: Optional[DeliveryDetailOut] = None
    online_payment: Optional[OnlinePaymentOut] = None


class StoreCheckoutOut(BaseModel):
    order: StoreOrderOut
    razorpay_order_id: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    amount_paise: Optional[int] = None


# ---------------- Wholesale Applications & Enquiries ----------------
class WholesaleApplicationCreate(BaseModel):
    business_name: str = Field(min_length=2, max_length=200)
    gst_number: Optional[str] = Field(default=None, max_length=30)
    shop_address: str = Field(min_length=5)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pincode: str = Field(min_length=4, max_length=20)
    contact_name: str = Field(min_length=2, max_length=150)
    contact_mobile: str = Field(min_length=8, max_length=20)
    contact_email: Optional[EmailStr] = None
    estimated_monthly_volume: Optional[str] = None
    notes: Optional[str] = None


class WholesaleApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    business_name: str
    gst_number: Optional[str] = None
    shop_address: str
    city: str
    state: str
    pincode: str
    contact_name: str
    contact_mobile: str
    contact_email: Optional[str] = None
    estimated_monthly_volume: Optional[str] = None
    notes: Optional[str] = None
    status: str
    admin_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime


class WholesaleApplicationReview(BaseModel):
    status: str = Field(pattern="^(APPROVED|REJECTED)$")
    admin_notes: Optional[str] = None


class WholesaleEnquiryCreate(BaseModel):
    product_id: Optional[int] = None
    contact_name: str = Field(min_length=2, max_length=150)
    business_name: Optional[str] = None
    mobile: str = Field(min_length=8, max_length=20)
    email: Optional[EmailStr] = None
    requested_quantity: Decimal = Field(gt=0)
    target_price: Optional[Decimal] = Field(default=None, ge=0)
    message: str = Field(min_length=5)


class WholesaleEnquiryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    enquiry_number: str
    customer_id: Optional[int] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    contact_name: str
    business_name: Optional[str] = None
    mobile: str
    email: Optional[str] = None
    requested_quantity: Decimal
    target_price: Optional[Decimal] = None
    message: str
    status: str
    quoted_price: Optional[Decimal] = None
    admin_response: Optional[str] = None
    created_at: datetime


class WholesaleEnquiryRespond(BaseModel):
    status: str = Field(pattern="^(QUOTED|CONVERTED|CLOSED)$")
    quoted_price: Optional[Decimal] = Field(default=None, ge=0)
    admin_response: str = Field(min_length=2)


# ---------------- ERP Storefront Admin Schemas ----------------
class BannerCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    subtitle: Optional[str] = None
    badge_text: Optional[str] = None
    image_url: Optional[str] = None
    cta_text: str = "Shop Collection"
    cta_link: str = "/shop/catalog"
    display_order: int = 0
    is_active: bool = True


class BannerUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    badge_text: Optional[str] = None
    image_url: Optional[str] = None
    cta_text: Optional[str] = None
    cta_link: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class PromotionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    title: str = Field(min_length=2, max_length=160)
    description: Optional[str] = None
    discount_type: str = Field(default="PERCENT", pattern="^(PERCENT|FLAT)$")
    discount_value: Decimal = Field(gt=0)
    min_order_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    max_discount_amount: Optional[Decimal] = Field(default=None, ge=0)
    applicable_customer_type: str = Field(default="ALL", pattern="^(ALL|RETAIL|WHOLESALE)$")
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True


class PromotionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    discount_type: Optional[str] = Field(default=None, pattern="^(PERCENT|FLAT)$")
    discount_value: Optional[Decimal] = Field(default=None, gt=0)
    min_order_amount: Optional[Decimal] = Field(default=None, ge=0)
    max_discount_amount: Optional[Decimal] = None
    applicable_customer_type: Optional[str] = Field(default=None, pattern="^(ALL|RETAIL|WHOLESALE)$")
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class StorefrontConfigAdminOut(StorefrontConfigPublicOut):
    has_razorpay_secret: bool = False
    email_notifications_enabled: bool = False
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    has_smtp_password: bool = False
    smtp_from_email: Optional[str] = None
    whatsapp_enabled: bool = False
    whatsapp_api_url: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    has_whatsapp_token: bool = False


class StorefrontConfigUpdate(BaseModel):
    store_enabled: Optional[bool] = None
    hero_title: Optional[str] = None
    hero_subtitle: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    whatsapp_number: Optional[str] = None
    free_delivery_threshold: Optional[Decimal] = Field(default=None, ge=0)
    standard_delivery_charge: Optional[Decimal] = Field(default=None, ge=0)
    cod_enabled: Optional[bool] = None
    upi_enabled: Optional[bool] = None
    upi_id: Optional[str] = None
    bank_transfer_enabled: Optional[bool] = None
    bank_details_text: Optional[str] = None
    gateway_provider: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None
    email_notifications_enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    whatsapp_enabled: Optional[bool] = None
    whatsapp_api_url: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    cancellation_policy_text: Optional[str] = None
    return_policy_text: Optional[str] = None
    privacy_policy_text: Optional[str] = None


class DeliveryDetailUpdate(BaseModel):
    courier_name: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    estimated_delivery_at: Optional[datetime] = None
    notes: Optional[str] = None


class CustomerNotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: Optional[int] = None
    title: str
    message: str
    channel: str
    delivery_status: str
    is_read: bool
    created_at: datetime

