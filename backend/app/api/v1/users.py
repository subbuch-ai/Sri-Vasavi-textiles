from typing import List

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_owner
from app.api.v1.auth import build_user_out
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.rbac import ROLE_OWNER
from app.core.security import hash_password
from app.models.auth import Permission, Role, RolePermission, User, UserPermission
from app.schemas.auth import (
    PermissionOut,
    RoleCreateRequest,
    RoleOut,
    RolePermissionsUpdateRequest,
    UserCreateRequest,
    UserOut,
    UserPermissionsUpdateRequest,
    UserUpdateRequest,
)
from app.schemas.common import MessageResponse
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/users", tags=["Admin & User Permissions"])


@router.get("/permissions", response_model=List[PermissionOut])
def list_permissions(
    _: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> List[PermissionOut]:
    """List all granular ERP permissions (Owner-only)."""
    perms = db.scalars(select(Permission).order_by(Permission.module, Permission.code)).all()
    return [PermissionOut.model_validate(p) for p in perms]


@router.get("/roles", response_model=List[RoleOut])
def list_roles(
    _: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> List[RoleOut]:
    """List all ERP roles along with their assigned permissions (Owner-only)."""
    roles = db.scalars(
        select(Role)
        .options(joinedload(Role.role_permissions).joinedload(RolePermission.permission))
        .order_by(Role.id)
    ).unique().all()

    return [
        RoleOut(
            id=r.id,
            name=r.name,
            display_name=r.display_name,
            description=r.description,
            is_system=r.is_system,
            permissions=sorted([rp.permission.code for rp in r.role_permissions if rp.permission]),
        )
        for r in roles
    ]


@router.put("/roles/{role_id}/permissions", response_model=RoleOut)
def update_role_permissions(
    role_id: int,
    payload: RolePermissionsUpdateRequest,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> RoleOut:
    """Update default permissions assigned to a non-OWNER role (Owner-only)."""
    role = db.scalar(select(Role).where(Role.id == role_id))
    if not role:
        raise NotFoundError("Role not found.")
    if role.name == ROLE_OWNER:
        raise ValidationError("OWNER role always retains full system permissions.")

    perms = db.scalars(select(Permission).where(Permission.code.in_(payload.permission_codes))).all()
    perm_by_code = {p.code: p for p in perms}
    unknown = set(payload.permission_codes) - set(perm_by_code.keys())
    if unknown:
        raise ValidationError(f"Unknown permission codes: {sorted(unknown)}")

    db.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
    for code in sorted(set(payload.permission_codes)):
        db.add(RolePermission(role_id=role.id, permission_id=perm_by_code[code].id))

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="UPDATE_ROLE_PERMISSIONS",
        module="admin",
        entity_type="role",
        entity_id=role.id,
        description=f"Updated permissions for role '{role.name}'.",
        new_values={"permissions": sorted(set(payload.permission_codes))},
        ip_address=get_client_ip(request),
    )
    db.commit()

    return RoleOut(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        permissions=sorted(set(payload.permission_codes)),
    )


@router.post("/roles", response_model=RoleOut, status_code=201)
def create_role(
    payload: RoleCreateRequest,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> RoleOut:
    """Create a new custom ERP role with initial permissions (Owner-only)."""
    normalized_name = payload.name.strip().upper().replace(" ", "_")
    if normalized_name == ROLE_OWNER:
        raise ValidationError("Cannot create an additional OWNER role.")

    existing = db.scalar(select(Role).where(func.upper(Role.name) == normalized_name))
    if existing:
        raise ConflictError(f"A role with code '{normalized_name}' already exists.")

    perms = db.scalars(select(Permission).where(Permission.code.in_(payload.permissions))).all()
    perm_by_code = {p.code: p for p in perms}

    role = Role(
        name=normalized_name,
        display_name=payload.display_name.strip(),
        description=payload.description.strip() if payload.description else None,
        is_system=False,
    )
    db.add(role)
    db.flush()

    for code in sorted(set(payload.permissions)):
        if code in perm_by_code:
            db.add(RolePermission(role_id=role.id, permission_id=perm_by_code[code].id))

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="CREATE_ROLE",
        module="admin",
        entity_type="role",
        entity_id=role.id,
        description=f"Created custom role '{role.display_name}' ({role.name}).",
        new_values={"name": role.name, "display_name": role.display_name, "permissions": payload.permissions},
        ip_address=get_client_ip(request),
    )
    db.commit()

    return RoleOut(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        permissions=sorted(set(payload.permissions)),
    )


@router.delete("/roles/{role_id}", response_model=MessageResponse)
def delete_role(
    role_id: int,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Delete a custom ERP role (Owner-only). System roles cannot be deleted."""
    role = db.scalar(select(Role).where(Role.id == role_id))
    if not role:
        raise NotFoundError("Role not found.")
    if role.is_system or role.name in ["OWNER", "ADMIN", "SALES", "ACCOUNTS", "EMPLOYEE"]:
        raise ValidationError(f"System role '{role.display_name}' cannot be deleted.")

    assigned_users_count = db.scalar(select(func.count()).select_from(User).where(User.role_id == role.id)) or 0
    if assigned_users_count > 0:
        raise ValidationError(
            f"Cannot delete role '{role.display_name}': {assigned_users_count} user account(s) are currently assigned to it. Please reassign them first."
        )

    role_name = role.name
    db.delete(role)
    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="DELETE_ROLE",
        module="admin",
        entity_type="role",
        entity_id=role_id,
        description=f"Deleted custom role '{role_name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"Role '{role_name}' deleted successfully.")



@router.get("", response_model=List[UserOut])
def list_users(
    _: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> List[UserOut]:
    """List all Admin and Staff accounts with roles and overrides (Owner-only)."""
    users = db.scalars(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .order_by(User.id)
    ).unique().all()
    return [build_user_out(db, u) for u in users]


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreateRequest,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> UserOut:
    """Create a new Admin, Sales, Accounts, or Employee account (Owner-only)."""
    raw_username = payload.username.strip()
    email = str(payload.email).strip().lower()

    if db.scalar(select(User.id).where(func.lower(User.username) == raw_username.lower())):
        raise ConflictError(f"Username '{raw_username}' is already taken.")
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise ConflictError(f"Email '{email}' is already registered.")

    role = db.scalar(select(Role).where(Role.name == payload.role_name.strip().upper()))
    if not role:
        raise ValidationError(f"Role '{payload.role_name}' does not exist.")
    if role.name == ROLE_OWNER:
        raise ValidationError("Additional OWNER accounts cannot be created via user management.")

    user = User(
        username=raw_username,
        email=email,
        full_name=payload.full_name.strip(),
        mobile=payload.mobile,
        password_hash=hash_password(payload.password),
        role_id=role.id,
        is_active=payload.is_active,
        is_owner=False,
    )
    db.add(user)
    db.flush()

    if payload.overrides:
        codes = [o.permission_code for o in payload.overrides]
        perms = db.scalars(select(Permission).where(Permission.code.in_(codes))).all()
        perm_map = {p.code: p for p in perms}
        for ov in payload.overrides:
            perm = perm_map.get(ov.permission_code)
            if not perm:
                raise ValidationError(f"Unknown permission '{ov.permission_code}'.")
            db.add(UserPermission(user_id=user.id, permission_id=perm.id, granted=ov.granted))

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="CREATE_USER",
        module="admin",
        entity_type="user",
        entity_id=user.id,
        description=f"Created user '{user.username}' with role '{role.name}'.",
        new_values={"username": user.username, "role": role.name, "is_active": user.is_active},
        ip_address=get_client_ip(request),
    )
    db.commit()

    created = db.scalar(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .where(User.id == user.id)
    )
    return build_user_out(db, created)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> UserOut:
    """Update user profile, role, active state, or reset password (Owner-only)."""
    user = db.scalar(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .where(User.id == user_id)
    )
    if not user:
        raise NotFoundError("User not found.")

    if payload.username is not None:
        raw_username = payload.username.strip()
        if raw_username.lower() != user.username.lower():
            conflict = db.scalar(
                select(User.id).where(func.lower(User.username) == raw_username.lower(), User.id != user.id)
            )
            if conflict:
                raise ConflictError(f"Username '{raw_username}' is already taken.")
        user.username = raw_username

    if payload.email is not None:
        normalized_email = str(payload.email).strip().lower()
        conflict = db.scalar(
            select(User.id).where(func.lower(User.email) == normalized_email, User.id != user.id)
        )
        if conflict:
            raise ConflictError("Another account already uses this email.")
        user.email = normalized_email

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.mobile is not None:
        user.mobile = payload.mobile
    if payload.is_active is not None:
        if user.is_owner and not payload.is_active:
            raise ValidationError("The Business Owner account cannot be deactivated.")
        user.is_active = payload.is_active
    if payload.role_name is not None:
        if user.is_owner and payload.role_name.upper() != ROLE_OWNER:
            raise ValidationError("The Business Owner role cannot be downgraded.")
        new_role = db.scalar(select(Role).where(Role.name == payload.role_name.strip().upper()))
        if not new_role:
            raise ValidationError(f"Role '{payload.role_name}' does not exist.")
        if new_role.name == ROLE_OWNER and not user.is_owner:
            raise ValidationError("Cannot promote non-owner user to OWNER.")
        user.role_id = new_role.id
    if payload.password:
        user.password_hash = hash_password(payload.password)

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="UPDATE_USER",
        module="admin",
        entity_type="user",
        entity_id=user.id,
        description=f"Updated account '{user.username}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return build_user_out(db, user)


@router.put("/{user_id}/permissions", response_model=UserOut)
def update_user_permissions(
    user_id: int,
    payload: UserPermissionsUpdateRequest,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> UserOut:
    """Set per-user permission overrides (grant extra or revoke role permissions) (Owner-only)."""
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise NotFoundError("User not found.")
    if user.is_owner:
        raise ValidationError("Owner account always retains full permissions.")

    codes = [o.permission_code for o in payload.overrides]
    perms = db.scalars(select(Permission).where(Permission.code.in_(codes))).all() if codes else []
    perm_map = {p.code: p for p in perms}
    unknown = set(codes) - set(perm_map.keys())
    if unknown:
        raise ValidationError(f"Unknown permission codes: {sorted(unknown)}")

    db.execute(delete(UserPermission).where(UserPermission.user_id == user.id))
    for ov in payload.overrides:
        db.add(UserPermission(user_id=user.id, permission_id=perm_map[ov.permission_code].id, granted=ov.granted))

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="UPDATE_USER_PERMISSIONS",
        module="admin",
        entity_type="user",
        entity_id=user.id,
        description=f"Updated permission overrides for '{user.username}'.",
        new_values={"overrides": [o.model_dump() for o in payload.overrides]},
        ip_address=get_client_ip(request),
    )
    db.commit()

    refreshed = db.scalar(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .where(User.id == user.id)
    )
    return build_user_out(db, refreshed)


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Deactivate or delete a non-Owner user account (Owner-only)."""
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise NotFoundError("User not found.")
    if user.is_owner or user.id == owner.id:
        raise ValidationError("The Business Owner account cannot be deleted.")

    username = user.username
    user.is_active = False
    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="DEACTIVATE_USER",
        module="admin",
        entity_type="user",
        entity_id=user.id,
        description=f"Deactivated user account '{username}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"User '{username}' deactivated.")

