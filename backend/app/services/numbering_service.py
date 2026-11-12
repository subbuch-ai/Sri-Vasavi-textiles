from datetime import date
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.organization import BusinessSettings


def generate_sequential_code(
    db: Session,
    model_class,
    column_name: str,
    prefix: str,
    padding: int = 5,
) -> str:
    """Generate a readable sequential document/entity code such as SVT-PRD-00001."""
    col = getattr(model_class, column_name)
    count = db.scalar(select(func.count()).select_from(model_class)) or 0
    seq = count + 1
    while True:
        candidate = f"{prefix}{seq:0{padding}d}"
        exists = db.scalar(select(model_class.id).where(col == candidate))
        if not exists:
            return candidate
        seq += 1


def next_settings_document_number(db: Session, doc_type: str) -> str:
    """
    Atomically lock BusinessSettings row and increment invoice / PO / order counter.
    doc_type: 'INVOICE' | 'PO' | 'ORDER'
    """
    settings_row = db.scalars(select(BusinessSettings).with_for_update()).first()
    if not settings_row:
        settings_row = BusinessSettings(business_name="Sri Vasavi Textiles")
        db.add(settings_row)
        db.flush()

    year_tag = date.today().strftime("%y%m")
    if doc_type == "INVOICE":
        number = f"{settings_row.invoice_prefix}{year_tag}-{settings_row.next_invoice_number:04d}"
        settings_row.next_invoice_number += 1
    elif doc_type == "PO":
        number = f"{settings_row.po_prefix}{year_tag}-{settings_row.next_po_number:04d}"
        settings_row.next_po_number += 1
    elif doc_type == "ORDER":
        number = f"{settings_row.order_prefix}{year_tag}-{settings_row.next_order_number:04d}"
        settings_row.next_order_number += 1
    else:
        raise ValueError(f"Unsupported document type: {doc_type}")

    db.flush()
    return number

