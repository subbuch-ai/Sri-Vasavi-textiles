from typing import Callable, Iterable, Set

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.rbac import ALL_PERMISSION_CODES, ROLE_OWNER
from app.core.security import decode_token
from app.models.auth import Role, RolePermission, User, UserPermission

bearer_scheme = HTTPBearer(auto_error=False)


def get_effective_permissions(db: Session, user: User) -> Set[str]:
    """
    Compute effective permission codes for a user.
    Owner role (or user.is_owner) always holds all permissions across the ERP.
    Other users inherit their role's permissions modified by per-user overrides.
    """
    if user.is_owner or (user.role and user.role.name == ROLE_OWNER):
        return set(ALL_PERMISSION_CODES)

    role_perms = set(
        db.scalars(
            select(RolePermission)
            .options(joinedload(RolePermission.permission))
            .where(RolePermission.role_id == user.role_id)
        ).all()
    )
    effective: Set[str] = {rp.permission.code for rp in role_perms if rp.permission}

    overrides = db.scalars(
        select(UserPermission)
        .options(joinedload(UserPermission.permission))
        .where(UserPermission.user_id == user.id)
    ).all()
    for ov in overrides:
        if not ov.permission:
            continue
        if ov.granted:
            effective.add(ov.permission.code)
        else:
            effective.discard(ov.permission.code)

    return effective


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Validate Bearer JWT token and return the active authenticated user."""
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Authentication credentials were not provided.")

    payload = decode_token(credentials.credentials, expected_type="access")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise AuthenticationError("Invalid user identifier in token.") from exc

    user = db.scalar(
        select(User)
        .options(joinedload(User.role).joinedload(Role.role_permissions))
        .where(User.id == user_id)
    )
    if not user:
        raise AuthenticationError("User account not found.")
    if not user.is_active:
        raise AuthenticationError("This user account has been deactivated.")

    return user


def require_permission(permission_code: str) -> Callable[[User, Session], User]:
    """Dependency enforcing backend-level RBAC permission verification."""

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.is_owner or (current_user.role and current_user.role.name == ROLE_OWNER):
            return current_user
        effective = get_effective_permissions(db, current_user)
        if permission_code not in effective:
            raise PermissionDeniedError(
                f"Missing required permission '{permission_code}' for this operation."
            )
        return current_user

    return dependency


def require_any_permission(permission_codes: Iterable[str]) -> Callable[[User, Session], User]:
    """Dependency allowing access if the user holds at least one listed permission."""
    required = set(permission_codes)

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.is_owner or (current_user.role and current_user.role.name == ROLE_OWNER):
            return current_user
        effective = get_effective_permissions(db, current_user)
        if not (effective & required):
            raise PermissionDeniedError("You do not have permission to access this resource.")
        return current_user

    return dependency


def require_owner(current_user: User = Depends(get_current_user)) -> User:
    """Strict dependency restricting Owner-only actions exclusively to the Owner."""
    if not (current_user.is_owner or (current_user.role and current_user.role.name == ROLE_OWNER)):
        raise PermissionDeniedError("Only the Business Owner is authorized to perform this action.")
    return current_user


def get_client_ip(request: Request) -> str | None:
    """Extract client IP address safely for audit logging."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None

