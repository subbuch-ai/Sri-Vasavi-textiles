from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    gst_rate: Decimal = Field(default=Decimal("5.00"), ge=0, le=28)


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    branch_id: Optional[int] = None
    order_date: date
    expected_date: Optional[date] = None
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    transport_charges: Decimal = Field(default=Decimal("0.00"), ge=0)
    status: str = Field(default="CONFIRMED", pattern="^(DRAFT|CONFIRMED)$")
    notes: Optional[str] = None
    items: List[PurchaseOrderItemCreate] = Field(min_length=1)


class PurchaseOrderStatusUpdate(BaseModel):
    status: str = Field(pattern="^(DRAFT|CONFIRMED|CANCELLED)$")


class PurchaseOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    quantity: Decimal
    received_quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    gst_rate: Decimal
    gst_amount: Decimal
    total_amount: Decimal


class PurchaseOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    po_number: str
    supplier_id: int
    supplier_name: Optional[str] = None
    branch_id: int
    order_date: date
    expected_date: Optional[date] = None
    status: str
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    transport_charges: Decimal
    total_amount: Decimal
    notes: Optional[str] = None
    created_at: datetime
    items: List[PurchaseOrderItemOut] = []


class GoodsReceiptItemCreate(BaseModel):
    po_item_id: Optional[int] = None
    product_id: int
    quantity_received: Decimal = Field(gt=0)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)


class GoodsReceiptCreate(BaseModel):
    purchase_order_id: Optional[int] = None
    supplier_id: int
    branch_id: Optional[int] = None
    received_date: date
    challan_number: Optional[str] = None
    notes: Optional[str] = None
    items: List[GoodsReceiptItemCreate] = Field(min_length=1)


class GoodsReceiptItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    po_item_id: Optional[int] = None
    product_id: int
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    quantity_received: Decimal
    unit_cost: Decimal


class GoodsReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    grn_number: str
    purchase_order_id: Optional[int] = None
    po_number: Optional[str] = None
    supplier_id: int
    supplier_name: Optional[str] = None
    branch_id: int
    received_date: date
    challan_number: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    items: List[GoodsReceiptItemOut] = []


class PurchaseInvoiceItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    gst_rate: Decimal = Field(default=Decimal("5.00"), ge=0, le=28)


class PurchaseInvoiceCreate(BaseModel):
    supplier_id: int
    supplier_invoice_no: str = Field(min_length=1, max_length=80)
    purchase_order_id: Optional[int] = None
    goods_receipt_id: Optional[int] = None
    branch_id: Optional[int] = None
    invoice_date: date
    due_date: Optional[date] = None
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    transport_charges: Decimal = Field(default=Decimal("0.00"), ge=0)
    is_interstate: bool = False
    paid_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    payment_mode: str = Field(default="BANK_TRANSFER")
    account_id: Optional[int] = None
    receive_stock_now: bool = False
    notes: Optional[str] = None
    items: List[PurchaseInvoiceItemCreate] = Field(min_length=1)


class PurchaseInvoiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    quantity: Decimal
    returned_quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    gst_rate: Decimal
    gst_amount: Decimal
    total_amount: Decimal


class PurchaseInvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    supplier_invoice_no: str
    purchase_order_id: Optional[int] = None
    goods_receipt_id: Optional[int] = None
    supplier_id: int
    supplier_name: Optional[str] = None
    branch_id: int
    invoice_date: date
    due_date: Optional[date] = None
    subtotal: Decimal
    discount_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    tax_amount: Decimal
    transport_charges: Decimal
    round_off: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    pending_amount: Decimal
    payment_status: str
    status: str
    notes: Optional[str] = None
    created_at: datetime
    items: List[PurchaseInvoiceItemOut] = []


class PurchaseReturnItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)


class PurchaseReturnCreate(BaseModel):
    purchase_invoice_id: int
    return_date: date
    reason: Optional[str] = None
    items: List[PurchaseReturnItemCreate] = Field(min_length=1)


class PurchaseReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    return_number: str
    purchase_invoice_id: int
    supplier_id: int
    supplier_name: Optional[str] = None
    return_date: date
    reason: Optional[str] = None
    total_amount: Decimal
    created_at: datetime

