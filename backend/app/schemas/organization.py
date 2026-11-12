from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    is_default: bool
    is_active: bool


class BranchCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=150)
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    is_default: bool = False
    is_active: bool = True


class BranchUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class BusinessSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_name: str
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    invoice_prefix: str
    next_invoice_number: int
    po_prefix: str
    next_po_number: int
    order_prefix: str
    next_order_number: int
    currency_code: str
    currency_symbol: str
    financial_year: str
    default_gst_rate: Decimal
    allow_negative_stock: bool
    low_stock_alert_enabled: bool
    require_expense_approval: bool
    expense_approval_threshold: Decimal
    payment_methods: Dict[str, Any]
    tax_settings: Dict[str, Any]
    updated_at: datetime


class BusinessSettingsUpdate(BaseModel):
    business_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    invoice_prefix: Optional[str] = Field(default=None, max_length=20)
    next_invoice_number: Optional[int] = Field(default=None, ge=1)
    po_prefix: Optional[str] = Field(default=None, max_length=20)
    next_po_number: Optional[int] = Field(default=None, ge=1)
    order_prefix: Optional[str] = Field(default=None, max_length=20)
    next_order_number: Optional[int] = Field(default=None, ge=1)
    currency_code: Optional[str] = None
    currency_symbol: Optional[str] = None
    financial_year: Optional[str] = None
    default_gst_rate: Optional[Decimal] = Field(default=None, ge=0, le=28)
    allow_negative_stock: Optional[bool] = None
    low_stock_alert_enabled: Optional[bool] = None
    require_expense_approval: Optional[bool] = None
    expense_approval_threshold: Optional[Decimal] = Field(default=None, ge=0)
    payment_methods: Optional[Dict[str, Any]] = None
    tax_settings: Optional[Dict[str, Any]] = None


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    module: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    description: str
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    title: str
    message: str
    category: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime

