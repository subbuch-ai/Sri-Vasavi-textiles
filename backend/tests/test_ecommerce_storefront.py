import hashlib
import hmac
from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient


def _auth_hdr(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_ecommerce_end_to_end_tests_1_to_8(client: TestClient, erp_users):
    """
    Real integration tests covering Section 13 (TEST 1 through TEST 8) against FastAPI + PostgreSQL:
    - TEST 1: ERP product appears on storefront; wholesale price hidden publicly.
    - TEST 2: Customer registers -> Owner approves wholesale account -> Wholesale pricing & bulk enquiry unlocked.
    - TEST 3: Retail customer cart + stock validation + promo + checkout -> Order appears in ERP & reserves stock.
    - TEST 4: Admin updates order & delivery tracking + converts order to Sale (no double deduction) -> Customer tracks & gets invoice PDF.
    - TEST 5: Customer completes Razorpay HMAC-verified payment -> Accounts & customer ledger updated + online_sales report.
    - TEST 6: Customer cancels eligible paid order -> Reserved stock released -> Accounts reflect refund.
    - TEST 7: Owner adjusts stock / disables product in ERP -> Storefront updates immediately.
    - TEST 8: Customer token blocked from all internal ERP endpoints & wholesale prices hidden from unapproved users.
    """
    owner_h = erp_users["owner"]["headers"]
    admin_h = erp_users["admin"]["headers"]
    sales_h = erp_users["sales"]["headers"]
    accounts_h = erp_users["accounts"]["headers"]

    # Configure Storefront with deterministic local Razorpay test gateway + promo code + banners check
    cfg_res = client.put(
        "/api/v1/storefront-admin/config",
        headers=owner_h,
        json={
            "store_enabled": True,
            "free_delivery_threshold": "3000.00",
            "standard_delivery_charge": "120.00",
            "cod_enabled": True,
            "upi_enabled": True,
            "upi_id": "vasavitextiles@upi",
            "bank_transfer_enabled": True,
            "gateway_provider": "RAZORPAY",
            "razorpay_key_id": "rzp_test_local_vasavi01",
            "razorpay_key_secret": "vasavi_super_secret_key_for_hmac_test",
        },
    )
    assert cfg_res.status_code == 200, cfg_res.text
    assert cfg_res.json()["razorpay_enabled"] is True

    promo_res = client.post(
        "/api/v1/storefront-admin/promotions",
        headers=owner_h,
        json={
            "code": "FESTIVE10",
            "title": "Festive 10% Off",
            "discount_type": "PERCENT",
            "discount_value": "10.00",
            "min_order_amount": "500.00",
            "max_discount_amount": "500.00",
            "applicable_customer_type": "ALL",
            "is_active": True,
        },
    )
    assert promo_res.status_code == 201, promo_res.text

    cats = client.get("/api/v1/store/categories").json()
    saree_cat = next((c for c in cats if c["code"] == "SAREES"), cats[0])

    # =========================================================================
    # TEST 1: Owner adds a product in ERP -> Product appears on customer website
    # =========================================================================
    create_prod = client.post(
        "/api/v1/products",
        headers=owner_h,
        json={
            "name": "Kanchipuram Gold Zari Silk Saree",
            "category_id": saree_cat["id"],
            "brand": "Sri Vasavi Signature",
            "description": "Pure handloom silk saree with authentic gold zari pallu.",
            "size": "Free Size, 6.2m",
            "color": "Navy Blue, Gold",
            "fabric_type": "Pure Mulberry Silk",
            "hsn_code": "5007",
            "purchase_price": "2200.00",
            "wholesale_price": "2800.00",
            "retail_price": "3600.00",
            "gst_rate": "5.00",
            "initial_stock": "10.000",
            "min_stock_level": "2.000",
            "is_storefront_visible": True,
            "is_featured": True,
            "is_new_arrival": True,
            "is_best_seller": True,
            "wholesale_min_qty": "5.000",
            "specifications": {"Weave": "Kanchipuram", "Blouse": "Included"},
        },
    )
    assert create_prod.status_code == 201, create_prod.text
    prod = create_prod.json()
    prod_id = prod["id"]

    home_res = client.get("/api/v1/store/home")
    assert home_res.status_code == 200
    assert any(p["id"] == prod_id for p in home_res.json()["featured_products"])

    catalog_res = client.get(
        "/api/v1/store/products",
        params={"search": "Kanchipuram", "category_code": saree_cat["code"], "color": "Gold", "sort": "price_asc"},
    )
    assert catalog_res.status_code == 200
    items = catalog_res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == prod_id
    assert Decimal(str(items[0]["retail_price"])) == Decimal("3600.00")
    assert items[0]["wholesale_price"] is None  # Strictly hidden from public visitors
    assert Decimal(str(items[0]["available_stock"])) == Decimal("10.000")

    # =========================================================================
    # TEST 2: Customer registers -> Owner approves wholesale account -> Wholesale pricing visible
    # =========================================================================
    ws_reg = client.post(
        "/api/v1/store/auth/register",
        json={
            "name": "Meenakshi Silks Dealer",
            "email": "meenakshi.dealer@example.com",
            "mobile": "9888777666",
            "password": "StrongPassword123",
            "customer_type": "WHOLESALE",
            "business_name": "Meenakshi Textile Emporium",
            "gst_number": "33AABCM1234F1Z5",
            "address": "42 Bazaar Street",
            "city": "Madurai",
            "state": "Tamil Nadu",
            "pincode": "625001",
            "estimated_monthly_volume": "50+ Sarees",
        },
    )
    assert ws_reg.status_code == 201, ws_reg.text
    ws_data = ws_reg.json()
    ws_headers = _auth_hdr(ws_data["access_token"])
    assert ws_data["customer"]["wholesale_status"] == "PENDING"
    assert ws_data["customer"]["is_wholesale_approved"] is False

    # Before approval, wholesale customer STILL cannot see wholesale price
    pre_detail = client.get(f"/api/v1/store/products/{prod_id}", headers=ws_headers)
    assert pre_detail.status_code == 200
    assert pre_detail.json()["wholesale_price"] is None

    # Owner reviews wholesale applications and approves
    apps = client.get("/api/v1/storefront-admin/wholesale-applications", headers=owner_h).json()
    target_app = next(a for a in apps if a["customer_id"] == ws_data["customer"]["customer_id"])
    review_res = client.post(
        f"/api/v1/storefront-admin/wholesale-applications/{target_app['id']}/review",
        headers=owner_h,
        json={"status": "APPROVED", "admin_notes": "GST verified."},
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "APPROVED"

    # After approval, wholesale buyer unlocks wholesale price and MOQ pricing
    post_detail = client.get(f"/api/v1/store/products/{prod_id}", headers=ws_headers)
    assert post_detail.status_code == 200
    assert Decimal(str(post_detail.json()["wholesale_price"])) == Decimal("2800.00")

    # Submit bulk enquiry & owner responds
    enq_res = client.post(
        "/api/v1/store/wholesale/enquiries",
        headers=ws_headers,
        json={
            "product_id": prod_id,
            "contact_name": "Meenakshi Silks Dealer",
            "business_name": "Meenakshi Textile Emporium",
            "mobile": "9888777666",
            "requested_quantity": "25",
            "target_price": "2650.00",
            "message": "Need 25 pieces for festival stock.",
        },
    )
    assert enq_res.status_code == 201
    enq_id = enq_res.json()["id"]
    resp_res = client.post(
        f"/api/v1/storefront-admin/wholesale-enquiries/{enq_id}/respond",
        headers=owner_h,
        json={"status": "QUOTED", "quoted_price": "2700.00", "admin_response": "Approved ₹2700/pc for 25+ pcs."},
    )
    assert resp_res.status_code == 200
    assert Decimal(str(resp_res.json()["quoted_price"])) == Decimal("2700.00")

    # =========================================================================
    # TEST 3: Retail customer cart -> oversell blocked -> COD checkout -> appears in ERP
    # =========================================================================
    ret_reg = client.post(
        "/api/v1/store/auth/register",
        json={
            "name": "Ananya Krishnan",
            "email": "ananya.k@example.com",
            "mobile": "9777666555",
            "password": "RetailPassword123",
            "customer_type": "RETAIL",
        },
    )
    assert ret_reg.status_code == 201, ret_reg.text
    ret_headers = _auth_hdr(ret_reg.json()["access_token"])

    # Trying to exceed available stock (10) must fail
    too_much = client.post(
        "/api/v1/store/cart/items",
        headers=ret_headers,
        json={"product_id": prod_id, "quantity": "15", "selected_size": "Free Size", "selected_color": "Navy Blue"},
    )
    assert too_much.status_code == 422

    # Add 2 sarees
    add_cart = client.post(
        "/api/v1/store/cart/items",
        headers=ret_headers,
        json={"product_id": prod_id, "quantity": "2", "selected_size": "Free Size", "selected_color": "Navy Blue"},
    )
    assert add_cart.status_code == 200
    assert Decimal(str(add_cart.json()["items"][0]["unit_price"])) == Decimal("3600.00")

    # Apply promo FESTIVE10 (10% capped at 500 -> subtotal 7200, disc 500, GST on 6700 -> free delivery >= 3000)
    promo_cart = client.post("/api/v1/store/cart/promo", headers=ret_headers, json={"promo_code": "FESTIVE10"})
    assert promo_cart.status_code == 200
    assert Decimal(str(promo_cart.json()["discount_amount"])) == Decimal("500.00")
    assert Decimal(str(promo_cart.json()["delivery_charge"])) == Decimal("0.00")

    # Checkout via COD
    cod_checkout = client.post(
        "/api/v1/store/checkout",
        headers=ret_headers,
        json={
            "recipient_name": "Ananya Krishnan",
            "mobile": "9777666555",
            "address": "18 Anna Nagar East",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600102",
            "payment_method": "COD",
            "notes": "Call before delivery",
        },
    )
    assert cod_checkout.status_code == 201, cod_checkout.text
    cod_order = cod_checkout.json()["order"]
    cod_order_id = cod_order["id"]
    assert cod_order["order_source"] == "ONLINE"
    assert cod_order["order_type"] == "RETAIL"
    assert cod_order["payment_status"] == "UNPAID"
    assert cod_order["order_status"] == "ORDER_PLACED"

    # Storefront stock now shows 10 - 2 = 8 available!
    stock_after_cod = client.get(f"/api/v1/store/products/{prod_id}").json()
    assert Decimal(str(stock_after_cod["available_stock"])) == Decimal("8.000")

    # Order automatically appears in internal ERP Orders list
    erp_orders = client.get("/api/v1/orders", headers=sales_h, params={"order_source": "ONLINE"}).json()["items"]
    assert any(o["id"] == cod_order_id and o["order_number"] == cod_order["order_number"] for o in erp_orders)

    # =========================================================================
    # TEST 4: Admin processes order, adds delivery tracking & converts to Sale -> Customer tracks & gets invoice
    # =========================================================================
    upd_status = client.patch(
        f"/api/v1/orders/{cod_order_id}",
        headers=admin_h,
        json={"order_status": "PROCESSING", "notes": "Packed in silk box"},
    )
    assert upd_status.status_code == 200

    deliv_res = client.patch(
        f"/api/v1/storefront-admin/orders/{cod_order_id}/delivery",
        headers=admin_h,
        json={
            "courier_name": "BlueDart Express",
            "tracking_number": "BD9988776655",
            "tracking_url": "https://bluedart.example/BD9988776655",
            "notes": "Dispatched from Chennai hub",
        },
    )
    assert deliv_res.status_code == 200
    assert deliv_res.json()["tracking_number"] == "BD9988776655"

    # Convert online order to official GST Sale (releases 2 reserved_stock & deducts current_stock 10 -> 8 ONCE)
    conv_res = client.post(
        f"/api/v1/orders/{cod_order_id}/convert-to-sale",
        headers=sales_h,
        json={"sale_date": date.today().isoformat(), "payment_mode": "CASH", "additional_paid_amount": cod_order["total_amount"]},
    )
    assert conv_res.status_code == 201, conv_res.text
    assert Decimal(str(conv_res.json()["total_amount"])) == Decimal(str(cod_order["total_amount"]))
    assert conv_res.json()["payment_status"] == "PAID"

    # Stock must be current=8, reserved=0, available=8 (NO double deduction!)
    prod_after_conv = client.get(f"/api/v1/products/{prod_id}", headers=admin_h).json()
    assert Decimal(str(prod_after_conv["current_stock"])) == Decimal("8.000")
    assert Decimal(str(prod_after_conv["reserved_stock"])) == Decimal("0.000")
    assert Decimal(str(prod_after_conv["available_stock"])) == Decimal("8.000")

    # Customer tracks timeline & delivery tracking, and downloads Tax Invoice PDF
    track_res = client.get(f"/api/v1/store/orders/{cod_order_id}", headers=ret_headers)
    assert track_res.status_code == 200
    tracked = track_res.json()
    assert tracked["delivery_detail"]["tracking_number"] == "BD9988776655"
    assert len(tracked["status_history"]) >= 3
    assert tracked["converted_sale_id"] is not None

    pdf_res = client.get(f"/api/v1/store/orders/{cod_order_id}/invoice/pdf", headers=ret_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content[:4] == b"%PDF"

    # =========================================================================
    # TEST 5: Customer completes Razorpay payment -> Verified server-side -> Accounts updated
    # =========================================================================
    # Check initial bank account balance
    accts_before = client.get("/api/v1/accounts", headers=accounts_h).json()
    bank_before = sum(Decimal(str(a["current_balance"])) for a in accts_before if a["account_type"] == "BANK")

    # Retail customer places another order for 1 saree using RAZORPAY
    assert client.post(
        "/api/v1/store/cart/items",
        headers=ret_headers,
        json={"product_id": prod_id, "quantity": "1", "selected_size": "Free Size", "selected_color": "Gold"},
    ).status_code == 200
    rzp_checkout = client.post(
        "/api/v1/store/checkout",
        headers=ret_headers,
        json={
            "recipient_name": "Ananya Krishnan",
            "mobile": "9777666555",
            "address": "18 Anna Nagar East",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600102",
            "payment_method": "RAZORPAY",
        },
    )
    assert rzp_checkout.status_code == 201, rzp_checkout.text
    rzp_out = rzp_checkout.json()
    rzp_order_id = rzp_out["order"]["id"]
    gw_order_id = rzp_out["razorpay_order_id"]
    gw_pay_id = "pay_LiveTest998877"
    assert gw_order_id is not None

    # Bad signature must fail verification and NOT update accounts
    bad_verify = client.post(
        "/api/v1/store/payments/razorpay/verify",
        headers=ret_headers,
        json={
            "order_id": rzp_order_id,
            "razorpay_order_id": gw_order_id,
            "razorpay_payment_id": gw_pay_id,
            "razorpay_signature": "tampered_signature_1234",
        },
    )
    assert bad_verify.status_code == 422

    # Valid HMAC-SHA256 signature computed with secret configured on backend
    valid_sig = hmac.new(
        b"vasavi_super_secret_key_for_hmac_test",
        f"{gw_order_id}|{gw_pay_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    good_verify = client.post(
        "/api/v1/store/payments/razorpay/verify",
        headers=ret_headers,
        json={
            "order_id": rzp_order_id,
            "razorpay_order_id": gw_order_id,
            "razorpay_payment_id": gw_pay_id,
            "razorpay_signature": valid_sig,
        },
    )
    assert good_verify.status_code == 200, good_verify.text
    paid_order = good_verify.json()
    assert paid_order["payment_status"] == "PAID"
    assert paid_order["order_status"] == "CONFIRMED"
    assert paid_order["online_payment"]["verified_server_side"] is True
    assert paid_order["online_payment"]["status"] == "CAPTURED"

    accts_after_pay = client.get("/api/v1/accounts", headers=accounts_h).json()
    bank_after_pay = sum(Decimal(str(a["current_balance"])) for a in accts_after_pay if a["account_type"] == "BANK")
    assert bank_after_pay == bank_before + Decimal(str(paid_order["total_amount"]))

    # Online sales report reflects orders & captured amount
    online_rep = client.get("/api/v1/reports/online_sales", headers=accounts_h)
    assert online_rep.status_code == 200
    assert online_rep.json()["summary"]["total_online_orders"] >= 2

    # =========================================================================
    # TEST 6: Customer cancels eligible paid order -> Reserved stock released -> Refund recorded in Accounts
    # =========================================================================
    # Before cancel: 8 - 1 = 7 available
    assert Decimal(str(client.get(f"/api/v1/store/products/{prod_id}").json()["available_stock"])) == Decimal("7.000")

    cancel_res = client.post(
        f"/api/v1/store/orders/{rzp_order_id}/cancel",
        headers=ret_headers,
        json={"reason": "Ordered wrong color shade"},
    )
    assert cancel_res.status_code == 200, cancel_res.text
    cancelled_order = cancel_res.json()
    assert cancelled_order["order_status"] == "CANCELLED"
    assert cancelled_order["payment_status"] == "REFUNDED"
    assert cancelled_order["online_payment"]["status"] == "REFUNDED"

    # Stock reservation released cleanly back to 8 available!
    assert Decimal(str(client.get(f"/api/v1/store/products/{prod_id}").json()["available_stock"])) == Decimal("8.000")

    # Accounts bank balance returned cleanly to bank_before after refund debit
    accts_after_refund = client.get("/api/v1/accounts", headers=accounts_h).json()
    bank_after_refund = sum(Decimal(str(a["current_balance"])) for a in accts_after_refund if a["account_type"] == "BANK")
    assert bank_after_refund == bank_before

    # =========================================================================
    # TEST 7: Owner changes product stock & storefront visibility in ERP -> Storefront updates
    # =========================================================================
    adj_res = client.post(
        "/api/v1/inventory/adjust",
        headers=owner_h,
        json={
            "product_id": prod_id,
            "transaction_type": "STOCK_IN",
            "quantity": "12.000",
            "notes": "Fresh weaving batch received",
        },
    )
    assert adj_res.status_code == 201, adj_res.text
    assert Decimal(str(client.get(f"/api/v1/store/products/{prod_id}").json()["available_stock"])) == Decimal("20.000")

    # Hide product from storefront
    hide_res = client.patch(
        f"/api/v1/products/{prod_id}",
        headers=owner_h,
        json={"is_storefront_visible": False},
    )
    assert hide_res.status_code == 200
    assert client.get(f"/api/v1/store/products/{prod_id}").status_code == 404

    # =========================================================================
    # TEST 8: Customer tokens cannot access internal ERP modules or unapproved wholesale rates
    # =========================================================================
    restricted_erp_endpoints = [
        "/api/v1/products",
        "/api/v1/sales",
        "/api/v1/orders",
        "/api/v1/customers",
        "/api/v1/accounts",
        "/api/v1/employees",
        "/api/v1/reports/profit_and_loss",
        "/api/v1/settings",
        "/api/v1/storefront-admin/config",
        "/api/v1/storefront-admin/summary",
    ]
    for path in restricted_erp_endpoints:
        r = client.get(path, headers=ret_headers)
        assert r.status_code == 401, f"Expected 401 on {path} with customer token, got {r.status_code}"

    # Verify retail customer forgot-password + reset-password workflow works end-to-end
    fp = client.post("/api/v1/store/auth/forgot-password", json={"email": "ananya.k@example.com"})
    assert fp.status_code == 200
    dev_token = fp.json().get("dev_reset_token")
    assert dev_token
    rp = client.post(
        "/api/v1/store/auth/reset-password",
        json={"token": dev_token, "new_password": "NewRetailPassword456"},
    )
    assert rp.status_code == 200
    relogin = client.post(
        "/api/v1/store/auth/login",
        json={"email_or_mobile": "ananya.k@example.com", "password": "NewRetailPassword456"},
    )
    assert relogin.status_code == 200
