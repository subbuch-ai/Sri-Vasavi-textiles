from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Optional[Decimal] = Field(default=None, ge=0)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    gst_rate: Optional[Decimal] = Field(default=None, ge=0, le=28)


class CustomerOrderCreate(BaseModel):
    customer_id: int
    branch_id: Optional[int] = None
    order_date: date
    expected_delivery_date: Optional[date] = None
    order_type: str = Field(default="WHOLESALE", pattern="^(WHOLESALE|RETAIL)$")
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    advance_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    payment_mode: str = Field(default="CASH")
    account_id: Optional[int] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate] = Field(min_length=1)


class CustomerOrderUpdate(BaseModel):
    expected_delivery_date: Optional[date] = None
    order_status: Optional[str] = Field(
        default=None,
        pattern="^(ORDER_PLACED|PENDING|CONFIRMED|PROCESSING|READY_FOR_DISPATCH|READY_FOR_DELIVERY|SHIPPED|DISPATCHED|DELIVERED|CANCELLED)$",
    )
    notes: Optional[str] = None
    items: Optional[List[OrderItemCreate]] = None


class CustomerOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    gst_rate: Decimal
    gst_amount: Decimal
    total_amount: Decimal


class CustomerOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_id: int
    customer_name: Optional[str] = None
    branch_id: int
    order_date: date
    expected_delivery_date: Optional[date] = None
    order_type: str
    order_source: str = "ERP"
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    delivery_charge: Decimal = Decimal("0.00")
    total_amount: Decimal
    advance_amount: Decimal
    remaining_amount: Decimal
    order_status: str
    payment_status: str
    payment_method: str = "CASH"
    converted_sale_id: Optional[int] = None
    stock_deducted: bool
    stock_reserved: bool = False
    shipping_name: Optional[str] = None
    shipping_mobile: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None
    shipping_pincode: Optional[str] = None
    cancellation_requested: bool = False
    cancellation_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    items: List[CustomerOrderItemOut] = []


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Optional[Decimal] = Field(default=None, ge=0)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    gst_rate: Optional[Decimal] = Field(default=None, ge=0, le=28)


class SaleCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name_snapshot: Optional[str] = Field(default=None, max_length=200)
    branch_id: Optional[int] = None
    sale_type: str = Field(default="RETAIL", pattern="^(WHOLESALE|RETAIL)$")
    sale_date: date
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    delivery_charge: Decimal = Field(default=Decimal("0.00"), ge=0)
    is_interstate: bool = False
    paid_amount: Optional[Decimal] = Field(default=None, ge=0)
    payment_mode: str = Field(default="CASH")
    account_id: Optional[int] = None
    notes: Optional[str] = None
    items: List[SaleItemCreate] = Field(min_length=1)


class ConvertOrderToSaleRequest(BaseModel):
    sale_date: Optional[date] = None
    additional_paid_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    payment_mode: str = Field(default="CASH")
    account_id: Optional[int] = None
    is_interstate: bool = False
    notes: Optional[str] = None


class SaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    hsn_code: Optional[str] = None
    unit: Optional[str] = None
    quantity: Decimal
    returned_quantity: Decimal
    unit_price: Decimal
    cost_price: Decimal
    discount_amount: Decimal
    gst_rate: Decimal
    gst_amount: Decimal
    total_amount: Decimal


class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    customer_id: Optional[int] = None
    customer_name_snapshot: str
    customer_order_id: Optional[int] = None
    branch_id: int
    sale_type: str
    sale_date: date
    subtotal: Decimal
    discount_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    tax_amount: Decimal
    delivery_charge: Decimal = Decimal("0.00")
    round_off: Decimal
    total_amount: Decimal
    total_cogs: Decimal
    paid_amount: Decimal
    pending_amount: Decimal
    payment_status: str
    status: str
    payment_mode: str
    notes: Optional[str] = None
    created_at: datetime
    items: List[SaleItemOut] = []


class SaleReturnItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)


class SaleReturnCreate(BaseModel):
    sale_id: int
    return_date: date
    reason: Optional[str] = None
    refund_to_customer: bool = False
    account_id: Optional[int] = None
    payment_mode: str = Field(default="CASH")
    items: List[SaleReturnItemCreate] = Field(min_length=1)


class SaleReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    return_number: str
    sale_id: int
    customer_id: Optional[int] = None
    return_date: date
    reason: Optional[str] = None
    total_amount: Decimal
    created_at: datetime

