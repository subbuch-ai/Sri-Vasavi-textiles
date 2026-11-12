from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class DashboardKPIs(BaseModel):
    total_sales_today: Decimal
    total_sales_this_month: Decimal
    total_purchases: Decimal
    total_revenue: Decimal
    total_expenses: Optional[Decimal] = None
    gross_profit: Optional[Decimal] = None
    net_profit: Optional[Decimal] = None
    total_customers: int
    total_suppliers: int
    total_products: int
    total_stock_value: Decimal
    pending_orders: int
    customer_outstanding: Decimal
    supplier_outstanding: Decimal


class ChartPoint(BaseModel):
    label: str
    value: Decimal
    secondary_value: Optional[Decimal] = None
    tertiary_value: Optional[Decimal] = None


class RecentTransactionItem(BaseModel):
    id: int
    date: str
    type: str
    reference: str
    party: str
    amount: Decimal
    status: str


class LowStockAlertItem(BaseModel):
    id: int
    product_code: str
    name: str
    category_name: str
    current_stock: Decimal
    min_stock_level: Decimal
    unit: str


class DashboardOverview(BaseModel):
    kpis: DashboardKPIs
    monthly_sales: List[ChartPoint]
    monthly_purchases: List[ChartPoint]
    profit_loss_series: List[ChartPoint]
    wholesale_vs_retail: List[ChartPoint]
    top_selling_products: List[ChartPoint]
    sales_by_category: List[ChartPoint]
    daily_revenue_trends: List[ChartPoint]
    recent_transactions: List[RecentTransactionItem]
    low_stock_alerts: List[LowStockAlertItem]

