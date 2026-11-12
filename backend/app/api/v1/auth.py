from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, get_current_user, get_effective_permissions
from app.core.database import get_db
from app.core.exceptions import AuthenticationError, ConflictError, ValidationError
from app.core.rbac import ROLE_OWNER
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.auth import RefreshToken, Role, User, UserPermission
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    OwnerSetupRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserOut,
    UserPermissionOverride,
)
from app.schemas.common import MessageResponse
from app.services.audit_service import record_audit_log
from app.services.seed_service import seed_initial_master_data

router = APIRouter(prefix="/auth", tags=["Authentication"])


def build_user_out(db: Session, user: User) -> UserOut:
    effective = sorted(get_effective_permissions(db, user))
    overrides = [
        UserPermissionOverride(permission_code=ov.permission.code, granted=ov.granted)
        for ov in user.user_permissions
        if ov.permission
    ]
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        mobile=user.mobile,
        role_id=user.role_id,
        role_name=user.role.name if user.role else "",
        role_display_name=user.role.display_name if user.role else "",
        is_active=user.is_active,
        is_owner=user.is_owner,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        permissions=effective,
        overrides=overrides,
        employee_id=user.employee_profile.id if user.employee_profile else None,
    )


@router.get("/setup-status")
def get_setup_status(db: Session = Depends(get_db)) -> dict:
    user_count = db.scalar(select(func.count()).select_from(User)) or 0
    return {"owner_initialized": user_count > 0}


@router.post("/setup-owner", response_model=TokenResponse, status_code=201)
def setup_initial_owner(
    payload: OwnerSetupRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """One-time Owner onboarding endpoint available only when no users exist in the database."""
    seed_initial_master_data(db)

    existing_count = db.scalar(select(func.count()).select_from(User)) or 0
    if existing_count > 0:
        raise ConflictError("Owner account is already initialized. Please sign in.")

    owner_role = db.scalar(select(Role).where(Role.name == ROLE_OWNER))
    if not owner_role:
        raise ValidationError("OWNER role was not initialized.")

    user = User(
        username=payload.username.strip().lower(),
        email=str(payload.email).strip().lower(),
        full_name=payload.full_name.strip(),
        mobile=payload.mobile,
        password_hash=hash_password(payload.password),
        role_id=owner_role.id,
        is_active=True,
        is_owner=True,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    access_token = create_access_token(str(user.id), ROLE_OWNER)
    raw_refresh, token_hash, expires_at = create_refresh_token(str(user.id))
    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="OWNER_SETUP",
        module="auth",
        entity_type="user",
        entity_id=user.id,
        description=f"Initial Owner account '{user.username}' created.",
        ip_address=get_client_ip(request),
    )
    db.commit()

    user = db.scalar(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .where(User.id == user.id)
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user=build_user_out(db, user),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate user by username or email and return JWT access + refresh tokens."""
    identifier = payload.username_or_email.strip().lower()
    user = db.scalar(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .where(or_(User.username == identifier, User.email == identifier))
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise AuthenticationError("Invalid username/email or password.")
    if not user.is_active:
        raise AuthenticationError("Your account has been deactivated. Contact the Business Owner.")

    user.last_login_at = datetime.now(timezone.utc)
    access_token = create_access_token(str(user.id), user.role.name)
    raw_refresh, token_hash, expires_at = create_refresh_token(str(user.id))
    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="LOGIN",
        module="auth",
        entity_type="user",
        entity_id=user.id,
        description=f"User '{user.username}' logged in ({user.role.name}).",
        ip_address=get_client_ip(request),
    )
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user=build_user_out(db, user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Validate and rotate an active refresh token."""
    decoded = decode_token(payload.refresh_token, expected_type="refresh")
    token_hash = hash_token(payload.refresh_token)
    stored = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked.is_(False),
        )
    )
    if not stored:
        raise AuthenticationError("Refresh token is invalid or has been revoked.")

    now = datetime.now(timezone.utc)
    if stored.expires_at < now:
        stored.revoked = True
        db.commit()
        raise AuthenticationError("Refresh token has expired. Please login again.")

    user_id = int(decoded["sub"])
    user = db.scalar(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .where(User.id == user_id)
    )
    if not user or not user.is_active:
        raise AuthenticationError("User account is inactive or missing.")

    stored.revoked = True
    access_token = create_access_token(str(user.id), user.role.name)
    new_raw_refresh, new_hash, new_exp = create_refresh_token(str(user.id))
    db.add(RefreshToken(user_id=user.id, token_hash=new_hash, expires_at=new_exp))
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_raw_refresh,
        user=build_user_out(db, user),
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    payload: RefreshTokenRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Revoke refresh token on explicit logout."""
    token_hash = hash_token(payload.refresh_token)
    stored = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.user_id == current_user.id,
        )
    )
    if stored:
        stored.revoked = True

    record_audit_log(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="LOGOUT",
        module="auth",
        entity_type="user",
        entity_id=current_user.id,
        description=f"User '{current_user.username}' logged out.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message="Logged out successfully.")


@router.get("/me", response_model=UserOut)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Return authenticated user profile and effective RBAC permissions."""
    user = db.scalar(
        select(User)
        .options(
            joinedload(User.role),
            joinedload(User.user_permissions).joinedload(UserPermission.permission),
            joinedload(User.employee_profile),
        )
        .where(User.id == current_user.id)
    )
    return build_user_out(db, user)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Allow an authenticated user to change their password."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise ValidationError("Current password is incorrect.")

    current_user.password_hash = hash_password(payload.new_password)
    record_audit_log(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="CHANGE_PASSWORD",
        module="auth",
        entity_type="user",
        entity_id=current_user.id,
        description=f"User '{current_user.username}' changed their password.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message="Password updated successfully.")

