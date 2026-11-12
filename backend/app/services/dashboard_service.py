from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.models.finance import Expense, FinancialTransaction
from app.models.inventory import Category, Product
from app.models.parties import Customer, Supplier
from app.models.purchase import PurchaseInvoice
from app.models.sales import CustomerOrder, Sale, SaleItem, SaleReturn
from app.schemas.dashboard import (
    ChartPoint,
    DashboardKPIs,
    DashboardOverview,
    LowStockAlertItem,
    RecentTransactionItem,
)


def _dec(val) -> Decimal:
    return Decimal(val or 0).quantize(Decimal("0.01"))


def get_dashboard_overview(db: Session, include_financials: bool = True) -> DashboardOverview:
    today = date.today()
    month_start = today.replace(day=1)

    total_sales_today = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
                Sale.sale_date == today, Sale.status == "CONFIRMED"
            )
        )
    )
    total_sales_this_month = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
                Sale.sale_date >= month_start, Sale.status == "CONFIRMED"
            )
        )
    )
    total_purchases = _dec(
        db.scalar(
            select(func.coalesce(func.sum(PurchaseInvoice.total_amount), 0)).where(
                PurchaseInvoice.status != "CANCELLED"
            )
        )
    )

    # Accrual Revenue (Net of GST and Sales Returns)
    gross_sales_excl_tax = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total_amount - Sale.tax_amount), 0)).where(
                Sale.status == "CONFIRMED"
            )
        )
    )
    returns_excl_tax = _dec(
        db.scalar(select(func.coalesce(func.sum(SaleReturn.total_amount), 0)))
    )
    total_revenue = max(Decimal("0.00"), _dec(gross_sales_excl_tax - returns_excl_tax))

    total_cogs = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total_cogs), 0)).where(Sale.status == "CONFIRMED")
        )
    )
    total_expenses = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.approval_status == "APPROVED"
            )
        )
    )
    gross_profit = _dec(total_revenue - total_cogs)
    net_profit = _dec(gross_profit - total_expenses)

    total_customers = int(db.scalar(select(func.count()).select_from(Customer).where(Customer.is_active.is_(True))) or 0)
    total_suppliers = int(db.scalar(select(func.count()).select_from(Supplier).where(Supplier.is_active.is_(True))) or 0)
    total_products = int(db.scalar(select(func.count()).select_from(Product).where(Product.is_active.is_(True))) or 0)
    total_stock_value = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Product.current_stock * Product.purchase_price), 0)).where(
                Product.is_active.is_(True)
            )
        )
    )
    pending_orders = int(
        db.scalar(
            select(func.count())
            .select_from(CustomerOrder)
            .where(CustomerOrder.order_status.in_(["PENDING", "CONFIRMED", "PROCESSING", "READY_FOR_DELIVERY", "DISPATCHED"]))
        )
        or 0
    )
    customer_outstanding = _dec(
        db.scalar(select(func.coalesce(func.sum(Customer.outstanding_balance), 0)))
    )
    supplier_outstanding = _dec(
        db.scalar(select(func.coalesce(func.sum(Supplier.outstanding_balance), 0)))
    )

    kpis = DashboardKPIs(
        total_sales_today=total_sales_today,
        total_sales_this_month=total_sales_this_month,
        total_purchases=total_purchases,
        total_revenue=total_revenue,
        total_expenses=total_expenses if include_financials else None,
        gross_profit=gross_profit if include_financials else None,
        net_profit=net_profit if include_financials else None,
        total_customers=total_customers,
        total_suppliers=total_suppliers,
        total_products=total_products,
        total_stock_value=total_stock_value,
        pending_orders=pending_orders,
        customer_outstanding=customer_outstanding,
        supplier_outstanding=supplier_outstanding,
    )

    # Last 6 months bucket keys
    month_keys: List[tuple[str, date, date]] = []
    cur_y, cur_m = today.year, today.month
    for _ in range(6):
        m_start = date(cur_y, cur_m, 1)
        if cur_m == 12:
            m_end = date(cur_y + 1, 1, 1) - timedelta(days=1)
        else:
            m_end = date(cur_y, cur_m + 1, 1) - timedelta(days=1)
        month_keys.append((m_start.strftime("%b %Y"), m_start, m_end))
        cur_m -= 1
        if cur_m == 0:
            cur_m = 12
            cur_y -= 1
    month_keys.reverse()

    monthly_sales: List[ChartPoint] = []
    monthly_purchases: List[ChartPoint] = []
    profit_loss_series: List[ChartPoint] = []

    for label, m_start, m_end in month_keys:
        m_sale = _dec(
            db.scalar(
                select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
                    Sale.sale_date >= m_start, Sale.sale_date <= m_end, Sale.status == "CONFIRMED"
                )
            )
        )
        m_rev = _dec(
            db.scalar(
                select(func.coalesce(func.sum(Sale.total_amount - Sale.tax_amount), 0)).where(
                    Sale.sale_date >= m_start, Sale.sale_date <= m_end, Sale.status == "CONFIRMED"
                )
            )
        )
        m_cogs = _dec(
            db.scalar(
                select(func.coalesce(func.sum(Sale.total_cogs), 0)).where(
                    Sale.sale_date >= m_start, Sale.sale_date <= m_end, Sale.status == "CONFIRMED"
                )
            )
        )
        m_pur = _dec(
            db.scalar(
                select(func.coalesce(func.sum(PurchaseInvoice.total_amount), 0)).where(
                    PurchaseInvoice.invoice_date >= m_start,
                    PurchaseInvoice.invoice_date <= m_end,
                    PurchaseInvoice.status != "CANCELLED",
                )
            )
        )
        m_exp = _dec(
            db.scalar(
                select(func.coalesce(func.sum(Expense.amount), 0)).where(
                    Expense.expense_date >= m_start,
                    Expense.expense_date <= m_end,
                    Expense.approval_status == "APPROVED",
                )
            )
        )
        m_net_profit = _dec((m_rev - m_cogs) - m_exp)
        monthly_sales.append(ChartPoint(label=label, value=m_sale))
        monthly_purchases.append(ChartPoint(label=label, value=m_pur))
        if include_financials:
            profit_loss_series.append(
                ChartPoint(label=label, value=m_rev, secondary_value=_dec(m_cogs + m_exp), tertiary_value=m_net_profit)
            )

    # 4. Wholesale vs Retail Sales
    ws_total = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
                Sale.sale_type == "WHOLESALE", Sale.status == "CONFIRMED"
            )
        )
    )
    rt_total = _dec(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
                Sale.sale_type == "RETAIL", Sale.status == "CONFIRMED"
            )
        )
    )
    wholesale_vs_retail = [
        ChartPoint(label="Wholesale", value=ws_total),
        ChartPoint(label="Retail", value=rt_total),
    ]

    # 5. Top-Selling Products
    top_prod_rows = db.execute(
        select(
            Product.name,
            func.coalesce(func.sum(SaleItem.total_amount), 0).label("revenue"),
            func.coalesce(func.sum(SaleItem.quantity - SaleItem.returned_quantity), 0).label("qty"),
        )
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.status == "CONFIRMED")
        .group_by(Product.id, Product.name)
        .order_by(desc("revenue"))
        .limit(7)
    ).all()
    top_selling_products = [
        ChartPoint(label=row[0], value=_dec(row[1]), secondary_value=_dec(row[2]))
        for row in top_prod_rows
    ]

    # 6. Sales by Product Category
    cat_rows = db.execute(
        select(
            Category.name,
            func.coalesce(func.sum(SaleItem.total_amount), 0).label("revenue"),
        )
        .join(Product, Product.category_id == Category.id)
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.status == "CONFIRMED")
        .group_by(Category.id, Category.name)
        .order_by(desc("revenue"))
    ).all()
    sales_by_category = [ChartPoint(label=row[0], value=_dec(row[1])) for row in cat_rows]

    # 7. Daily Revenue Trends (Last 14 days)
    start_14 = today - timedelta(days=13)
    daily_rows = db.execute(
        select(Sale.sale_date, func.coalesce(func.sum(Sale.total_amount), 0))
        .where(Sale.sale_date >= start_14, Sale.status == "CONFIRMED")
        .group_by(Sale.sale_date)
    ).all()
    daily_map: Dict[date, Decimal] = {r[0]: _dec(r[1]) for r in daily_rows}
    daily_revenue_trends: List[ChartPoint] = []
    for offset in range(14):
        d = start_14 + timedelta(days=offset)
        daily_revenue_trends.append(ChartPoint(label=d.strftime("%d %b"), value=daily_map.get(d, Decimal("0.00"))))

    # Recent Financial Transactions or Sales
    recent_transactions: List[RecentTransactionItem] = []
    if include_financials:
        fin_rows = db.scalars(
            select(FinancialTransaction).order_by(desc(FinancialTransaction.created_at)).limit(8)
        ).all()
        for ft in fin_rows:
            amt = ft.credit if ft.credit > Decimal("0") else ft.debit
            recent_transactions.append(
                RecentTransactionItem(
                    id=ft.id,
                    date=ft.transaction_date.isoformat(),
                    type=ft.transaction_type,
                    reference=ft.transaction_number,
                    party=ft.description,
                    amount=_dec(amt),
                    status="CREDIT" if ft.credit > Decimal("0") else "DEBIT",
                )
            )
    else:
        sale_rows = db.scalars(select(Sale).order_by(desc(Sale.created_at)).limit(8)).all()
        for s in sale_rows:
            recent_transactions.append(
                RecentTransactionItem(
                    id=s.id,
                    date=s.sale_date.isoformat(),
                    type=f"{s.sale_type} SALE",
                    reference=s.invoice_number,
                    party=s.customer_name_snapshot,
                    amount=_dec(s.total_amount),
                    status=s.payment_status,
                )
            )

    low_stock_rows = db.scalars(
        select(Product)
        .options(joinedload(Product.category))
        .where(Product.is_active.is_(True), Product.current_stock <= Product.min_stock_level)
        .order_by(Product.current_stock.asc())
        .limit(10)
    ).all()
    low_stock_alerts = [
        LowStockAlertItem(
            id=p.id,
            product_code=p.product_code,
            name=p.name,
            category_name=p.category.name if p.category else "",
            current_stock=p.current_stock,
            min_stock_level=p.min_stock_level,
            unit=p.unit,
        )
        for p in low_stock_rows
    ]

    return DashboardOverview(
        kpis=kpis,
        monthly_sales=monthly_sales,
        monthly_purchases=monthly_purchases,
        profit_loss_series=profit_loss_series,
        wholesale_vs_retail=wholesale_vs_retail,
        top_selling_products=top_selling_products,
        sales_by_category=sales_by_category,
        daily_revenue_trends=daily_revenue_trends,
        recent_transactions=recent_transactions,
        low_stock_alerts=low_stock_alerts,
    )

