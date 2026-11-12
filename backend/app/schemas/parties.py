from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SupplierCreate(BaseModel):
    supplier_code: Optional[str] = Field(default=None, max_length=40)
    company_name: str = Field(min_length=2, max_length=200)
    contact_person: Optional[str] = Field(default=None, max_length=150)
    mobile: str = Field(min_length=6, max_length=20)
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    gst_number: Optional[str] = Field(default=None, max_length=30)
    opening_balance: Decimal = Field(default=Decimal("0.00"))
    is_active: bool = True
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    company_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    contact_person: Optional[str] = None
    mobile: Optional[str] = Field(default=None, min_length=6, max_length=20)
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    gst_number: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_code: str
    company_name: str
    contact_person: Optional[str] = None
    mobile: str
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    gst_number: Optional[str] = None
    opening_balance: Decimal
    total_purchases: Decimal
    total_payments: Decimal
    outstanding_balance: Decimal
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime


class CustomerCreate(BaseModel):
    customer_code: Optional[str] = Field(default=None, max_length=40)
    name: str = Field(min_length=2, max_length=200)
    mobile: str = Field(min_length=6, max_length=20)
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    customer_type: str = Field(default="RETAIL", pattern="^(WHOLESALE|RETAIL)$")
    gst_number: Optional[str] = Field(default=None, max_length=30)
    credit_limit: Decimal = Field(default=Decimal("0.00"), ge=0)
    opening_balance: Decimal = Field(default=Decimal("0.00"))
    is_active: bool = True
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    mobile: Optional[str] = Field(default=None, min_length=6, max_length=20)
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    customer_type: Optional[str] = Field(default=None, pattern="^(WHOLESALE|RETAIL)$")
    gst_number: Optional[str] = None
    credit_limit: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_code: str
    name: str
    mobile: str
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    customer_type: str
    gst_number: Optional[str] = None
    credit_limit: Decimal
    opening_balance: Decimal
    total_purchases: Decimal
    total_payments: Decimal
    outstanding_balance: Decimal
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime


class LedgerEntryOut(BaseModel):
    date: date
    reference: str
    entry_type: str
    description: str
    debit: Decimal
    credit: Decimal
    balance: Decimal

