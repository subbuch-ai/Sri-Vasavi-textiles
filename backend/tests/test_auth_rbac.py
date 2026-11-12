from fastapi.testclient import TestClient


def test_health_and_owner_bootstrap(client: TestClient):
    h = client.get("/api/v1/health")
    assert h.status_code == 200
    assert h.json()["database"] == "connected"

    st1 = client.get("/api/v1/auth/setup-status")
    assert st1.status_code == 200
    assert st1.json()["owner_initialized"] is False

    # Short password rejected
    bad = client.post(
        "/api/v1/auth/setup-owner",
        json={
            "username": "owner",
            "email": "owner@svt.com",
            "full_name": "Proprietor",
            "password": "short",
        },
    )
    assert bad.status_code == 422

    # Valid owner setup
    ok = client.post(
        "/api/v1/auth/setup-owner",
        json={
            "username": "owner",
            "email": "owner@svt.com",
            "full_name": "Proprietor",
            "password": "OwnerPass@123",
        },
    )
    assert ok.status_code == 201
    assert ok.json()["user"]["is_owner"] is True

    # Duplicate setup rejected
    dup = client.post(
        "/api/v1/auth/setup-owner",
        json={
            "username": "owner2",
            "email": "owner2@svt.com",
            "full_name": "Proprietor 2",
            "password": "OwnerPass@123",
        },
    )
    assert dup.status_code == 409


def test_jwt_refresh_and_logout(client: TestClient, erp_users):
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "owner", "password": "OwnerPass@123"},
    )
    assert login_res.status_code == 200
    tokens = login_res.json()

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "owner"

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    new_refresh = refreshed.json()["refresh_token"]

    # Old refresh token should be rotated/invalidated
    old_retry = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert old_retry.status_code == 401

    logout_res = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"},
        json={"refresh_token": new_refresh},
    )
    assert logout_res.status_code == 200

    after_logout = client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert after_logout.status_code == 401


def test_rbac_role_isolation_and_overrides(client: TestClient, erp_users):
    owner_h = erp_users["owner"]["headers"]
    admin_h = erp_users["admin"]["headers"]
    sales_h = erp_users["sales"]["headers"]
    accounts_h = erp_users["accounts"]["headers"]
    emp_h = erp_users["employee"]["headers"]

    # Owner-only endpoints blocked for everyone else
    for hdrs in (admin_h, sales_h, accounts_h, emp_h):
        assert client.get("/api/v1/users", headers=hdrs).status_code == 403
        assert client.get("/api/v1/audit/logs", headers=hdrs).status_code == 403
        assert (
            client.put("/api/v1/settings", headers=hdrs, json={"allow_negative_stock": True}).status_code
            == 403
        )

    # Admin blocked from Owner-only P&L financial report
    assert client.get("/api/v1/reports/profit_and_loss", headers=admin_h).status_code == 403
    # Owner & Accounts allowed
    assert client.get("/api/v1/reports/profit_and_loss", headers=owner_h).status_code == 200
    assert client.get("/api/v1/reports/profit_and_loss", headers=accounts_h).status_code == 200

    # Sales can list products & create customers, blocked from creating suppliers or expenses
    assert client.get("/api/v1/products", headers=sales_h).status_code == 200
    assert client.post(
        "/api/v1/customers",
        headers=sales_h,
        json={"name": "Retail Walkin", "mobile": "9888811111", "customer_type": "RETAIL"},
    ).status_code == 201
    assert client.post(
        "/api/v1/suppliers",
        headers=sales_h,
        json={"company_name": "Surat Mills", "mobile": "9888822222"},
    ).status_code == 403
    assert client.post(
        "/api/v1/expenses",
        headers=sales_h,
        json={"expense_date": "2026-11-01", "category": "OTHER", "title": "Tea", "amount": 50},
    ).status_code == 403

    # Accounts blocked from creating sales invoices
    assert client.post(
        "/api/v1/customers",
        headers=accounts_h,
        json={"name": "Acct Cust", "mobile": "9777711111", "customer_type": "RETAIL"},
    ).status_code == 403

    # Employee can read own tasks and own activity, blocked from suppliers/purchases
    assert client.get("/api/v1/employees/my-tasks", headers=emp_h).status_code == 200
    assert client.get("/api/v1/audit/my-activity", headers=emp_h).status_code == 200
    assert client.get("/api/v1/suppliers", headers=emp_h).status_code == 403

    # Owner grants per-user override to employee to view suppliers, then revokes it
    emp_id = erp_users["employee"]["user"]["id"]
    grant_res = client.put(
        f"/api/v1/users/{emp_id}/permissions",
        headers=owner_h,
        json={"overrides": [{"permission_code": "suppliers:view", "granted": True}]},
    )
    assert grant_res.status_code == 200
    assert client.get("/api/v1/suppliers", headers=emp_h).status_code == 200

    # Owner updates ADMIN role to grant reports:financial -> Admin can now view P&L
    roles_res = client.get("/api/v1/users/roles", headers=owner_h)
    admin_role = next(r for r in roles_res.json() if r["name"] == "ADMIN")
    updated_perms = sorted(set(admin_role["permissions"] + ["reports:financial"]))
    r_upd = client.put(
        f"/api/v1/users/roles/{admin_role['id']}/permissions",
        headers=owner_h,
        json={"permission_codes": updated_perms},
    )
    assert r_upd.status_code == 200
    assert client.get("/api/v1/reports/profit_and_loss", headers=admin_h).status_code == 200

