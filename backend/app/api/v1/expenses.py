import shutil
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, get_effective_permissions, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError
from app.core.rbac import ROLE_OWNER
from app.models.auth import User
from app.models.finance import Expense
from app.models.organization import BusinessSettings
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.finance import ExpenseApprovalRequest, ExpenseCreate, ExpenseOut, ExpenseUpdate
from app.services.audit_service import record_audit_log
from app.services.export_service import export_report_csv, export_report_excel
from app.services.finance_service import record_financial_entry, resolve_account
from app.services.numbering_service import generate_sequential_code

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def _to_expense_out(e: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=e.id,
        expense_number=e.expense_number,
        expense_date=e.expense_date,
        category=e.category,
        title=e.title,
        description=e.description,
        amount=e.amount,
        tax_amount=e.tax_amount,
        total_amount=e.total_amount,
        payment_mode=e.payment_mode,
        account_id=e.account_id,
        account_name=e.account.name if e.account else None,
        vendor_name=e.vendor_name,
        attachment_url=e.attachment_url,
        approval_status=e.approval_status,
        approved_by=e.approved_by,
        created_by=e.created_by,
        created_at=e.created_at,
    )


@router.get("", response_model=PaginatedResponse[ExpenseOut])
def list_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    category: Optional[str] = None,
    approval_status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    _: User = Depends(require_permission("expenses:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ExpenseOut]:
    stmt = select(Expense).options(joinedload(Expense.account))
    if category:
        stmt = stmt.where(Expense.category == category)
    if approval_status:
        stmt = stmt.where(Expense.approval_status == approval_status)
    if start_date:
        stmt = stmt.where(Expense.expense_date >= start_date)
    if end_date:
        stmt = stmt.where(Expense.expense_date <= end_date)

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(Expense.id).subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(Expense.expense_date), desc(Expense.id)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[_to_expense_out(e) for e in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/export")
def export_expenses(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    category: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    _: User = Depends(require_permission("expenses:view")),
    db: Session = Depends(get_db),
) -> Response:
    stmt = select(Expense)
    if category:
        stmt = stmt.where(Expense.category == category)
    if start_date:
        stmt = stmt.where(Expense.expense_date >= start_date)
    if end_date:
        stmt = stmt.where(Expense.expense_date <= end_date)
    rows = db.scalars(stmt.order_by(desc(Expense.expense_date))).all()
    payload = {
        "report_type": "expenses",
        "title": "Business Expenses",
        "period": f"{start_date or 'All'} to {end_date or 'Today'}",
        "columns": ["Expense No", "Date", "Category", "Title", "Vendor", "Amount", "Tax", "Total", "Mode", "Status"],
        "rows": [
            {
                "Expense No": e.expense_number,
                "Date": e.expense_date.isoformat(),
                "Category": e.category,
                "Title": e.title,
                "Vendor": e.vendor_name or "",
                "Amount": float(e.amount),
                "Tax": float(e.tax_amount),
                "Total": float(e.total_amount),
                "Mode": e.payment_mode,
                "Status": e.approval_status,
            }
            for e in rows
        ],
    }
    if format == "csv":
        return Response(
            content=export_report_csv(payload),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=expenses.csv"},
        )
    return Response(
        content=export_report_excel(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=expenses.xlsx"},
    )


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(
    payload: ExpenseCreate,
    request: Request,
    user: User = Depends(require_permission("expenses:create")),
    db: Session = Depends(get_db),
) -> ExpenseOut:
    account = resolve_account(db, payload.account_id, payload.payment_mode)
    total_amount = (Decimal(payload.amount) + Decimal(payload.tax_amount)).quantize(Decimal("0.01"))

    biz = db.scalar(select(BusinessSettings).limit(1))
    effective_perms = get_effective_permissions(db, user)
    can_auto_approve = user.is_owner or (user.role and user.role.name == ROLE_OWNER) or (
        "expenses:approve" in effective_perms
    )
    needs_approval = bool(
        biz
        and biz.require_expense_approval
        and total_amount >= biz.expense_approval_threshold
        and not can_auto_approve
    )
    status = "PENDING" if needs_approval else "APPROVED"

    exp = Expense(
        expense_number=generate_sequential_code(db, Expense, "expense_number", "EXP-", 5),
        expense_date=payload.expense_date,
        category=payload.category,
        title=payload.title.strip(),
        description=payload.description,
        amount=payload.amount,
        tax_amount=payload.tax_amount,
        total_amount=total_amount,
        payment_mode=payload.payment_mode,
        account_id=account.id,
        vendor_name=payload.vendor_name,
        approval_status=status,
        approved_by=user.id if status == "APPROVED" else None,
        created_by=user.id,
    )
    db.add(exp)
    db.flush()

    if status == "APPROVED":
        record_financial_entry(
            db,
            account_id=account.id,
            tx_date=exp.expense_date,
            tx_type="EXPENSE",
            debit=exp.total_amount,
            credit=Decimal("0.00"),
            payment_mode=exp.payment_mode,
            description=f"Expense [{exp.category}]: {exp.title}",
            reference_type="EXPENSE",
            reference_id=exp.id,
            reference_number=exp.expense_number,
            user_id=user.id,
        )

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="expenses",
        entity_type="expense",
        entity_id=exp.id,
        description=f"Created expense {exp.expense_number} ({exp.title}, Rs. {exp.total_amount}, {status}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(select(Expense).options(joinedload(Expense.account)).where(Expense.id == exp.id))
    return _to_expense_out(loaded)


@router.patch("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    request: Request,
    user: User = Depends(require_permission("expenses:create")),
    db: Session = Depends(get_db),
) -> ExpenseOut:
    exp = db.scalar(select(Expense).options(joinedload(Expense.account)).where(Expense.id == expense_id))
    if not exp:
        raise NotFoundError("Expense not found.")
    if exp.approval_status == "APPROVED" and not user.is_owner:
        raise ValidationError("Approved expenses can only be modified by the Owner.")

    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(exp, k, v)
    exp.total_amount = (Decimal(exp.amount) + Decimal(exp.tax_amount)).quantize(Decimal("0.01"))

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="expenses",
        entity_type="expense",
        entity_id=exp.id,
        description=f"Updated expense {exp.expense_number}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(select(Expense).options(joinedload(Expense.account)).where(Expense.id == exp.id))
    return _to_expense_out(loaded)


@router.patch("/{expense_id}/approval", response_model=ExpenseOut)
def approve_or_reject_expense(
    expense_id: int,
    payload: ExpenseApprovalRequest,
    request: Request,
    user: User = Depends(require_permission("expenses:approve")),
    db: Session = Depends(get_db),
) -> ExpenseOut:
    exp = db.scalar(select(Expense).where(Expense.id == expense_id).with_for_update())
    if not exp:
        raise NotFoundError("Expense not found.")
    if exp.approval_status != "PENDING":
        raise ValidationError(f"Expense is already {exp.approval_status}.")

    exp.approval_status = payload.approval_status
    exp.approved_by = user.id

    if payload.approval_status == "APPROVED":
        account = resolve_account(db, exp.account_id, exp.payment_mode)
        exp.account_id = account.id
        record_financial_entry(
            db,
            account_id=account.id,
            tx_date=exp.expense_date,
            tx_type="EXPENSE",
            debit=exp.total_amount,
            credit=Decimal("0.00"),
            payment_mode=exp.payment_mode,
            description=f"Approved Expense [{exp.category}]: {exp.title}",
            reference_type="EXPENSE",
            reference_id=exp.id,
            reference_number=exp.expense_number,
            user_id=user.id,
        )

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action=f"EXPENSE_{payload.approval_status}",
        module="expenses",
        entity_type="expense",
        entity_id=exp.id,
        description=f"{payload.approval_status} expense {exp.expense_number} (Rs. {exp.total_amount}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(select(Expense).options(joinedload(Expense.account)).where(Expense.id == exp.id))
    return _to_expense_out(loaded)


@router.post("/{expense_id}/attachment", response_model=ExpenseOut)
def upload_expense_attachment(
    expense_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_permission("expenses:create")),
    db: Session = Depends(get_db),
) -> ExpenseOut:
    exp = db.scalar(select(Expense).options(joinedload(Expense.account)).where(Expense.id == expense_id))
    if not exp:
        raise NotFoundError("Expense not found.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
        raise ValidationError("Bill attachment must be PDF, PNG, JPG, or WEBP.")

    target_dir = settings.upload_path / "expenses"
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"exp_{exp.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
    with (target_dir / filename).open("wb") as buf:
        shutil.copyfileobj(file.file, buf)

    exp.attachment_url = f"/uploads/expenses/{filename}"
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPLOAD_ATTACHMENT",
        module="expenses",
        entity_type="expense",
        entity_id=exp.id,
        description=f"Uploaded bill attachment for expense {exp.expense_number}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(select(Expense).options(joinedload(Expense.account)).where(Expense.id == exp.id))
    return _to_expense_out(loaded)


@router.delete("/{expense_id}", response_model=MessageResponse)
def delete_expense(
    expense_id: int,
    request: Request,
    user: User = Depends(require_permission("expenses:delete")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    exp = db.scalar(select(Expense).where(Expense.id == expense_id))
    if not exp:
        raise NotFoundError("Expense not found.")
    if exp.approval_status == "APPROVED" and not user.is_owner:
        raise ValidationError("Only Owner can delete approved expenses.")
    exp_num = exp.expense_number
    db.delete(exp)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="DELETE",
        module="expenses",
        entity_type="expense",
        entity_id=expense_id,
        description=f"Deleted expense {exp_num}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"Expense '{exp_num}' deleted.")

