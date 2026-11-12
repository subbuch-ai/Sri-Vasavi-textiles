"""Initialize database master data and optionally create the initial Owner user."""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.core.rbac import ROLE_OWNER
from app.core.security import hash_password
from app.models.auth import Role, User
from app.services.seed_service import seed_initial_master_data


def init_database(
    owner_username: str | None = None,
    owner_email: str | None = None,
    owner_name: str | None = None,
    owner_password: str | None = None,
) -> None:
    with SessionLocal() as db:
        seed_initial_master_data(db)
        print("[OK] Seeded roles, permissions, default branch, accounts, categories, and business settings.")

        existing_users = db.scalar(select(func.count()).select_from(User)) or 0
        if existing_users > 0:
            print(f"[INFO] Users already exist ({existing_users} user(s)). Skipping initial Owner creation.")
            return

        if not owner_username or not owner_password:
            print("[INFO] No users exist yet. You can create the Owner account via the web setup screen (/setup-owner) or pass --username and --password.")
            return

        owner_role = db.scalar(select(Role).where(Role.name == ROLE_OWNER))
        if not owner_role:
            raise RuntimeError("OWNER role missing after seeding.")

        user = User(
            username=owner_username.strip().lower(),
            email=(owner_email or f"{owner_username.strip().lower()}@srivasavitextiles.com").strip().lower(),
            full_name=(owner_name or "Sri Vasavi Owner").strip(),
            password_hash=hash_password(owner_password),
            role_id=owner_role.id,
            is_active=True,
            is_owner=True,
        )
        db.add(user)
        db.commit()
        print(f"[OK] Created initial Owner account: {user.username}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize Sri Vasavi Textiles database.")
    parser.add_argument("--username", help="Initial Owner username")
    parser.add_argument("--email", help="Initial Owner email")
    parser.add_argument("--name", help="Initial Owner full name", default="Business Owner")
    parser.add_argument("--password", help="Initial Owner password (if omitted, prompts interactively when --username is given)")
    args = parser.parse_args()

    pwd = args.password
    if args.username and not pwd:
        pwd = getpass.getpass("Enter password for initial Owner: ")

    init_database(
        owner_username=args.username,
        owner_email=args.email,
        owner_name=args.name,
        owner_password=pwd,
    )

