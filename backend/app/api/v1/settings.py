import shutil
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, get_current_user, require_owner, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.auth import User
from app.models.organization import Branch, BusinessSettings
from app.schemas.organization import (
    BranchCreate,
    BranchOut,
    BranchUpdate,
    BusinessSettingsOut,
    BusinessSettingsUpdate,
)
from app.services.audit_service import record_audit_log
from app.services.backup_service import create_database_backup

router = APIRouter(prefix="/settings", tags=["Business Settings & Branches"])


@router.get("", response_model=BusinessSettingsOut)
def get_business_settings(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusinessSettingsOut:
    """Return Sri Vasavi Textiles business settings (currency, GST, invoice prefix, policies)."""
    row = db.scalar(select(BusinessSettings).limit(1))
    if not row:
        row = BusinessSettings(business_name="Sri Vasavi Textiles")
        db.add(row)
        db.commit()
        db.refresh(row)
    return BusinessSettingsOut.model_validate(row)


@router.put("", response_model=BusinessSettingsOut)
def update_business_settings(
    payload: BusinessSettingsUpdate,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> BusinessSettingsOut:
    """Update business configuration, GSTIN, invoice numbering, and stock policy (Owner-only)."""
    row = db.scalar(select(BusinessSettings).limit(1))
    if not row:
        row = BusinessSettings(business_name="Sri Vasavi Textiles")
        db.add(row)
        db.flush()

    updates = payload.model_dump(exclude_unset=True)
    old_values = {k: str(getattr(row, k)) for k in updates.keys() if hasattr(row, k)}
    for key, value in updates.items():
        setattr(row, key, value)
    row.updated_by = owner.id

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="UPDATE_SETTINGS",
        module="settings",
        entity_type="business_settings",
        entity_id=row.id,
        description="Updated business settings.",
        old_values=old_values,
        new_values={k: str(v) for k, v in updates.items()},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(row)
    return BusinessSettingsOut.model_validate(row)


@router.post("/logo", response_model=BusinessSettingsOut)
def upload_business_logo(
    request: Request,
    file: UploadFile = File(...),
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> BusinessSettingsOut:
    """Upload a custom business logo for Sri Vasavi Textiles invoices and header."""
    allowed_ext = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed_ext:
        raise ValidationError("Logo must be a PNG, JPG, WEBP, or SVG file.")

    target_dir = settings.upload_path / "branding"
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"svt_logo_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
    dest = target_dir / filename
    with dest.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    row = db.scalar(select(BusinessSettings).limit(1))
    if not row:
        row = BusinessSettings(business_name="Sri Vasavi Textiles")
        db.add(row)
        db.flush()
    row.logo_url = f"/uploads/branding/{filename}"
    row.updated_by = owner.id

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="UPLOAD_LOGO",
        module="settings",
        entity_type="business_settings",
        entity_id=row.id,
        description="Uploaded new business logo.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(row)
    return BusinessSettingsOut.model_validate(row)


@router.get("/branches", response_model=List[BranchOut])
def list_branches(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[BranchOut]:
    """List store/warehouse branches."""
    branches = db.scalars(select(Branch).order_by(Branch.is_default.desc(), Branch.id)).all()
    return [BranchOut.model_validate(b) for b in branches]


@router.post("/branches", response_model=BranchOut, status_code=201)
def create_branch(
    payload: BranchCreate,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> BranchOut:
    """Create a new store or warehouse branch (Owner-only)."""
    code = payload.code.strip().upper()
    if db.scalar(select(Branch.id).where(Branch.code == code)):
        raise ConflictError(f"Branch code '{code}' already exists.")

    if payload.is_default:
        for existing in db.scalars(select(Branch).where(Branch.is_default.is_(True))).all():
            existing.is_default = False

    branch = Branch(
        code=code,
        name=payload.name.strip(),
        address=payload.address,
        city=payload.city,
        state=payload.state,
        phone=payload.phone,
        is_default=payload.is_default,
        is_active=payload.is_active,
    )
    db.add(branch)
    db.flush()

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="CREATE_BRANCH",
        module="settings",
        entity_type="branch",
        entity_id=branch.id,
        description=f"Created branch '{branch.name}' ({branch.code}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(branch)
    return BranchOut.model_validate(branch)


@router.patch("/branches/{branch_id}", response_model=BranchOut)
def update_branch(
    branch_id: int,
    payload: BranchUpdate,
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> BranchOut:
    """Update a store/warehouse branch (Owner-only)."""
    branch = db.scalar(select(Branch).where(Branch.id == branch_id))
    if not branch:
        raise NotFoundError("Branch not found.")

    updates = payload.model_dump(exclude_unset=True)
    if updates.get("is_default"):
        for existing in db.scalars(select(Branch).where(Branch.is_default.is_(True), Branch.id != branch.id)).all():
            existing.is_default = False

    for key, value in updates.items():
        setattr(branch, key, value)

    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="UPDATE_BRANCH",
        module="settings",
        entity_type="branch",
        entity_id=branch.id,
        description=f"Updated branch '{branch.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(branch)
    return BranchOut.model_validate(branch)


@router.post("/backup")
def trigger_database_backup(
    request: Request,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> dict:
    """Create a timestamped PostgreSQL backup snapshot in BACKUP_DIR (Owner-only)."""
    info = create_database_backup()
    record_audit_log(
        db,
        user_id=owner.id,
        username=owner.username,
        action="DATABASE_BACKUP",
        module="settings",
        entity_type="database",
        description=f"Triggered PostgreSQL backup: {info['filename']}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return {
        "message": f"Database backup created: {info['filename']}",
        "filename": info["filename"],
        "size_bytes": info["size_bytes"],
    }
