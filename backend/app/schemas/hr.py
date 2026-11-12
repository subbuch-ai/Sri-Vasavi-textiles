from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmployeeCreate(BaseModel):
    employee_code: Optional[str] = Field(default=None, max_length=40)
    full_name: str = Field(min_length=2, max_length=150)
    mobile: str = Field(min_length=6, max_length=20)
    email: Optional[EmailStr] = None
    designation: str = Field(min_length=2, max_length=100)
    department: Optional[str] = None
    joining_date: date
    salary: Decimal = Field(default=Decimal("0.00"), ge=0)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE|ON_LEAVE)$")
    branch_id: Optional[int] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    create_login_account: bool = False
    username: Optional[str] = Field(default=None, min_length=3, max_length=60)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    role_name: str = Field(default="EMPLOYEE")


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    mobile: Optional[str] = Field(default=None, min_length=6, max_length=20)
    email: Optional[EmailStr] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    joining_date: Optional[date] = None
    salary: Optional[Decimal] = Field(default=None, ge=0)
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE|ON_LEAVE)$")
    branch_id: Optional[int] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    role_name: Optional[str] = None
    branch_id: Optional[int] = None
    full_name: str
    mobile: str
    email: Optional[str] = None
    designation: str
    department: Optional[str] = None
    joining_date: date
    salary: Decimal
    status: str
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class EmployeeTaskCreate(BaseModel):
    employee_id: int
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = None
    module_ref: Optional[str] = None
    record_ref: Optional[str] = None
    priority: str = Field(default="MEDIUM", pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    due_date: Optional[date] = None


class EmployeeTaskUpdate(BaseModel):
    status: str = Field(pattern="^(PENDING|IN_PROGRESS|COMPLETED|CANCELLED)$")
    completion_notes: Optional[str] = None


class EmployeeTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    employee_name: Optional[str] = None
    assigned_by: Optional[int] = None
    title: str
    description: Optional[str] = None
    module_ref: Optional[str] = None
    record_ref: Optional[str] = None
    priority: str
    status: str
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    completion_notes: Optional[str] = None
    created_at: datetime

