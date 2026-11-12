from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, extract, func, select
from sqlalchemy.orm import Session, joinedload

from app.models.finance import Expense, FinancialTransaction, Payment
from app.models.inventory import Category, Product
from app.models.organization import AuditLog
from app.models.parties import Customer, Supplier
from app.models.purchase import PurchaseInvoice
from app.models.sales import Sale, SaleItem, SaleReturn
from app.schemas.parties import LedgerEntryOut
from app.services.export_service import build_customer_statement_report_dict


def build_customer_ledger_entries(db: Session, customer: Customer) -> List[LedgerEntryOut]:
    """Build chronological Debit (billed), Credit (paid), and running balance entries for one customer."""
    entries: list[tuple] = []
    sales = db.scalars(select(Sale).where(Sale.customer_id == customer.id, Sale.status == "CONFIRMED")).all()
    for s in sales:
        entries.append(
            (
                s.sale_date,
                s.created_at,
                s.invoice_number,
                "SALE",
                f"{s.sale_type} Invoice ({s.payment_mode} • {s.payment_status})",
                s.total_amount,
                Decimal("0.00"),
            )
        )

    payments = db.scalars(
        select(Payment).where(Payment.customer_id == customer.id, Payment.status == "APPROVED")
    ).all()
    for pay in payments:
        ref_note = f" Ref: {pay.reference_number}" if pay.reference_number else ""
        entries.append(
            (
                pay.payment_date,
                pay.created_at,
                pay.payment_number,
                "PAYMENT",
                f"Collection via {pay.payment_mode}{ref_note}",
                Decimal("0.00"),
                pay.amount,
            )
        )

    entries.sort(key=lambda x: (x[0], x[1]))
    running = Decimal(customer.opening_balance)
    ledger: List[LedgerEntryOut] = []
    if running != Decimal("0.00"):
        ledger.append(
            LedgerEntryOut(
                date=customer.created_at.date(),
                reference=customer.customer_code,
                entry_type="OPENING",
                description="Opening Balance",
                debit=running if running > 0 else Decimal("0.00"),
                credit=-running if running < 0 else Decimal("0.00"),
                balance=running,
            )
        )
    for dt, _, ref, etype, desc_text, debit, credit in entries:
        running = running + Decimal(debit) - Decimal(credit)
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


def _q2(val: Any) -> Decimal:
    return Decimal(val or 0).quantize(Decimal("0.01"))


def _date_bounds(start_date: Optional[date], end_date: Optional[date]) -> tuple[date, date]:
    today = date.today()
    s = start_date or today.replace(day=1)
    e = end_date or today
    return s, e


def generate_report_data(
    db: Session,
    report_type: str,
    *,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[int] = None,
    user_id: Optional[int] = None,
    customer_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Generate structured tabular and summary data for all 15 ERP reports."""
    s_date, e_date = _date_bounds(start_date, end_date)

    if report_type in ("daily_sales", "wholesale_sales", "retail_sales"):
        stmt = (
            select(Sale)
            .options(joinedload(Sale.customer))
            .where(Sale.sale_date >= s_date, Sale.sale_date <= e_date, Sale.status == "CONFIRMED")
        )
        if report_type == "wholesale_sales":
            stmt = stmt.where(Sale.sale_type == "WHOLESALE")
        elif report_type == "retail_sales":
            stmt = stmt.where(Sale.sale_type == "RETAIL")
        rows = db.scalars(stmt.order_by(desc(Sale.sale_date), desc(Sale.id))).all()
        title_map = {
            "daily_sales": "Daily Sales Report",
            "wholesale_sales": "Wholesale Sales Report",
            "retail_sales": "Retail Sales Report",
        }
        return {
            "report_type": report_type,
            "title": title_map[report_type],
            "period": f"{s_date} to {e_date}",
            "summary": {
                "total_invoices": len(rows),
                "total_subtotal": float(_q2(sum(r.subtotal for r in rows))),
                "total_tax": float(_q2(sum(r.tax_amount for r in rows))),
                "total_sales": float(_q2(sum(r.total_amount for r in rows))),
                "total_paid": float(_q2(sum(r.paid_amount for r in rows))),
                "total_pending": float(_q2(sum(r.pending_amount for r in rows))),
            },
            "columns": ["Invoice No", "Date", "Type", "Customer", "Subtotal", "GST", "Total", "Paid", "Pending", "Mode", "Status"],
            "rows": [
                {
                    "_sale_id": r.id,
                    "_customer_id": r.customer_id or 0,
                    "_customer_outstanding": float(r.customer.outstanding_balance) if r.customer else 0.0,
                    "Invoice No": r.invoice_number,
                    "Date": r.sale_date.isoformat(),
                    "Type": r.sale_type,
                    "Customer": r.customer_name_snapshot,
                    "Subtotal": float(r.subtotal),
                    "GST": float(r.tax_amount),
                    "Total": float(r.total_amount),
                    "Paid": float(r.paid_amount),
                    "Pending": float(r.pending_amount),
                    "Mode": r.payment_mode,
                    "Status": r.payment_status,
                }
                for r in rows
            ],
        }

    elif report_type == "monthly_sales":
        rows = db.execute(
            select(
                extract("year", Sale.sale_date).label("yr"),
                extract("month", Sale.sale_date).label("mo"),
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.subtotal), 0),
                func.coalesce(func.sum(Sale.tax_amount), 0),
                func.coalesce(func.sum(Sale.total_amount), 0),
                func.coalesce(func.sum(Sale.total_cogs), 0),
            )
            .where(Sale.sale_date >= s_date, Sale.sale_date <= e_date, Sale.status == "CONFIRMED")
            .group_by("yr", "mo")
            .order_by("yr", "mo")
        ).all()
        formatted = [
            {
                "Month": f"{int(r[0])}-{int(r[1]):02d}",
                "Invoices": int(r[2]),
                "Net Sales": float(_q2(r[3])),
                "GST": float(_q2(r[4])),
                "Gross Sales": float(_q2(r[5])),
                "COGS": float(_q2(r[6])),
                "Gross Profit": float(_q2(Decimal(r[3]) - Decimal(r[6]))),
            }
            for r in rows
        ]
        return {
            "report_type": report_type,
            "title": "Monthly Sales Report",
            "period": f"{s_date} to {e_date}",
            "summary": {
                "total_months": len(formatted),
                "total_sales": float(_q2(sum(Decimal(str(r["Gross Sales"])) for r in formatted))),
            },
            "columns": ["Month", "Invoices", "Net Sales", "GST", "Gross Sales", "COGS", "Gross Profit"],
            "rows": formatted,
        }

    elif report_type == "yearly_sales":
        rows = db.execute(
            select(
                extract("year", Sale.sale_date).label("yr"),
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.subtotal), 0),
                func.coalesce(func.sum(Sale.tax_amount), 0),
                func.coalesce(func.sum(Sale.total_amount), 0),
                func.coalesce(func.sum(Sale.total_cogs), 0),
            )
            .where(Sale.status == "CONFIRMED")
            .group_by("yr")
            .order_by("yr")
        ).all()
        formatted = [
            {
                "Year": str(int(r[0])),
                "Invoices": int(r[1]),
                "Net Sales": float(_q2(r[2])),
                "GST": float(_q2(r[3])),
                "Gross Sales": float(_q2(r[4])),
                "COGS": float(_q2(r[5])),
                "Gross Profit": float(_q2(Decimal(r[2]) - Decimal(r[5]))),
            }
            for r in rows
        ]
        return {
            "report_type": report_type,
            "title": "Yearly Sales Report",
            "period": "All Years",
            "summary": {"total_years": len(formatted)},
            "columns": ["Year", "Invoices", "Net Sales", "GST", "Gross Sales", "COGS", "Gross Profit"],
            "rows": formatted,
        }

    elif report_type == "purchase_report":
        rows = db.scalars(
            select(PurchaseInvoice)
            .options(joinedload(PurchaseInvoice.supplier))
            .where(
                PurchaseInvoice.invoice_date >= s_date,
                PurchaseInvoice.invoice_date <= e_date,
                PurchaseInvoice.status != "CANCELLED",
            )
            .order_by(desc(PurchaseInvoice.invoice_date))
        ).all()
        return {
            "report_type": report_type,
            "title": "Purchase Report",
            "period": f"{s_date} to {e_date}",
            "summary": {
                "total_bills": len(rows),
                "total_purchases": float(_q2(sum(r.total_amount for r in rows))),
                "total_paid": float(_q2(sum(r.paid_amount for r in rows))),
                "total_pending": float(_q2(sum(r.pending_amount for r in rows))),
            },
            "columns": ["Bill No", "Supplier Bill", "Date", "Supplier", "Subtotal", "GST", "Transport", "Total", "Paid", "Pending", "Status"],
            "rows": [
                {
                    "_purchase_invoice_id": r.id,
                    "_supplier_id": r.supplier_id,
                    "_supplier_outstanding": float(r.supplier.outstanding_balance) if r.supplier else 0.0,
                    "Bill No": r.invoice_number,
                    "Supplier Bill": r.supplier_invoice_no,
                    "Date": r.invoice_date.isoformat(),
                    "Supplier": r.supplier.company_name if r.supplier else "",
                    "Subtotal": float(r.subtotal),
                    "GST": float(r.tax_amount),
                    "Transport": float(r.transport_charges),
                    "Total": float(r.total_amount),
                    "Paid": float(r.paid_amount),
                    "Pending": float(r.pending_amount),
                    "Status": r.payment_status,
                }
                for r in rows
            ],
        }

    elif report_type == "product_performance":
        stmt = (
            select(
                Product.product_code,
                Product.name,
                Category.name.label("cat_name"),
                func.coalesce(func.sum(SaleItem.quantity - SaleItem.returned_quantity), 0).label("qty_sold"),
                func.coalesce(func.sum(SaleItem.total_amount - SaleItem.gst_amount), 0).label("net_rev"),
                func.coalesce(func.sum((SaleItem.quantity - SaleItem.returned_quantity) * SaleItem.cost_price), 0).label("cogs"),
            )
            .join(Category, Category.id == Product.category_id)
            .join(SaleItem, SaleItem.product_id == Product.id)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(Sale.sale_date >= s_date, Sale.sale_date <= e_date, Sale.status == "CONFIRMED")
        )
        if category_id:
            stmt = stmt.where(Product.category_id == category_id)
        rows = db.execute(
            stmt.group_by(Product.id, Product.product_code, Product.name, Category.name).order_by(desc("net_rev"))
        ).all()
        formatted = [
            {
                "Code": r[0],
                "Product": r[1],
                "Category": r[2],
                "Qty Sold": float(r[3]),
                "Net Revenue": float(_q2(r[4])),
                "COGS": float(_q2(r[5])),
                "Gross Profit": float(_q2(Decimal(r[4]) - Decimal(r[5]))),
            }
            for r in rows
        ]
        return {
            "report_type": report_type,
            "title": "Product Performance Report",
            "period": f"{s_date} to {e_date}",
            "summary": {"products_sold": len(formatted)},
            "columns": ["Code", "Product", "Category", "Qty Sold", "Net Revenue", "COGS", "Gross Profit"],
            "rows": formatted,
        }

    elif report_type in ("inventory_report", "low_stock_report"):
        stmt = select(Product).options(joinedload(Product.category)).where(Product.is_active.is_(True))
        if category_id:
            stmt = stmt.where(Product.category_id == category_id)
        if report_type == "low_stock_report":
            stmt = stmt.where(Product.current_stock <= Product.min_stock_level)
        rows = db.scalars(stmt.order_by(Product.current_stock.asc(), Product.name)).all()
        return {
            "report_type": report_type,
            "title": "Low Stock Report" if report_type == "low_stock_report" else "Inventory Valuation Report",
            "period": f"As of {date.today().isoformat()}",
            "summary": {
                "total_skus": len(rows),
                "total_units": float(sum(r.current_stock for r in rows)),
                "total_stock_value": float(_q2(sum(r.current_stock * r.purchase_price for r in rows))),
            },
            "columns": ["Code", "Product", "Category", "Unit", "Current Stock", "Min Level", "Purchase Price", "Stock Value"],
            "rows": [
                {
                    "Code": r.product_code,
                    "Product": r.name,
                    "Category": r.category.name if r.category else "",
                    "Unit": r.unit,
                    "Current Stock": float(r.current_stock),
                    "Min Level": float(r.min_stock_level),
                    "Purchase Price": float(r.purchase_price),
                    "Stock Value": float(_q2(r.current_stock * r.purchase_price)),
                }
                for r in rows
            ],
        }

    elif report_type == "customer_outstanding":
        rows = db.scalars(
            select(Customer)
            .where(Customer.outstanding_balance > 0)
            .order_by(desc(Customer.outstanding_balance))
        ).all()
        return {
            "report_type": report_type,
            "title": "Customer Outstanding Receivables Report",
            "period": f"As of {date.today().isoformat()}",
            "summary": {
                "customers_with_dues": len(rows),
                "total_receivable": float(_q2(sum(r.outstanding_balance for r in rows))),
            },
            "columns": ["Code", "Customer", "Type", "Mobile", "Total Purchases", "Total Paid", "Outstanding"],
            "rows": [
                {
                    "_customer_id": r.id,
                    "Code": r.customer_code,
                    "Customer": r.name,
                    "Type": r.customer_type,
                    "Mobile": r.mobile,
                    "Total Purchases": float(r.total_purchases),
                    "Total Paid": float(r.total_payments),
                    "Outstanding": float(r.outstanding_balance),
                }
                for r in rows
            ],
        }

    elif report_type == "supplier_outstanding":
        rows = db.scalars(
            select(Supplier)
            .where(Supplier.outstanding_balance > 0)
            .order_by(desc(Supplier.outstanding_balance))
        ).all()
        return {
            "report_type": report_type,
            "title": "Supplier Outstanding Payables Report",
            "period": f"As of {date.today().isoformat()}",
            "summary": {
                "suppliers_with_dues": len(rows),
                "total_payable": float(_q2(sum(r.outstanding_balance for r in rows))),
            },
            "columns": ["Code", "Company", "Contact", "Mobile", "Total Purchases", "Total Paid", "Outstanding"],
            "rows": [
                {
                    "_supplier_id": r.id,
                    "Code": r.supplier_code,
                    "Company": r.company_name,
                    "Contact": r.contact_person or "",
                    "Mobile": r.mobile,
                    "Total Purchases": float(r.total_purchases),
                    "Total Paid": float(r.total_payments),
                    "Outstanding": float(r.outstanding_balance),
                }
                for r in rows
            ],
        }

    elif report_type == "expense_report":
        rows = db.scalars(
            select(Expense)
            .where(Expense.expense_date >= s_date, Expense.expense_date <= e_date)
            .order_by(desc(Expense.expense_date))
        ).all()
        return {
            "report_type": report_type,
            "title": "Business Expense Report",
            "period": f"{s_date} to {e_date}",
            "summary": {
                "total_entries": len(rows),
                "approved_expenses": float(_q2(sum(r.total_amount for r in rows if r.approval_status == "APPROVED"))),
                "pending_expenses": float(_q2(sum(r.total_amount for r in rows if r.approval_status == "PENDING"))),
            },
            "columns": ["Expense No", "Date", "Category", "Title", "Vendor", "Amount", "Tax", "Total", "Mode", "Approval"],
            "rows": [
                {
                    "Expense No": r.expense_number,
                    "Date": r.expense_date.isoformat(),
                    "Category": r.category,
                    "Title": r.title,
                    "Vendor": r.vendor_name or "",
                    "Amount": float(r.amount),
                    "Tax": float(r.tax_amount),
                    "Total": float(r.total_amount),
                    "Mode": r.payment_mode,
                    "Approval": r.approval_status,
                }
                for r in rows
            ],
        }

    elif report_type == "profit_and_loss":
        gross_sales = _q2(
            db.scalar(
                select(func.coalesce(func.sum(Sale.total_amount - Sale.tax_amount), 0)).where(
                    Sale.sale_date >= s_date, Sale.sale_date <= e_date, Sale.status == "CONFIRMED"
                )
            )
        )
        sales_returns = _q2(
            db.scalar(
                select(func.coalesce(func.sum(SaleReturn.total_amount), 0)).where(
                    SaleReturn.return_date >= s_date, SaleReturn.return_date <= e_date
                )
            )
        )
        net_sales = _q2(gross_sales - sales_returns)
        cogs = _q2(
            db.scalar(
                select(func.coalesce(func.sum(Sale.total_cogs), 0)).where(
                    Sale.sale_date >= s_date, Sale.sale_date <= e_date, Sale.status == "CONFIRMED"
                )
            )
        )
        gross_profit = _q2(net_sales - cogs)

        exp_rows = db.execute(
            select(Expense.category, func.coalesce(func.sum(Expense.amount), 0))
            .where(
                Expense.expense_date >= s_date,
                Expense.expense_date <= e_date,
                Expense.approval_status == "APPROVED",
            )
            .group_by(Expense.category)
        ).all()
        operating_expenses = _q2(sum(Decimal(r[1]) for r in exp_rows))
        purchase_transport = _q2(
            db.scalar(
                select(func.coalesce(func.sum(PurchaseInvoice.transport_charges), 0)).where(
                    PurchaseInvoice.invoice_date >= s_date,
                    PurchaseInvoice.invoice_date <= e_date,
                    PurchaseInvoice.status != "CANCELLED",
                )
            )
        )
        total_indirect_expenses = _q2(operating_expenses + purchase_transport)
        net_profit = _q2(gross_profit - total_indirect_expenses)

        pl_rows: List[Dict[str, Any]] = [
            {"Line Item": "Gross Sales (Excl. GST)", "Section": "Revenue", "Amount": float(gross_sales)},
            {"Line Item": "Less: Sales Returns", "Section": "Revenue", "Amount": float(-sales_returns)},
            {"Line Item": "Net Sales Revenue", "Section": "Revenue", "Amount": float(net_sales)},
            {"Line Item": "Less: Cost of Goods Sold (COGS)", "Section": "Cost of Sales", "Amount": float(-cogs)},
            {"Line Item": "Gross Profit", "Section": "Gross Profit", "Amount": float(gross_profit)},
        ]
        for cat, amt in exp_rows:
            pl_rows.append({"Line Item": f"Expense: {cat}", "Section": "Operating Expenses", "Amount": float(_q2(amt))})
        if purchase_transport > 0:
            pl_rows.append(
                {"Line Item": "Inward Freight & Transport Charges", "Section": "Operating Expenses", "Amount": float(purchase_transport)}
            )
        pl_rows.append({"Line Item": "Total Operating Expenses", "Section": "Operating Expenses", "Amount": float(total_indirect_expenses)})
        pl_rows.append({"Line Item": "Net Profit / (Loss)", "Section": "Net Result", "Amount": float(net_profit)})

        return {
            "report_type": report_type,
            "title": "Profit & Loss Statement (Accrual Accounting)",
            "period": f"{s_date} to {e_date}",
            "summary": {
                "net_sales": float(net_sales),
                "cogs": float(cogs),
                "gross_profit": float(gross_profit),
                "operating_expenses": float(total_indirect_expenses),
                "net_profit": float(net_profit),
            },
            "columns": ["Section", "Line Item", "Amount"],
            "rows": pl_rows,
        }

    elif report_type == "payment_collection":
        rows = db.scalars(
            select(Payment)
            .options(joinedload(Payment.customer), joinedload(Payment.supplier), joinedload(Payment.account))
            .where(Payment.payment_date >= s_date, Payment.payment_date <= e_date)
            .order_by(desc(Payment.payment_date))
        ).all()
        inbound = _q2(sum(r.amount for r in rows if r.direction == "INBOUND"))
        outbound = _q2(sum(r.amount for r in rows if r.direction == "OUTBOUND"))
        return {
            "report_type": report_type,
            "title": "Payment Collection & Payout Report",
            "period": f"{s_date} to {e_date}",
            "summary": {
                "total_collected": float(inbound),
                "total_paid_out": float(outbound),
                "net_cash_movement": float(_q2(inbound - outbound)),
            },
            "columns": ["Payment No", "Date", "Direction", "Party Type", "Party Name", "Account", "Mode", "Reference", "Amount"],
            "rows": [
                {
                    "Payment No": r.payment_number,
                    "Date": r.payment_date.isoformat(),
                    "Direction": r.direction,
                    "Party Type": r.party_type,
                    "Party Name": r.customer.name if r.customer else (r.supplier.company_name if r.supplier else ""),
                    "Account": r.account.name if r.account else "",
                    "Mode": r.payment_mode,
                    "Reference": r.reference_number or "",
                    "Amount": float(r.amount),
                }
                for r in rows
            ],
        }

    elif report_type == "employee_activity":
        stmt = select(AuditLog).where(
            func.date(AuditLog.created_at) >= s_date,
            func.date(AuditLog.created_at) <= e_date,
        )
        if user_id:
            stmt = stmt.where(AuditLog.user_id == user_id)
        rows = db.scalars(stmt.order_by(desc(AuditLog.created_at)).limit(500)).all()
        return {
            "report_type": report_type,
            "title": "Employee Activity Report",
            "period": f"{s_date} to {e_date}",
            "summary": {"total_actions": len(rows)},
            "columns": ["Timestamp", "Username", "Module", "Action", "Description"],
            "rows": [
                {
                    "Timestamp": r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "Username": r.username or "system",
                    "Module": r.module,
                    "Action": r.action,
                    "Description": r.description,
                }
                for r in rows
            ],
        }

    elif report_type == "customer_statement":
        if customer_id:
            cust = db.scalar(select(Customer).where(Customer.id == customer_id))
            if not cust:
                raise ValueError(f"Customer #{customer_id} not found.")
            ledger = build_customer_ledger_entries(db, cust)
            return build_customer_statement_report_dict(cust, ledger)

        customers = db.scalars(
            select(Customer)
            .where(Customer.is_active.is_(True))
            .order_by(desc(Customer.outstanding_balance), Customer.name)
        ).all()
        return {
            "report_type": report_type,
            "title": "All Customers Debit, Credit & Outstanding Summary",
            "period": f"As of {date.today().isoformat()} (Select a customer above for full statement)",
            "summary": {
                "total_customers": len(customers),
                "total_billed": float(_q2(sum(c.total_purchases for c in customers))),
                "total_paid": float(_q2(sum(c.total_payments for c in customers))),
                "total_outstanding": float(_q2(sum(c.outstanding_balance for c in customers))),
            },
            "columns": ["Code", "Customer", "Type", "Mobile", "Opening Balance", "Total Debit (Billed)", "Total Credit (Paid)", "Outstanding"],
            "rows": [
                {
                    "_customer_id": c.id,
                    "Code": c.customer_code,
                    "Customer": c.name,
                    "Type": c.customer_type,
                    "Mobile": c.mobile,
                    "Opening Balance": float(c.opening_balance),
                    "Total Debit (Billed)": float(c.total_purchases),
                    "Total Credit (Paid)": float(c.total_payments),
                    "Outstanding": float(c.outstanding_balance),
                }
                for c in customers
            ],
        }

    raise ValueError(f"Unsupported report type: {report_type}")

