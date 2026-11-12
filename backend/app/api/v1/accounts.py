from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.auth import User
from app.models.finance import Account, Expense, FinancialTransaction, Payment
from app.models.parties import Customer, Supplier
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.finance import (
    AccountCreate,
    AccountOut,
    AccountTransferCreate,
    FinancialTransactionOut,
)
from app.services.audit_service import record_audit_log
from app.services.finance_service import record_financial_entry
from app.services.report_service import generate_report_data

router = APIRouter(prefix="/accounts", tags=["Accounts & Financial Management"])


@router.get("", response_model=List[AccountOut])
def list_accounts(
    _: User = Depends(require_permission("accounts:view")),
    db: Session = Depends(get_db),
) -> List[AccountOut]:
    rows = db.scalars(select(Account).where(Account.is_active.is_(True)).order_by(Account.id)).all()
    return [AccountOut.model_validate(a) for a in rows]


@router.post("", response_model=AccountOut, status_code=201)
def create_account(
    payload: AccountCreate,
    request: Request,
    user: User = Depends(require_permission("accounts:manage")),
    db: Session = Depends(get_db),
) -> AccountOut:
    code = payload.code.strip().upper()
    if db.scalar(select(Account.id).where(Account.code == code)):
        raise ConflictError(f"Account code '{code}' already exists.")

    acc = Account(
        code=code,
        name=payload.name.strip(),
        account_type=payload.account_type,
        opening_balance=payload.opening_balance,
        current_balance=payload.opening_balance,
        bank_name=payload.bank_name,
        account_number=payload.account_number,
        ifsc_code=payload.ifsc_code,
        upi_id=payload.upi_id,
        is_default=payload.is_default,
        is_active=True,
    )
    db.add(acc)
    db.flush()

    if payload.opening_balance != Decimal("0.00"):
        record_financial_entry(
            db,
            account_id=acc.id,
            tx_date=date.today(),
            tx_type="OPENING_BALANCE",
            debit=Decimal("0.00"),
            credit=Decimal("0.00"),
            payment_mode="CASH" if acc.account_type == "CASH" else "BANK_TRANSFER",
            description=f"Opening balance set for {acc.name}: Rs. {payload.opening_balance}",
            reference_type="ACCOUNT",
            reference_id=acc.id,
            reference_number=acc.code,
            user_id=user.id,
        )
        acc.current_balance = payload.opening_balance

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="accounts",
        entity_type="account",
        entity_id=acc.id,
        description=f"Created {acc.account_type} account '{acc.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(acc)
    return AccountOut.model_validate(acc)


@router.post("/transfer", response_model=MessageResponse)
def transfer_between_accounts(
    payload: AccountTransferCreate,
    request: Request,
    user: User = Depends(require_permission("accounts:manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if payload.from_account_id == payload.to_account_id:
        raise ValidationError("Source and destination accounts must differ.")

    src = db.scalar(select(Account).where(Account.id == payload.from_account_id))
    dst = db.scalar(select(Account).where(Account.id == payload.to_account_id))
    if not src or not dst:
        raise NotFoundError("Both source and destination accounts must exist.")

    tx_type = "CASH_DEPOSIT" if src.account_type == "CASH" and dst.account_type == "BANK" else "CASH_WITHDRAWAL"
    record_financial_entry(
        db,
        account_id=src.id,
        tx_date=payload.transfer_date,
        tx_type=tx_type,
        debit=payload.amount,
        credit=Decimal("0.00"),
        payment_mode="BANK_TRANSFER",
        description=f"Transfer to {dst.name}: {payload.description}",
        reference_type="CONTRA",
        reference_number=payload.reference_number,
        user_id=user.id,
    )
    record_financial_entry(
        db,
        account_id=dst.id,
        tx_date=payload.transfer_date,
        tx_type=tx_type,
        debit=Decimal("0.00"),
        credit=payload.amount,
        payment_mode="BANK_TRANSFER",
        description=f"Transfer from {src.name}: {payload.description}",
        reference_type="CONTRA",
        reference_number=payload.reference_number,
        user_id=user.id,
    )
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CONTRA_TRANSFER",
        module="accounts",
        description=f"Transferred Rs. {payload.amount} from {src.name} to {dst.name}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message="Account transfer completed.")


@router.get("/transactions", response_model=PaginatedResponse[FinancialTransactionOut])
def list_financial_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    account_id: Optional[int] = None,
    account_type: Optional[str] = None,
    transaction_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    _: User = Depends(require_permission("accounts:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[FinancialTransactionOut]:
    stmt = select(FinancialTransaction).options(joinedload(FinancialTransaction.account))
    if account_id:
        stmt = stmt.where(FinancialTransaction.account_id == account_id)
    if account_type:
        stmt = stmt.join(Account, FinancialTransaction.account_id == Account.id).where(
            Account.account_type == account_type
        )
    if transaction_type:
        stmt = stmt.where(FinancialTransaction.transaction_type == transaction_type)
    if start_date:
        stmt = stmt.where(FinancialTransaction.transaction_date >= start_date)
    if end_date:
        stmt = stmt.where(FinancialTransaction.transaction_date <= end_date)

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(FinancialTransaction.id).subquery())) or 0
    rows = db.scalars(
        stmt.order_by(desc(FinancialTransaction.transaction_date), desc(FinancialTransaction.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[
            FinancialTransactionOut(
                id=t.id,
                transaction_number=t.transaction_number,
                transaction_date=t.transaction_date,
                account_id=t.account_id,
                account_name=t.account.name if t.account else None,
                transaction_type=t.transaction_type,
                reference_type=t.reference_type,
                reference_id=t.reference_id,
                reference_number=t.reference_number,
                description=t.description,
                debit=t.debit,
                credit=t.credit,
                payment_mode=t.payment_mode,
                created_by=t.created_by,
                created_at=t.created_at,
            )
            for t in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/summary")
def get_accounts_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    _: User = Depends(require_permission("accounts:view")),
    db: Session = Depends(get_db),
) -> dict:
    """Cash book balances, Bank balances, Receivables, Payables, Cash Flow, and Accrual P&L summary."""
    accounts = db.scalars(select(Account).where(Account.is_active.is_(True))).all()
    cash_balance = sum(a.current_balance for a in accounts if a.account_type == "CASH")
    bank_balance = sum(a.current_balance for a in accounts if a.account_type in ("BANK", "UPI"))

    total_receivables = db.scalar(select(func.coalesce(func.sum(Customer.outstanding_balance), 0))) or 0
    total_payables = db.scalar(select(func.coalesce(func.sum(Supplier.outstanding_balance), 0))) or 0

    s_date = start_date or date.today().replace(day=1)
    e_date = end_date or date.today()

    inflows = (
        db.scalar(
            select(func.coalesce(func.sum(FinancialTransaction.credit), 0)).where(
                FinancialTransaction.transaction_date >= s_date,
                FinancialTransaction.transaction_date <= e_date,
            )
        )
        or 0
    )
    outflows = (
        db.scalar(
            select(func.coalesce(func.sum(FinancialTransaction.debit), 0)).where(
                FinancialTransaction.transaction_date >= s_date,
                FinancialTransaction.transaction_date <= e_date,
            )
        )
        or 0
    )
    pl_report = generate_report_data(db, "profit_and_loss", start_date=s_date, end_date=e_date)

    return {
        "cash_balance": float(Decimal(cash_balance).quantize(Decimal("0.01"))),
        "bank_balance": float(Decimal(bank_balance).quantize(Decimal("0.01"))),
        "total_receivables": float(Decimal(total_receivables).quantize(Decimal("0.01"))),
        "total_payables": float(Decimal(total_payables).quantize(Decimal("0.01"))),
        "cash_flow": {
            "period": f"{s_date} to {e_date}",
            "total_inflows": float(Decimal(inflows).quantize(Decimal("0.01"))),
            "total_outflows": float(Decimal(outflows).quantize(Decimal("0.01"))),
            "net_cash_flow": float(Decimal(Decimal(inflows) - Decimal(outflows)).quantize(Decimal("0.01"))),
        },
        "profit_and_loss": pl_report["summary"],
    }

