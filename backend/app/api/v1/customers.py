from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, require_permission
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.models.auth import User
from app.models.organization import BusinessSettings
from app.models.parties import Customer
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.parties import CustomerCreate, CustomerOut, CustomerUpdate, LedgerEntryOut
from app.services.audit_service import record_audit_log
from app.services.export_service import (
    build_customer_statement_pdf,
    build_customer_statement_report_dict,
    export_report_csv,
    export_report_excel,
)
from app.services.numbering_service import generate_sequential_code
from app.services.report_service import build_customer_ledger_entries

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=PaginatedResponse[CustomerOut])
def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: Optional[str] = None,
    customer_type: Optional[str] = None,
    with_dues_only: bool = False,
    _: User = Depends(require_permission("customers:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[CustomerOut]:
    stmt = select(Customer).where(Customer.is_active.is_(True))
    if customer_type:
        stmt = stmt.where(Customer.customer_type == customer_type)
    if with_dues_only:
        stmt = stmt.where(Customer.outstanding_balance > 0)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Customer.name.ilike(pat),
                Customer.customer_code.ilike(pat),
                Customer.mobile.ilike(pat),
                Customer.city.ilike(pat),
                Customer.gst_number.ilike(pat),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(desc(Customer.id)).offset((page - 1) * page_size).limit(page_size)).all()
    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedResponse(
        items=[CustomerOut.model_validate(c) for c in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/export")
def export_customers(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    _: User = Depends(require_permission("customers:view")),
    db: Session = Depends(get_db),
) -> Response:
    rows = db.scalars(select(Customer).where(Customer.is_active.is_(True)).order_by(Customer.name)).all()
    payload = {
        "report_type": "customers",
        "title": "Customer Directory & Receivables",
        "period": "All Active Customers",
        "columns": ["Code", "Name", "Type", "Mobile", "City", "GSTIN", "Total Purchases", "Total Payments", "Outstanding"],
        "rows": [
            {
                "Code": c.customer_code,
                "Name": c.name,
                "Type": c.customer_type,
                "Mobile": c.mobile,
                "City": c.city or "",
                "GSTIN": c.gst_number or "",
                "Total Purchases": float(c.total_purchases),
                "Total Payments": float(c.total_payments),
                "Outstanding": float(c.outstanding_balance),
            }
            for c in rows
        ],
    }
    if format == "csv":
        data = export_report_csv(payload)
        return Response(content=data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=customers.csv"})
    data = export_report_excel(payload)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=customers.xlsx"},
    )


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    _: User = Depends(require_permission("customers:view")),
    db: Session = Depends(get_db),
) -> CustomerOut:
    c = db.scalar(select(Customer).where(Customer.id == customer_id))
    if not c:
        raise NotFoundError("Customer not found.")
    return CustomerOut.model_validate(c)


@router.get("/{customer_id}/ledger", response_model=List[LedgerEntryOut])
def get_customer_ledger(
    customer_id: int,
    _: User = Depends(require_permission("customers:view")),
    db: Session = Depends(get_db),
) -> List[LedgerEntryOut]:
    c = db.scalar(select(Customer).where(Customer.id == customer_id))
    if not c:
        raise NotFoundError("Customer not found.")
    return build_customer_ledger_entries(db, c)


@router.get("/{customer_id}/statement/export")
def export_customer_statement(
    customer_id: int,
    format: str = Query("pdf", pattern="^(pdf|xlsx|csv)$"),
    _: User = Depends(require_permission("customers:view")),
    db: Session = Depends(get_db),
) -> Response:
    c = db.scalar(select(Customer).where(Customer.id == customer_id))
    if not c:
        raise NotFoundError("Customer not found.")

    ledger = build_customer_ledger_entries(db, c)
    safe_code = c.customer_code.replace(" ", "_")

    if format == "pdf":
        biz = db.scalar(select(BusinessSettings).limit(1))
        data = build_customer_statement_pdf(c, ledger, biz)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Customer_Statement_{safe_code}.pdf"},
        )

    report = build_customer_statement_report_dict(c, ledger)
    if format == "xlsx":
        data = export_report_excel(report)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Customer_Statement_{safe_code}.xlsx"},
        )

    data = export_report_csv(report)
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=Customer_Statement_{safe_code}.csv"},
    )


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(
    payload: CustomerCreate,
    request: Request,
    user: User = Depends(require_permission("customers:create")),
    db: Session = Depends(get_db),
) -> CustomerOut:
    code = (
        payload.customer_code.strip().upper()
        if payload.customer_code
        else generate_sequential_code(db, Customer, "customer_code", "SVT-CUS-", 5)
    )
    if db.scalar(select(Customer.id).where(Customer.customer_code == code)):
        raise ConflictError(f"Customer code '{code}' already exists.")

    c = Customer(
        customer_code=code,
        name=payload.name.strip(),
        mobile=payload.mobile.strip(),
        email=str(payload.email).lower() if payload.email else None,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        customer_type=payload.customer_type,
        gst_number=payload.gst_number.strip().upper() if payload.gst_number else None,
        credit_limit=payload.credit_limit,
        opening_balance=payload.opening_balance,
        outstanding_balance=payload.opening_balance,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    db.add(c)
    db.flush()
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="customers",
        entity_type="customer",
        entity_id=c.id,
        description=f"Added {c.customer_type} customer '{c.name}' ({c.customer_code}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(c)
    return CustomerOut.model_validate(c)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    request: Request,
    user: User = Depends(require_permission("customers:edit")),
    db: Session = Depends(get_db),
) -> CustomerOut:
    c = db.scalar(select(Customer).where(Customer.id == customer_id))
    if not c:
        raise NotFoundError("Customer not found.")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("gst_number"):
        updates["gst_number"] = updates["gst_number"].strip().upper()
    for k, v in updates.items():
        setattr(c, k, v)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="customers",
        entity_type="customer",
        entity_id=c.id,
        description=f"Updated customer '{c.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(c)
    return CustomerOut.model_validate(c)


@router.delete("/{customer_id}", response_model=MessageResponse)
def delete_customer(
    customer_id: int,
    request: Request,
    user: User = Depends(require_permission("customers:delete")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    c = db.scalar(select(Customer).where(Customer.id == customer_id))
    if not c:
        raise NotFoundError("Customer not found.")
    c.is_active = False
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="DEACTIVATE",
        module="customers",
        entity_type="customer",
        entity_id=c.id,
        description=f"Deactivated customer '{c.name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"Customer '{c.name}' deactivated.")

