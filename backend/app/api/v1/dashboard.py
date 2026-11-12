from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_effective_permissions, require_permission
from app.core.database import get_db
from app.core.rbac import ROLE_OWNER
from app.models.auth import User
from app.models.inventory import Product
from app.models.parties import Customer, Supplier
from app.models.purchase import PurchaseOrder
from app.models.sales import CustomerOrder, Sale
from app.schemas.dashboard import DashboardOverview
from app.services.dashboard_service import get_dashboard_overview

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Global Search"])


@router.get("/overview", response_model=DashboardOverview)
def dashboard_overview(
    user: User = Depends(require_permission("dashboard:view")),
    db: Session = Depends(get_db),
) -> DashboardOverview:
    perms = get_effective_permissions(db, user)
    include_fin = user.is_owner or (user.role and user.role.name == ROLE_OWNER) or ("dashboard:financial_kpis" in perms)
    return get_dashboard_overview(db, include_financials=include_fin)


@router.get("/search")
def global_search(
    q: str = Query(..., min_length=1, max_length=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Global top-bar search across permitted ERP modules."""
    perms = get_effective_permissions(db, user)
    is_owner = user.is_owner or (user.role and user.role.name == ROLE_OWNER)
    pat = f"%{q.strip()}%"
    results: list[dict] = []

    if is_owner or "products:view" in perms:
        prods = db.scalars(
            select(Product)
            .where(Product.is_active.is_(True), or_(Product.name.ilike(pat), Product.product_code.ilike(pat), Product.barcode == q.strip()))
            .limit(5)
        ).all()
        for p in prods:
            results.append({"type": "Product", "label": f"{p.product_code} — {p.name}", "sub": f"Stock: {p.current_stock} {p.unit}", "route": "/products"})

    if is_owner or "customers:view" in perms:
        custs = db.scalars(
            select(Customer)
            .where(Customer.is_active.is_(True), or_(Customer.name.ilike(pat), Customer.mobile.ilike(pat), Customer.customer_code.ilike(pat)))
            .limit(5)
        ).all()
        for c in custs:
            results.append({"type": "Customer", "label": c.name, "sub": f"{c.customer_type} | {c.mobile}", "route": "/customers"})

    if is_owner or "suppliers:view" in perms:
        sups = db.scalars(
            select(Supplier)
            .where(Supplier.is_active.is_(True), or_(Supplier.company_name.ilike(pat), Supplier.mobile.ilike(pat), Supplier.supplier_code.ilike(pat)))
            .limit(5)
        ).all()
        for s in sups:
            results.append({"type": "Supplier", "label": s.company_name, "sub": s.mobile, "route": "/suppliers"})

    if is_owner or "sales:view" in perms:
        sales = db.scalars(
            select(Sale)
            .where(or_(Sale.invoice_number.ilike(pat), Sale.customer_name_snapshot.ilike(pat)))
            .limit(5)
        ).all()
        for s in sales:
            results.append({"type": "Sale Invoice", "label": s.invoice_number, "sub": f"{s.customer_name_snapshot} | Rs. {s.total_amount}", "route": "/sales"})

    if is_owner or "orders:view" in perms:
        orders = db.scalars(select(CustomerOrder).where(CustomerOrder.order_number.ilike(pat)).limit(5)).all()
        for o in orders:
            results.append({"type": "Order", "label": o.order_number, "sub": o.order_status, "route": "/orders"})

    if is_owner or "purchases:view" in perms:
        pos = db.scalars(select(PurchaseOrder).where(PurchaseOrder.po_number.ilike(pat)).limit(5)).all()
        for po in pos:
            results.append({"type": "Purchase Order", "label": po.po_number, "sub": po.status, "route": "/purchases"})

    return {"results": results}

