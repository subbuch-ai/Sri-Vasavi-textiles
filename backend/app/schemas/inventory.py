from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CategoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    code: Optional[str] = Field(default=None, max_length=40)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: bool
    created_at: datetime


class ProductCreate(BaseModel):
    product_code: Optional[str] = Field(default=None, max_length=50)
    name: str = Field(min_length=2, max_length=200)
    category_id: int
    brand: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = None
    size: Optional[str] = Field(default=None, max_length=60)
    color: Optional[str] = Field(default=None, max_length=60)
    fabric_type: Optional[str] = Field(default=None, max_length=120)
    hsn_code: Optional[str] = Field(default=None, max_length=30)
    unit: str = Field(default="PCS", max_length=20)
    purchase_price: Decimal = Field(ge=0)
    wholesale_price: Decimal = Field(ge=0)
    retail_price: Decimal = Field(ge=0)
    gst_rate: Decimal = Field(default=Decimal("5.00"), ge=0, le=28)
    barcode: Optional[str] = Field(default=None, max_length=80)
    initial_stock: Decimal = Field(default=Decimal("0.000"), ge=0)
    min_stock_level: Decimal = Field(default=Decimal("10.000"), ge=0)
    image_url: Optional[str] = None
    is_active: bool = True
    is_storefront_visible: bool = True
    is_featured: bool = False
    is_new_arrival: bool = False
    is_best_seller: bool = False
    wholesale_min_qty: Decimal = Field(default=Decimal("5.000"), ge=1)
    specifications: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_wholesale_vs_retail(self) -> "ProductCreate":
        if self.wholesale_price >= self.retail_price:
            raise ValueError(
                "Wholesale price must be strictly lower than retail price so wholesale and retail customers have different rates."
            )
        return self


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    category_id: Optional[int] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    fabric_type: Optional[str] = None
    hsn_code: Optional[str] = None
    unit: Optional[str] = None
    purchase_price: Optional[Decimal] = Field(default=None, ge=0)
    wholesale_price: Optional[Decimal] = Field(default=None, ge=0)
    retail_price: Optional[Decimal] = Field(default=None, ge=0)
    gst_rate: Optional[Decimal] = Field(default=None, ge=0, le=28)
    barcode: Optional[str] = None
    min_stock_level: Optional[Decimal] = Field(default=None, ge=0)
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_storefront_visible: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_new_arrival: Optional[bool] = None
    is_best_seller: Optional[bool] = None
    wholesale_min_qty: Optional[Decimal] = Field(default=None, ge=1)
    specifications: Optional[Dict[str, Any]] = None


class ProductImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    image_url: str
    alt_text: Optional[str] = None
    display_order: int
    is_primary: bool


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_code: str
    name: str
    category_id: int
    category_name: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    fabric_type: Optional[str] = None
    hsn_code: Optional[str] = None
    unit: str
    purchase_price: Decimal
    wholesale_price: Decimal
    retail_price: Decimal
    gst_rate: Decimal
    barcode: Optional[str] = None
    current_stock: Decimal
    reserved_stock: Decimal = Decimal("0.000")
    available_stock: Decimal = Decimal("0.000")
    min_stock_level: Decimal
    image_url: Optional[str] = None
    images: List[ProductImageOut] = []
    is_active: bool
    is_storefront_visible: bool = True
    is_featured: bool = False
    is_new_arrival: bool = False
    is_best_seller: bool = False
    wholesale_min_qty: Decimal = Decimal("5.000")
    specifications: Optional[Dict[str, Any]] = None
    is_low_stock: bool = False
    stock_value: Decimal = Decimal("0.00")
    created_at: datetime


class StockAdjustmentCreate(BaseModel):
    product_id: int
    branch_id: Optional[int] = None
    transaction_type: str = Field(pattern="^(STOCK_IN|STOCK_OUT|ADJUSTMENT|DAMAGED|RETURNED_IN|RETURNED_OUT)$")
    quantity: Decimal
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def quantity_nonzero(cls, v: Decimal) -> Decimal:
        if v == 0:
            raise ValueError("Quantity cannot be zero.")
        return v


class StockTransferCreate(BaseModel):
    product_id: int
    source_branch_id: int
    target_branch_id: int
    quantity: Decimal = Field(gt=0)
    notes: Optional[str] = None


class StockTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_number: str
    product_id: int
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    branch_id: int
    branch_name: Optional[str] = None
    target_branch_id: Optional[int] = None
    transaction_type: str
    quantity_change: Decimal
    stock_before: Decimal
    stock_after: Decimal
    unit_cost: Decimal
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime

