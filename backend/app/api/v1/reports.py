from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_effective_permissions, require_permission
from app.core.database import get_db
from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.core.rbac import ROLE_OWNER
from app.models.auth import User
from app.models.organization import BusinessSettings
from app.models.parties import Customer
from app.services.export_service import (
    build_customer_statement_pdf,
    export_report_csv,
    export_report_excel,
    export_report_pdf,
)
from app.services.report_service import build_customer_ledger_entries, generate_report_data

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])

FINANCIAL_REPORTS = {"profit_and_loss", "payment_collection", "expense_report"}
SUPPORTED_REPORTS = {
    "daily_sales",
    "monthly_sales",
    "yearly_sales",
    "purchase_report",
    "wholesale_sales",
    "retail_sales",
    "product_performance",
    "inventory_report",
    "low_stock_report",
    "customer_outstanding",
    "customer_statement",
    "supplier_outstanding",
    "expense_report",
    "profit_and_loss",
    "payment_collection",
    "employee_activity",
}


def _check_report_access(db: Session, user: User, report_type: str) -> None:
    if report_type not in SUPPORTED_REPORTS:
        raise ValidationError(f"Unsupported report type '{report_type}'.")
    if user.is_owner or (user.role and user.role.name == ROLE_OWNER):
        return
    perms = get_effective_permissions(db, user)
    if report_type in FINANCIAL_REPORTS and "reports:financial" not in perms:
        raise PermissionDeniedError("Financial report access requires 'reports:financial' permission.")
    if report_type == "employee_activity" and "audit:view" not in perms:
        raise PermissionDeniedError("Employee activity report requires Owner or 'audit:view' permission.")


@router.get("/{report_type}")
def get_report(
    report_type: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[int] = None,
    user_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    user: User = Depends(require_permission("reports:view")),
    db: Session = Depends(get_db),
) -> dict:
    _check_report_access(db, user, report_type)
    return generate_report_data(
        db,
        report_type,
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        user_id=user_id,
        customer_id=customer_id,
    )


@router.get("/{report_type}/export")
def export_report(
    report_type: str,
    format: str = Query("pdf", pattern="^(pdf|xlsx|csv)$"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[int] = None,
    user_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    user: User = Depends(require_permission("reports:export")),
    db: Session = Depends(get_db),
) -> Response:
    _check_report_access(db, user, report_type)
    if report_type == "customer_statement" and customer_id is not None and format == "pdf":
        c = db.scalar(select(Customer).where(Customer.id == customer_id))
        if not c:
            raise NotFoundError("Customer not found.")
        biz = db.scalar(select(BusinessSettings).limit(1))
        entries = build_customer_ledger_entries(db, c)
        data = build_customer_statement_pdf(c, entries, biz)
        safe_code = c.customer_code.replace(" ", "_")
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Customer_Statement_{safe_code}.pdf"},
        )

    report = generate_report_data(
        db,
        report_type,
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        user_id=user_id,
        customer_id=customer_id,
    )
    if format == "pdf":
        data = export_report_pdf(report)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={report_type}.pdf"},
        )
    elif format == "xlsx":
        data = export_report_excel(report)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={report_type}.xlsx"},
        )
    else:
        data = export_report_csv(report)
        return Response(
            content=data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={report_type}.csv"},
        )

