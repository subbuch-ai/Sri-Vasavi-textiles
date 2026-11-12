from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient


ALL_REPORT_TYPES = [
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
]


def test_accrual_profit_and_loss_accounts_and_all_15_reports(client: TestClient, erp_users):
    owner_h = erp_users["owner"]["headers"]
    accounts_h = erp_users["accounts"]["headers"]
    sales_h = erp_users["sales"]["headers"]
    admin_h = erp_users["admin"]["headers"]
    today_str = date.today().isoformat()

    cats = client.get("/api/v1/categories", headers=owner_h).json()
    cat_id = cats[0]["id"]

    # Create supplier & unpaid purchase invoice (Rs. 500 x 10 = Rs. 5,000 base + 5% GST)
    sup = client.post(
        "/api/v1/suppliers",
        headers=admin_h,
        json={"company_name": "Madurai Cotton Mills", "mobile": "9800011223"},
    ).json()

    prod = client.post(
        "/api/v1/products",
        headers=admin_h,
        json={
            "name": "Madurai Cotton Saree",
            "category_id": cat_id,
            "purchase_price": "500.00",
            "wholesale_price": "900.00",
            "retail_price": "1000.00",
            "gst_rate": "5.00",
            "initial_stock": "0.000",
            "min_stock_level": "15.000",
        },
    ).json()

    pinv = client.post(
        "/api/v1/purchases/invoices",
        headers=admin_h,
        json={
            "supplier_id": sup["id"],
            "supplier_invoice_no": "MCM-88",
            "invoice_date": today_str,
            "paid_amount": "0.00",
            "receive_stock_now": True,
            "items": [{"product_id": prod["id"], "quantity": "10.000", "unit_price": "500.00", "gst_rate": "5.00"}],
        },
    ).json()

    # Create customer & sell 4 units on credit (subtotal 4,000 + 200 GST = 4,200, COGS = 4 * 500 = 2,000)
    cust = client.post(
        "/api/v1/customers",
        headers=sales_h,
        json={"name": "Meena Emporium", "mobile": "9811122334", "customer_type": "WHOLESALE"},
    ).json()

    sale = client.post(
        "/api/v1/sales",
        headers=sales_h,
        json={
            "customer_id": cust["id"],
            "sale_type": "WHOLESALE",
            "sale_date": today_str,
            "paid_amount": "1200.00",
            "payment_mode": "UPI",
            "items": [
                {
                    "product_id": prod["id"],
                    "quantity": "4.000",
                    "unit_price": "1000.00",
                    "gst_rate": "5.00",
                }
            ],
        },
    ).json()

    # Record operating expense below threshold (Rs. 1,000 Shop Rent -> auto APPROVED)
    exp1 = client.post(
        "/api/v1/expenses",
        headers=accounts_h,
        json={
            "expense_date": today_str,
            "category": "SHOP_RENT",
            "title": "Showroom Partial Rent",
            "amount": "1000.00",
            "payment_mode": "CASH",
        },
    )
    assert exp1.status_code == 201, exp1.text
    assert exp1.json()["approval_status"] == "APPROVED"

    # Grant expenses:create (without expenses:approve) to employee to verify PENDING threshold workflow
    emp_id = erp_users["employee"]["user"]["id"]
    emp_h = erp_users["employee"]["headers"]
    assert (
        client.put(
            f"/api/v1/users/{emp_id}/permissions",
            headers=owner_h,
            json={"overrides": [{"permission_code": "expenses:create", "granted": True}]},
        ).status_code
        == 200
    )

    # Record large expense >= threshold (Rs. 8,000 Salaries -> PENDING until Owner approves)
    exp2 = client.post(
        "/api/v1/expenses",
        headers=emp_h,
        json={
            "expense_date": today_str,
            "category": "EMPLOYEE_SALARIES",
            "title": "Staff Monthly Bonus",
            "amount": "8000.00",
            "payment_mode": "BANK_TRANSFER",
        },
    )
    assert exp2.status_code == 201, exp2.text
    assert exp2.json()["approval_status"] == "PENDING"

    # Before exp2 approval: Accrual P&L must be Net Sales (4000) - COGS (2000) = 2000 Gross Profit; Net Profit = 2000 - 1000 = 1000
    pl1 = client.get("/api/v1/reports/profit_and_loss", headers=accounts_h).json()["summary"]
    assert Decimal(str(pl1["net_sales"])) == Decimal("4000.00")
    assert Decimal(str(pl1["cogs"])) == Decimal("2000.00")
    assert Decimal(str(pl1["gross_profit"])) == Decimal("2000.00")
    assert Decimal(str(pl1["operating_expenses"])) == Decimal("1000.00")
    assert Decimal(str(pl1["net_profit"])) == Decimal("1000.00")

    # Approve exp2 by Owner -> Operating Expenses becomes 9000, Net Profit = -7000
    assert (
        client.patch(
            f"/api/v1/expenses/{exp2.json()['id']}/approval",
            headers=owner_h,
            json={"approval_status": "APPROVED"},
        ).status_code
        == 200
    )
    pl2 = client.get("/api/v1/reports/profit_and_loss", headers=owner_h).json()["summary"]
    assert Decimal(str(pl2["operating_expenses"])) == Decimal("9000.00")
    assert Decimal(str(pl2["net_profit"])) == Decimal("-7000.00")

    # Customer payment & Supplier payment + Ledgers
    assert (
        client.post(
            "/api/v1/payments",
            headers=accounts_h,
            json={
                "payment_date": today_str,
                "direction": "INBOUND",
                "party_type": "CUSTOMER",
                "customer_id": cust["id"],
                "sale_id": sale["id"],
                "amount": "3000.00",
                "payment_mode": "BANK_TRANSFER",
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/payments",
            headers=accounts_h,
            json={
                "payment_date": today_str,
                "direction": "OUTBOUND",
                "party_type": "SUPPLIER",
                "supplier_id": sup["id"],
                "purchase_invoice_id": pinv["id"],
                "amount": "2500.00",
                "payment_mode": "BANK_TRANSFER",
            },
        ).status_code
        == 201
    )

    cust_obj = client.get(f"/api/v1/customers/{cust['id']}", headers=accounts_h)
    assert cust_obj.status_code == 200
    assert Decimal(str(cust_obj.json()["outstanding_balance"])) == Decimal("0.00")

    cust_ledger = client.get(f"/api/v1/customers/{cust['id']}/ledger", headers=accounts_h)
    assert cust_ledger.status_code == 200
    assert Decimal(str(cust_ledger.json()[-1]["balance"])) == Decimal("0.00")

    sup_obj = client.get(f"/api/v1/suppliers/{sup['id']}", headers=accounts_h)
    assert sup_obj.status_code == 200
    assert Decimal(str(sup_obj.json()["outstanding_balance"])) == Decimal("2750.00")

    sup_ledger = client.get(f"/api/v1/suppliers/{sup['id']}/ledger", headers=accounts_h)
    assert sup_ledger.status_code == 200
    assert Decimal(str(sup_ledger.json()[-1]["balance"])) == Decimal("2750.00")

    # Dashboard overview reflects real DB values
    dash = client.get("/api/v1/dashboard/overview", headers=owner_h)
    assert dash.status_code == 200
    assert dash.json()["kpis"]["total_products"] == 1
    assert dash.json()["kpis"]["total_customers"] == 1

    # All 15 report endpoints + PDF / XLSX / CSV exports
    for rtype in ALL_REPORT_TYPES:
        res = client.get(f"/api/v1/reports/{rtype}", headers=owner_h)
        assert res.status_code == 200, f"Report {rtype} failed: {res.text}"
        body = res.json()
        assert body["report_type"] == rtype
        assert isinstance(body["columns"], list)
        assert isinstance(body["rows"], list)

    for fmt, prefix in (("pdf", b"%PDF"), ("xlsx", b"PK"), ("csv", b"")):
        exp = client.get(f"/api/v1/reports/profit_and_loss/export?format={fmt}", headers=owner_h)
        assert exp.status_code == 200
        assert len(exp.content) > 0
        if prefix:
            assert exp.content.startswith(prefix)

    # Credit invoice -> partial general payment (FIFO) -> full settlement updates Reports status UNPAID -> PARTIAL -> PAID
    credit_sale = client.post(
        "/api/v1/sales",
        headers=sales_h,
        json={
            "customer_id": cust["id"],
            "sale_type": "RETAIL",
            "sale_date": today_str,
            "payment_mode": "CREDIT",
            "items": [{"product_id": prod["id"], "quantity": "2.000", "unit_price": "1000.00", "gst_rate": "5.00"}],
        },
    ).json()
    assert credit_sale["payment_status"] == "UNPAID"

    rep1 = client.get("/api/v1/reports/daily_sales", headers=owner_h).json()
    row1 = next(r for r in rep1["rows"] if r["Invoice No"] == credit_sale["invoice_number"])
    assert row1["Status"] == "UNPAID"
    assert row1["Mode"] == "CREDIT"
    assert Decimal(str(row1["Paid"])) == Decimal("0.00")
    assert Decimal(str(row1["Pending"])) == Decimal("2100.00")

    # Partial payment without explicit sale_id -> FIFO allocates cleanly to credit_sale -> PARTIAL in reports
    part_res = client.post(
        "/api/v1/payments",
        headers=accounts_h,
        json={
            "payment_date": today_str,
            "direction": "INBOUND",
            "party_type": "CUSTOMER",
            "customer_id": cust["id"],
            "amount": "1000.00",
            "payment_mode": "CASH",
        },
    )
    assert part_res.status_code == 201, part_res.text

    rep2 = client.get("/api/v1/reports/daily_sales", headers=owner_h).json()
    row2 = next(r for r in rep2["rows"] if r["Invoice No"] == credit_sale["invoice_number"])
    assert row2["Status"] == "PARTIAL"
    assert Decimal(str(row2["Paid"])) == Decimal("1000.00")
    assert Decimal(str(row2["Pending"])) == Decimal("1100.00")
    assert Decimal(str(row2["_customer_outstanding"])) == Decimal("1100.00")

    # Pay remaining balance specifying sale_id -> PAID in reports and 0 customer outstanding
    full_res = client.post(
        "/api/v1/payments",
        headers=accounts_h,
        json={
            "payment_date": today_str,
            "direction": "INBOUND",
            "party_type": "CUSTOMER",
            "customer_id": cust["id"],
            "sale_id": credit_sale["id"],
            "amount": "1100.00",
            "payment_mode": "UPI",
        },
    )
    assert full_res.status_code == 201, full_res.text

    rep3 = client.get("/api/v1/reports/daily_sales", headers=owner_h).json()
    row3 = next(r for r in rep3["rows"] if r["Invoice No"] == credit_sale["invoice_number"])
    assert row3["Status"] == "PAID"
    assert Decimal(str(row3["Paid"])) == Decimal("2100.00")
    assert Decimal(str(row3["Pending"])) == Decimal("0.00")
    assert Decimal(str(row3["_customer_outstanding"])) == Decimal("0.00")

    # Individual Customer Statement report + PDF/XLSX/CSV exports (both /customers and /reports)
    stmt_json = client.get(
        f"/api/v1/reports/customer_statement?customer_id={cust['id']}",
        headers=owner_h,
    )
    assert stmt_json.status_code == 200, stmt_json.text
    stmt_body = stmt_json.json()
    assert stmt_body["report_type"] == "customer_statement"
    assert stmt_body["summary"]["customer_code"] == cust["customer_code"]
    assert Decimal(str(stmt_body["summary"]["outstanding_balance"])) == Decimal("0.00")
    assert len(stmt_body["rows"]) >= 4

    for fmt, prefix in (("pdf", b"%PDF"), ("xlsx", b"PK"), ("csv", b"\xef\xbb\xbfDate")):
        cust_exp = client.get(
            f"/api/v1/customers/{cust['id']}/statement/export?format={fmt}",
            headers=accounts_h,
        )
        assert cust_exp.status_code == 200, f"Customer statement {fmt} failed: {cust_exp.text}"
        assert cust_exp.content.startswith(prefix)
        rep_exp = client.get(
            f"/api/v1/reports/customer_statement/export?format={fmt}&customer_id={cust['id']}",
            headers=owner_h,
        )
        assert rep_exp.status_code == 200, f"Report customer_statement {fmt} failed: {rep_exp.text}"
        assert rep_exp.content.startswith(prefix)


