from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient


def test_purchase_order_vs_grn_stock_and_inventory_policies(client: TestClient, erp_users):
    owner_h = erp_users["owner"]["headers"]
    admin_h = erp_users["admin"]["headers"]

    # Fetch seeded Sarees category
    cats = client.get("/api/v1/categories", headers=admin_h).json()
    sarees_cat = next(c for c in cats if "Saree" in c["name"])

    # Reject equal or inverted wholesale vs retail pricing on create and update
    bad_prod_res = client.post(
        "/api/v1/products",
        headers=admin_h,
        json={
            "name": "Invalid Price Saree",
            "category_id": sarees_cat["id"],
            "purchase_price": "1000.00",
            "wholesale_price": "1500.00",
            "retail_price": "1500.00",
        },
    )
    assert bad_prod_res.status_code == 422

    # Create Product with initial_stock = 10
    prod_res = client.post(
        "/api/v1/products",
        headers=admin_h,
        json={
            "name": "Kanchipuram Silk Saree",
            "category_id": sarees_cat["id"],
            "brand": "Sri Vasavi Gold",
            "size": "6.2M",
            "color": "Crimson Red",
            "fabric_type": "Pure Silk",
            "hsn_code": "5007",
            "unit": "PCS",
            "purchase_price": "2000.00",
            "wholesale_price": "2600.00",
            "retail_price": "3200.00",
            "gst_rate": "5.00",
            "initial_stock": "10.000",
            "min_stock_level": "5.000",
        },
    )
    assert prod_res.status_code == 201, prod_res.text
    prod = prod_res.json()
    assert Decimal(str(prod["current_stock"])) == Decimal("10.000")

    bad_patch = client.patch(
        f"/api/v1/products/{prod['id']}",
        headers=admin_h,
        json={"wholesale_price": "3200.00"},
    )
    assert bad_patch.status_code == 422

    # Create Supplier
    sup_res = client.post(
        "/api/v1/suppliers",
        headers=admin_h,
        json={
            "company_name": "Kanchi Silk Weavers Co-op",
            "contact_person": "Ramesh",
            "mobile": "9840011223",
            "city": "Kanchipuram",
            "state": "Tamil Nadu",
            "gst_number": "33AAACR5055K1Z1",
        },
    )
    assert sup_res.status_code == 201, sup_res.text
    sup = sup_res.json()

    # 1. Create CONFIRMED Purchase Order -> stock MUST NOT increase
    today_str = date.today().isoformat()
    po_res = client.post(
        "/api/v1/purchases/orders",
        headers=admin_h,
        json={
            "supplier_id": sup["id"],
            "order_date": today_str,
            "status": "CONFIRMED",
            "transport_charges": "500.00",
            "items": [
                {
                    "product_id": prod["id"],
                    "quantity": "20.000",
                    "unit_price": "2000.00",
                    "discount_amount": "0.00",
                    "gst_rate": "5.00",
                }
            ],
        },
    )
    assert po_res.status_code == 201, po_res.text
    po = po_res.json()
    assert po["status"] == "CONFIRMED"

    prod_after_po = client.get(f"/api/v1/products/{prod['id']}", headers=admin_h).json()
    assert Decimal(str(prod_after_po["current_stock"])) == Decimal("10.000")

    # 2. Record partial GRN (12 of 20) -> stock increases from 10 to 22
    grn1 = client.post(
        "/api/v1/purchases/grns",
        headers=admin_h,
        json={
            "purchase_order_id": po["id"],
            "supplier_id": sup["id"],
            "received_date": today_str,
            "challan_number": "DC-001",
            "items": [
                {
                    "po_item_id": po["items"][0]["id"],
                    "product_id": prod["id"],
                    "quantity_received": "12.000",
                    "unit_cost": "2000.00",
                }
            ],
        },
    )
    assert grn1.status_code == 201, grn1.text
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=admin_h).json()["current_stock"])) == Decimal("22.000")

    # Record remaining GRN (8 of 20) -> stock increases from 22 to 30 and PO becomes RECEIVED
    grn2 = client.post(
        "/api/v1/purchases/grns",
        headers=admin_h,
        json={
            "purchase_order_id": po["id"],
            "supplier_id": sup["id"],
            "received_date": today_str,
            "items": [
                {
                    "po_item_id": po["items"][0]["id"],
                    "product_id": prod["id"],
                    "quantity_received": "8.000",
                    "unit_cost": "2000.00",
                }
            ],
        },
    )
    assert grn2.status_code == 201, grn2.text
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=admin_h).json()["current_stock"])) == Decimal("30.000")

    po_after_grns = [p for p in client.get("/api/v1/purchases/orders", headers=admin_h).json()["items"] if p["id"] == po["id"]][0]
    assert po_after_grns["status"] == "RECEIVED"

    # 3. Post Purchase Invoice linked to GRN (receive_stock_now=False) -> NO double stock addition
    pinv_res = client.post(
        "/api/v1/purchases/invoices",
        headers=admin_h,
        json={
            "supplier_id": sup["id"],
            "supplier_invoice_no": "KSC-2026-101",
            "purchase_order_id": po["id"],
            "goods_receipt_id": grn2.json()["id"],
            "invoice_date": today_str,
            "transport_charges": "500.00",
            "paid_amount": "10000.00",
            "payment_mode": "BANK_TRANSFER",
            "receive_stock_now": False,
            "items": [
                {
                    "product_id": prod["id"],
                    "quantity": "20.000",
                    "unit_price": "2000.00",
                    "gst_rate": "5.00",
                }
            ],
        },
    )
    assert pinv_res.status_code == 201, pinv_res.text
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=admin_h).json()["current_stock"])) == Decimal("30.000")

    # Purchase Return of 2 damaged units -> stock drops to 28
    pret_res = client.post(
        "/api/v1/purchases/returns",
        headers=admin_h,
        json={
            "purchase_invoice_id": pinv_res.json()["id"],
            "return_date": today_str,
            "reason": "Loom defect on 2 sarees",
            "items": [{"product_id": prod["id"], "quantity": "2.000"}],
        },
    )
    assert pret_res.status_code == 201, pret_res.text
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=admin_h).json()["current_stock"])) == Decimal("28.000")

    # 4. Negative stock enforcement & multi-branch stock transfer
    neg_blocked = client.post(
        "/api/v1/inventory/adjust",
        headers=admin_h,
        json={
            "product_id": prod["id"],
            "transaction_type": "STOCK_OUT",
            "quantity": "50.000",
            "notes": "Should fail when negative stock disallowed",
        },
    )
    assert neg_blocked.status_code in (400, 422)

    # Owner temporarily allows negative stock -> adjustment succeeds, then disable back
    assert client.put("/api/v1/settings", headers=owner_h, json={"allow_negative_stock": True}).status_code == 200
    assert (
        client.post(
            "/api/v1/inventory/adjust",
            headers=admin_h,
            json={"product_id": prod["id"], "transaction_type": "DAMAGED", "quantity": "30.000"},
        ).status_code
        == 201
    )
    assert Decimal(str(client.get(f"/api/v1/products/{prod['id']}", headers=admin_h).json()["current_stock"])) == Decimal("-2.000")

    # Add 12 via STOCK_IN so positive (10.000) and disallow negative again
    assert (
        client.post(
            "/api/v1/inventory/adjust",
            headers=admin_h,
            json={"product_id": prod["id"], "transaction_type": "STOCK_IN", "quantity": "12.000"},
        ).status_code
        == 201
    )
    assert client.put("/api/v1/settings", headers=owner_h, json={"allow_negative_stock": False}).status_code == 200

    # Branch transfer
    br_res = client.post(
        "/api/v1/settings/branches",
        headers=owner_h,
        json={"code": "RETAIL-2", "name": "City Center Showroom", "city": "Erode"},
    )
    assert br_res.status_code == 201
    branches = client.get("/api/v1/settings/branches", headers=owner_h).json()
    main_br = next(b for b in branches if b["is_default"])
    tr_res = client.post(
        "/api/v1/inventory/transfer",
        headers=admin_h,
        json={
            "product_id": prod["id"],
            "source_branch_id": main_br["id"],
            "target_branch_id": br_res.json()["id"],
            "quantity": "4.000",
            "notes": "Showroom replenishment",
        },
    )
    assert tr_res.status_code == 201, tr_res.text

