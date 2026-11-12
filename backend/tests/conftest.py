import os
from typing import Dict

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/sri_vasavi_textiles_test",
)
os.environ["DATABASE_URL"] = TEST_DB_URL

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.seed_service import seed_initial_master_data  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    assert "test" in TEST_DB_URL.lower(), "Refusing to run tests on a non-test database."
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_initial_master_data(db)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def reset_db():
    table_names = [table.name for table in Base.metadata.sorted_tables]
    if table_names:
        joined = ", ".join(f'"{t}"' for t in table_names)
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE TABLE {joined} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed_initial_master_data(db)


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def login_headers(client: TestClient, username: str, password: str) -> Dict[str, str]:
    res = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": username, "password": password},
    )
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def erp_users(client: TestClient) -> Dict[str, Dict]:
    owner_res = client.post(
        "/api/v1/auth/setup-owner",
        json={
            "username": "owner",
            "email": "owner@srivasavitextiles.com",
            "full_name": "Vasavi Proprietor",
            "mobile": "9876543210",
            "password": "OwnerPass@123",
        },
    )
    assert owner_res.status_code == 201, owner_res.text
    owner_token = owner_res.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    staff_specs = [
        ("admin1", "admin1@svt.com", "Store Admin", "ADMIN", "AdminPass@123"),
        ("sales1", "sales1@svt.com", "Sales Executive", "SALES", "SalesPass@123"),
        ("accounts1", "accounts1@svt.com", "Senior Accountant", "ACCOUNTS", "AccountsPass@123"),
        ("emp1", "emp1@svt.com", "Floor Staff", "EMPLOYEE", "EmpPass@123"),
    ]
    users_out: Dict[str, Dict] = {
        "owner": {
            "user": owner_res.json()["user"],
            "headers": owner_headers,
            "password": "OwnerPass@123",
        }
    }

    for uname, email, full_name, role_name, pwd in staff_specs:
        r = client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={
                "username": uname,
                "email": email,
                "full_name": full_name,
                "mobile": "9000000001",
                "password": pwd,
                "role_name": role_name,
                "is_active": True,
                "overrides": [],
            },
        )
        assert r.status_code == 201, r.text
        users_out[role_name.lower()] = {
            "user": r.json(),
            "headers": login_headers(client, uname, pwd),
            "password": pwd,
        }

    return users_out

