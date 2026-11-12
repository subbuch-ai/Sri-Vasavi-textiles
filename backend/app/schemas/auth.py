from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    module: str
    description: Optional[str] = None


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    display_name: str
    description: Optional[str] = None
    is_system: bool
    permissions: List[str] = []


class UserPermissionOverride(BaseModel):
    permission_code: str
    granted: bool


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    mobile: Optional[str] = None
    role_id: int
    role_name: str
    role_display_name: str
    is_active: bool
    is_owner: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
    permissions: List[str] = []
    overrides: List[UserPermissionOverride] = []
    employee_id: Optional[int] = None


class OwnerSetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    mobile: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=128)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    mobile: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    role_name: str = Field(min_length=2, max_length=50)
    is_active: bool = True
    overrides: List[UserPermissionOverride] = []


class UserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    mobile: Optional[str] = Field(default=None, max_length=20)
    role_name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


class UserPermissionsUpdateRequest(BaseModel):
    overrides: List[UserPermissionOverride]


class RolePermissionsUpdateRequest(BaseModel):
    permission_codes: List[str]


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)

