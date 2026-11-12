from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AccountCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=150)
    account_type: str = Field(pattern="^(CASH|BANK|UPI)$")
    opening_balance: Decimal = Field(default=Decimal("0.00"))
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    is_default: bool = False


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    account_type: str
    opening_balance: Decimal
    current_balance: Decimal
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    is_default: bool
    is_active: bool


class PaymentCreate(BaseModel):
    payment_date: date
    direction: str = Field(pattern="^(INBOUND|OUTBOUND)$")
    party_type: str = Field(pattern="^(CUSTOMER|SUPPLIER)$")
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    sale_id: Optional[int] = None
    purchase_invoice_id: Optional[int] = None
    customer_order_id: Optional[int] = None
    account_id: Optional[int] = None
    amount: Decimal = Field(gt=0)
    payment_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CHEQUE|CARD|OTHER)$")
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    payment_number: str
    payment_date: date
    direction: str
    party_type: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    sale_id: Optional[int] = None
    purchase_invoice_id: Optional[int] = None
    account_id: int
    account_name: Optional[str] = None
    amount: Decimal
    payment_mode: str
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    status: str
    created_at: datetime


class ExpenseCreate(BaseModel):
    expense_date: date
    category: str = Field(
        pattern="^(SHOP_RENT|ELECTRICITY|EMPLOYEE_SALARIES|TRANSPORTATION|MAINTENANCE|MARKETING|OTHER)$"
    )
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = None
    amount: Decimal = Field(gt=0)
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    payment_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CHEQUE|CARD|OTHER)$")
    account_id: Optional[int] = None
    vendor_name: Optional[str] = None


class ExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    category: Optional[str] = Field(
        default=None,
        pattern="^(SHOP_RENT|ELECTRICITY|EMPLOYEE_SALARIES|TRANSPORTATION|MAINTENANCE|MARKETING|OTHER)$",
    )
    title: Optional[str] = Field(default=None, min_length=2, max_length=200)
    description: Optional[str] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    tax_amount: Optional[Decimal] = Field(default=None, ge=0)
    vendor_name: Optional[str] = None


class ExpenseApprovalRequest(BaseModel):
    approval_status: str = Field(pattern="^(APPROVED|REJECTED)$")


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_number: str
    expense_date: date
    category: str
    title: str
    description: Optional[str] = None
    amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    payment_mode: str
    account_id: Optional[int] = None
    account_name: Optional[str] = None
    vendor_name: Optional[str] = None
    attachment_url: Optional[str] = None
    approval_status: str
    approved_by: Optional[int] = None
    created_by: Optional[int] = None
    created_at: datetime


class AccountTransferCreate(BaseModel):
    transfer_date: date
    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(gt=0)
    description: str = Field(min_length=2, max_length=255)
    reference_number: Optional[str] = None


class FinancialTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_number: str
    transaction_date: date
    account_id: int
    account_name: Optional[str] = None
    transaction_type: str
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    description: str
    debit: Decimal
    credit: Decimal
    payment_mode: str
    created_by: Optional[int] = None
    created_at: datetime

