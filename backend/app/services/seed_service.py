from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import DEFAULT_ROLE_PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_DEFINITIONS
from app.models.auth import Permission, Role, RolePermission
from app.models.finance import Account
from app.models.inventory import Category
from app.models.organization import Branch, BusinessSettings

DEFAULT_TEXTILE_CATEGORIES = [
    ("MENS_WEAR", "Men's Wear", "Formal, casual, and ethnic menswear"),
    ("WOMENS_WEAR", "Women's Wear", "Kurtis, ethnic sets, and ladies apparel"),
    ("KIDS_WEAR", "Kids Wear", "Boys and girls clothing collections"),
    ("SAREES", "Sarees", "Silk, cotton, fancy, and bridal sarees"),
    ("SHIRTS", "Shirts", "Cotton, linen, formal, and casual shirts"),
    ("TSHIRTS", "T-Shirts", "Polo, round-neck, and casual T-shirts"),
    ("PANTS", "Pants", "Trousers, jeans, chinos, and formal pants"),
    ("DRESS_MATERIALS", "Dress Materials", "Unstitched salwar suits and fabrics"),
    ("INNERWEAR", "Innerwear", "Hosiery and inner garments"),
    ("OTHER_TEXTILES", "Other Textile Products", "Towels, bedsheets, lungis, and accessories"),
]


def seed_initial_master_data(db: Session) -> None:
    """
    Idempotently seed system roles, granular permissions, default role-permission
    grants, default branch, default accounts, business settings, and textile categories.
    """
    # 1. Roles
    role_map: dict[str, Role] = {}
    for role_def in ROLE_DEFINITIONS:
        role = db.scalar(select(Role).where(Role.name == role_def["name"]))
        if not role:
            role = Role(
                name=role_def["name"],
                display_name=role_def["display_name"],
                description=role_def["description"],
                is_system=True,
            )
            db.add(role)
            db.flush()
        role_map[role.name] = role

    # 2. Permissions
    perm_map: dict[str, Permission] = {}
    for code, module, desc in PERMISSION_DEFINITIONS:
        perm = db.scalar(select(Permission).where(Permission.code == code))
        if not perm:
            perm = Permission(code=code, module=module, description=desc)
            db.add(perm)
            db.flush()
        perm_map[code] = perm

    # 3. Default Role Permissions
    for role_name, perm_codes in DEFAULT_ROLE_PERMISSIONS.items():
        role = role_map[role_name]
        existing_perm_ids = set(
            db.scalars(select(RolePermission.permission_id).where(RolePermission.role_id == role.id)).all()
        )
        for code in perm_codes:
            perm = perm_map.get(code)
            if perm and perm.id not in existing_perm_ids:
                db.add(RolePermission(role_id=role.id, permission_id=perm.id))

    # 4. Default Branch
    default_branch = db.scalar(select(Branch).where(Branch.is_default.is_(True)))
    if not default_branch:
        default_branch = db.scalar(select(Branch).where(Branch.code == "MAIN"))
    if not default_branch:
        db.add(
            Branch(
                code="MAIN",
                name="Sri Vasavi Textiles - Main Store & Warehouse",
                city="Main Branch",
                is_default=True,
                is_active=True,
            )
        )

    # 5. Business Settings singleton
    settings_row = db.scalar(select(BusinessSettings).limit(1))
    if not settings_row:
        db.add(
            BusinessSettings(
                business_name="Sri Vasavi Textiles",
                tagline="Wholesale & Retail Textile Trading",
                currency_code="INR",
                currency_symbol="₹",
                financial_year="2026-2027",
                default_gst_rate=Decimal("5.00"),
                allow_negative_stock=False,
                low_stock_alert_enabled=True,
                require_expense_approval=True,
                expense_approval_threshold=Decimal("5000.00"),
            )
        )

    # 6. Default Cash & Bank Accounts
    cash_acc = db.scalar(select(Account).where(Account.code == "CASH-MAIN"))
    if not cash_acc:
        db.add(
            Account(
                code="CASH-MAIN",
                name="Main Cash Counter",
                account_type="CASH",
                opening_balance=Decimal("0.00"),
                current_balance=Decimal("0.00"),
                is_default=True,
                is_active=True,
            )
        )
    bank_acc = db.scalar(select(Account).where(Account.code == "BANK-MAIN"))
    if not bank_acc:
        db.add(
            Account(
                code="BANK-MAIN",
                name="Primary Business Bank Account",
                account_type="BANK",
                opening_balance=Decimal("0.00"),
                current_balance=Decimal("0.00"),
                is_default=False,
                is_active=True,
            )
        )

    # 7. Default Textile Categories
    for code, name, desc in DEFAULT_TEXTILE_CATEGORIES:
        cat = db.scalar(select(Category).where((Category.code == code) | (Category.name == name)))
        if not cat:
            db.add(Category(code=code, name=name, description=desc, is_active=True))

    db.commit()

