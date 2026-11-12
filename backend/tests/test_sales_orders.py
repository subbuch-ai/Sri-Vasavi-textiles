from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient


def test_wholesale_retail_sales_and_order_conversion_single_stock_deduction(client: TestClient, erp_users):
    sales_h = erp_users["sales"]["headers"]
    admin_h = erp_users["admin"]["headers"]
    accounts_h = erp_users["accounts"]["headers"]
    today_str = date.today().isoformat()

    cats = client.get("/api/v1/categories", headers=admin_h).json()
    cat_id = cats[0]["id"]

    # Create textile product with 25 units in stock
    prod = client.post(
        "/api/v1/products",
        headers=admin_h,
        json={
            "name": "Linen Formal Shirt",
            "category_id": cat_id,
            "purchase_price": "400.00",
            "wholesale_price": "550.00",
            "retail_price": "850.00",
            "gst_rate": "5.00",
            "initial_stock": "25.000",
            "min_stock_level": "5.000",
        },
    ).json()

    # Create Wholesale Customer
    cust = client.post(
        "/api/v1/customers",
        headers=sales_h,
        json={
            "name": "Lakshmi Garments",
            "mobile": "9842200112",
            "city": "Coimbatore",
            "customer_type": "WHOLESALE",
            "gst_number": "33AAACL1234A1Z9",
            "credit_limit": "100000.00",
        },
    ).json()

    # 1. Retail quick sale for 3 PCS -> stock becomes 22
    retail_res = client.post(
        "/api/v1/sales",
        headers=sales_h,
        json={
            "customer_name_snapshot": "Walk-in Retail Buyer",
            "sale_type": "RETAIL",
            "sale_date": today_str,
            "payment_mode": "UPI",
            "items": [{"product_id": prod["id"], "quantity": "3.000"}],
        },
    )
    assert retail_res.status_code == 201, retail_res.text
    retail_sale = retail_res.json()
    assert Decimal(str(retail_sale["total_cogs"])) == Decimal("1200.00")
    assert retail_sale["payment_status"] == "PAID"
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=sales_h).json()["current_stock"])) == Decimal("22.000")

    # Download Retail PDF receipt
    pdf_res = client.get(f"/api/v1/sales/{retail_sale['id']}/pdf", headers=sales_h)
    assert pdf_res.status_code == 200
    assert pdf_res.content[:4] == b"%PDF"

    # Oversell guard (>22 units blocked)
    oversell = client.post(
        "/api/v1/sales",
        headers=sales_h,
        json={
            "customer_id": cust["id"],
            "sale_type": "WHOLESALE",
            "sale_date": today_str,
            "items": [{"product_id": prod["id"], "quantity": "99.000"}],
        },
    )
    assert oversell.status_code in (400, 422)

    # 2. Customer Order for 10 PCS with Rs. 2,000 advance -> stock MUST STAY 22
    order_res = client.post(
        "/api/v1/orders",
        headers=sales_h,
        json={
            "customer_id": cust["id"],
            "order_date": today_str,
            "expected_delivery_date": today_str,
            "order_type": "WHOLESALE",
            "advance_amount": "2000.00",
            "payment_mode": "CASH",
            "items": [{"product_id": prod["id"], "quantity": "10.000", "unit_price": "550.00", "gst_rate": "5.00"}],
        },
    )
    assert order_res.status_code == 201, order_res.text
    order = order_res.json()
    assert order["stock_deducted"] is False
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=sales_h).json()["current_stock"])) == Decimal("22.000")

    # Confirm Order
    upd = client.patch(
        f"/api/v1/orders/{order['id']}",
        headers=sales_h,
        json={"order_status": "CONFIRMED"},
    )
    assert upd.status_code == 200

    cash_before_convert = Decimal(
        str(next(a for a in client.get("/api/v1/accounts", headers=accounts_h).json() if a["account_type"] == "CASH")["current_balance"])
    )

    # Convert Order to Sale (with Rs. 1,000 additional payment) -> stock deducted ONCE (22 -> 12)
    conv = client.post(
        f"/api/v1/orders/{order['id']}/convert-to-sale",
        headers=sales_h,
        json={
            "sale_date": today_str,
            "additional_paid_amount": "1000.00",
            "payment_mode": "CASH",
        },
    )
    assert conv.status_code == 201, conv.text
    converted_sale = conv.json()
    assert Decimal(str(converted_sale["paid_amount"])) == Decimal("3000.00")
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=sales_h).json()["current_stock"])) == Decimal("12.000")

    # Ensure cash balance only increased by additional_paid_amount (1000), NOT advance again (2000)
    cash_after_convert = Decimal(
        str(next(a for a in client.get("/api/v1/accounts", headers=accounts_h).json() if a["account_type"] == "CASH")["current_balance"])
    )
    assert cash_after_convert - cash_before_convert == Decimal("1000.00")

    # Second conversion MUST fail and NOT touch stock
    conv_twice = client.post(
        f"/api/v1/orders/{order['id']}/convert-to-sale",
        headers=sales_h,
        json={"sale_date": today_str},
    )
    assert conv_twice.status_code in (400, 409)
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=sales_h).json()["current_stock"])) == Decimal("12.000")

    # Sales user without sales:edit cannot process sales returns directly; Admin can
    sret_forbidden = client.post(
        "/api/v1/sales/returns",
        headers=sales_h,
        json={
            "sale_id": converted_sale["id"],
            "return_date": today_str,
            "reason": "Size exchange",
            "refund_to_customer": False,
            "items": [{"product_id": prod["id"], "quantity": "2.000"}],
        },
    )
    assert sret_forbidden.status_code == 403

    # Sale return of 2 units by Admin restores stock from 12 to 14
    sret = client.post(
        "/api/v1/sales/returns",
        headers=admin_h,
        json={
            "sale_id": converted_sale["id"],
            "return_date": today_str,
            "reason": "Size exchange",
            "refund_to_customer": False,
            "items": [{"product_id": prod["id"], "quantity": "2.000"}],
        },
    )
    assert sret.status_code == 201, sret.text
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=sales_h).json()["current_stock"])) == Decimal("14.000")

    # Walk-in credit sale must be rejected (requires registered customer)
    walkin_credit = client.post(
        "/api/v1/sales",
        headers=sales_h,
        json={
            "customer_name_snapshot": "Walk-in Credit Buyer",
            "sale_type": "RETAIL",
            "sale_date": today_str,
            "payment_mode": "CREDIT",
            "items": [{"product_id": prod["id"], "quantity": "1.000"}],
        },
    )
    assert walkin_credit.status_code == 422

    # Registered customer Retail sale with payment_mode=CREDIT defaults paid_amount to 0 (UNPAID)
    credit_sale_res = client.post(
        "/api/v1/sales",
        headers=sales_h,
        json={
            "customer_id": cust["id"],
            "sale_type": "RETAIL",
            "sale_date": today_str,
            "payment_mode": "CREDIT",
            "items": [{"product_id": prod["id"], "quantity": "1.000"}],
        },
    )
    assert credit_sale_res.status_code == 201, credit_sale_res.text
    credit_sale = credit_sale_res.json()
    assert credit_sale["payment_mode"] == "CREDIT"
    assert credit_sale["payment_status"] == "UNPAID"
    assert Decimal(str(credit_sale["paid_amount"])) == Decimal("0.00")
    assert Decimal(str(credit_sale["pending_amount"])) == Decimal(str(credit_sale["total_amount"]))

    # Long product name + HSN code should generate a valid multi-line wrapped PDF without error
    long_prod = client.post(
        "/api/v1/products",
        headers=admin_h,
        json={
            "name": "Raymond Terry-Wool Suiting Fabric (Running Meter)",
            "hsn_code": "5515",
            "category_id": cat_id,
            "purchase_price": "500.00",
            "wholesale_price": "710.00",
            "retail_price": "960.00",
            "gst_rate": "5.00",
            "initial_stock": "20.000",
            "min_stock_level": "2.000",
        },
    ).json()
    long_sale_res = client.post(
        "/api/v1/sales",
        headers=sales_h,
        json={
            "customer_id": cust["id"],
            "sale_type": "RETAIL",
            "sale_date": today_str,
            "payment_mode": "CREDIT",
            "items": [{"product_id": long_prod["id"], "quantity": "2.000"}],
        },
    )
    assert long_sale_res.status_code == 201, long_sale_res.text
    long_pdf = client.get(f"/api/v1/sales/{long_sale_res.json()['id']}/pdf", headers=sales_h)
    assert long_pdf.status_code == 200
    assert long_pdf.content[:4] == b"%PDF"



