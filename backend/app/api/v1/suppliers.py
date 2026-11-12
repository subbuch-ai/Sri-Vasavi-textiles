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
from app.models.finance import Payment
from app.models.parties import Supplier
from app.models.purchase import PurchaseInvoice
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.parties import LedgerEntryOut, SupplierCreate, SupplierOut, SupplierUpdate
from app.services.audit_service import record_audit_log
from app.services.export_service import export_report_csv, export_report_excel
from app.services.numbering_service import generate_sequential_code

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("", response_model=PaginatedResponse[SupplierOut])
def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: Optional[str] = None,
    with_dues_only: bool = False,
    _: User = Depends(require_permission("suppliers:view")),
    db: Session = Depends(get_db),
) -> PaginatedResponse[SupplierOut]:
    stmt = select(Supplier).where(Supplier.is_active.is_(True))
    if with_dues_only:
        stmt = stmt.where(Supplier.outstanding_balance > 0)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Supplier.company_name.ilike(pat),
                Supplier.supplier_code.ilike(pat),
                Supplier.contact_person.ilike(pat),
                Supplier.mobile.ilike(pat),
                Supplier.gst_number.ilike(pat),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(desc(Supplier.id)).offset((page - 1) * page_size).limit(page_size)).all()
    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedResponse(
        items=[SupplierOut.model_validate(s) for s in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/export")
def export_suppliers(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    _: User = Depends(require_permission("suppliers:view")),
    db: Session = Depends(get_db),
) -> Response:
    rows = db.scalars(select(Supplier).where(Supplier.is_active.is_(True)).order_by(Supplier.company_name)).all()
    payload = {
        "report_type": "suppliers",
        "title": "Supplier Master & Payables",
        "period": "All Active Suppliers",
        "columns": ["Code", "Company Name", "Contact Person", "Mobile", "Email", "GSTIN", "City", "Total Purchases", "Total Payments", "Outstanding"],
        "rows": [
            {
                "Code": s.supplier_code,
                "Company Name": s.company_name,
                "Contact Person": s.contact_person or "",
                "Mobile": s.mobile,
                "Email": s.email or "",
                "GSTIN": s.gst_number or "",
                "City": s.city or "",
                "Total Purchases": float(s.total_purchases),
                "Total Payments": float(s.total_payments),
                "Outstanding": float(s.outstanding_balance),
            }
            for s in rows
        ],
    }
    if format == "csv":
        data = export_report_csv(payload)
        return Response(content=data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=suppliers.csv"})
    data = export_report_excel(payload)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=suppliers.xlsx"},
    )


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(
    supplier_id: int,
    _: User = Depends(require_permission("suppliers:view")),
    db: Session = Depends(get_db),
) -> SupplierOut:
    s = db.scalar(select(Supplier).where(Supplier.id == supplier_id))
    if not s:
        raise NotFoundError("Supplier not found.")
    return SupplierOut.model_validate(s)


@router.get("/{supplier_id}/ledger", response_model=List[LedgerEntryOut])
def get_supplier_ledger(
    supplier_id: int,
    _: User = Depends(require_permission("suppliers:view")),
    db: Session = Depends(get_db),
) -> List[LedgerEntryOut]:
    s = db.scalar(select(Supplier).where(Supplier.id == supplier_id))
    if not s:
        raise NotFoundError("Supplier not found.")

    entries: list[tuple] = []
    invoices = db.scalars(
        select(PurchaseInvoice).where(PurchaseInvoice.supplier_id == supplier_id, PurchaseInvoice.status != "CANCELLED")
    ).all()
    for inv in invoices:
        entries.append((inv.invoice_date, inv.created_at, inv.invoice_number, "PURCHASE", f"Purchase Bill ({inv.supplier_invoice_no})", Decimal("0.00"), inv.total_amount))

    payments = db.scalars(
        select(Payment).where(Payment.supplier_id == supplier_id, Payment.status == "APPROVED")
    ).all()
    for pay in payments:
        entries.append((pay.payment_date, pay.created_at, pay.payment_number, "PAYMENT", f"Payment via {pay.payment_mode}", pay.amount, Decimal("0.00")))

    entries.sort(key=lambda x: (x[0], x[1]))
    running = Decimal(s.opening_balance)
    ledger: List[LedgerEntryOut] = []
    if running != Decimal("0.00"):
        ledger.append(
            LedgerEntryOut(
                date=s.created_at.date(),
                reference=s.supplier_code,
                entry_type="OPENING",
                description="Opening Balance",
                debit=Decimal("0.00"),
                credit=running if running > 0 else Decimal("0.00"),
                balance=running,
            )
        )
    for dt, _, ref, etype, desc_text, debit, credit in entries:
        running = running + Decimal(credit) - Decimal(debit)
        ledger.append(
            LedgerEntryOut(
                date=dt,
                reference=ref,
                entry_type=etype,
                description=desc_text,
                debit=debit,
                credit=credit,
                balance=running,
            )
        )
    return ledger


@router.post("", response_model=SupplierOut, status_code=201)
def create_supplier(
    payload: SupplierCreate,
    request: Request,
    user: User = Depends(require_permission("suppliers:create")),
    db: Session = Depends(get_db),
) -> SupplierOut:
    code = (
        payload.supplier_code.strip().upper()
        if payload.supplier_code
        else generate_sequential_code(db, Supplier, "supplier_code", "SVT-SUP-", 4)
    )
    if db.scalar(select(Supplier.id).where(Supplier.supplier_code == code)):
        raise ConflictError(f"Supplier code '{code}' already exists.")

    s = Supplier(
        supplier_code=code,
        company_name=payload.company_name.strip(),
        contact_person=payload.contact_person,
        mobile=payload.mobile.strip(),
        email=str(payload.email).lower() if payload.email else None,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        gst_number=payload.gst_number.strip().upper() if payload.gst_number else None,
        opening_balance=payload.opening_balance,
        outstanding_balance=payload.opening_balance,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    db.add(s)
    db.flush()
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="suppliers",
        entity_type="supplier",
        entity_id=s.id,
        description=f"Added supplier '{s.company_name}' ({s.supplier_code}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(s)
    return SupplierOut.model_validate(s)


@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    request: Request,
    user: User = Depends(require_permission("suppliers:edit")),
    db: Session = Depends(get_db),
) -> SupplierOut:
    s = db.scalar(select(Supplier).where(Supplier.id == supplier_id))
    if not s:
        raise NotFoundError("Supplier not found.")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("gst_number"):
        updates["gst_number"] = updates["gst_number"].strip().upper()
    for k, v in updates.items():
        setattr(s, k, v)
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="suppliers",
        entity_type="supplier",
        entity_id=s.id,
        description=f"Updated supplier '{s.company_name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(s)
    return SupplierOut.model_validate(s)


@router.delete("/{supplier_id}", response_model=MessageResponse)
def delete_supplier(
    supplier_id: int,
    request: Request,
    user: User = Depends(require_permission("suppliers:delete")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    s = db.scalar(select(Supplier).where(Supplier.id == supplier_id))
    if not s:
        raise NotFoundError("Supplier not found.")
    s.is_active = False
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="DEACTIVATE",
        module="suppliers",
        entity_type="supplier",
        entity_id=s.id,
        description=f"Deactivated supplier '{s.company_name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"Supplier '{s.company_name}' deactivated.")

