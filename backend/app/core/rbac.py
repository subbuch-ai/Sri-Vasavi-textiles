from typing import Dict, List, Set

# Canonical system role identifiers
ROLE_OWNER = "OWNER"
ROLE_ADMIN = "ADMIN"
ROLE_SALES = "SALES"
ROLE_ACCOUNTS = "ACCOUNTS"
ROLE_EMPLOYEE = "EMPLOYEE"

ROLE_DEFINITIONS: List[Dict[str, str]] = [
    {
        "name": ROLE_OWNER,
        "display_name": "Owner",
        "description": "Unrestricted proprietor access across all modules, approvals, financials, permissions, and settings.",
    },
    {
        "name": ROLE_ADMIN,
        "display_name": "Admin",
        "description": "Operations manager for products, inventory, purchases, sales, orders, customers, suppliers, and assigned reports.",
    },
    {
        "name": ROLE_SALES,
        "display_name": "Sales Executive",
        "description": "Wholesale & retail billing, customer orders, customer records, collections, and stock availability.",
    },
    {
        "name": ROLE_ACCOUNTS,
        "display_name": "Accountant",
        "description": "Cash book, bank book, supplier/customer payments, expenses, ledgers, and financial statements.",
    },
    {
        "name": ROLE_EMPLOYEE,
        "display_name": "Employee",
        "description": "Staff portal for viewing assigned tasks, personal activity logs, and explicitly granted modules.",
    },
]

# Granular permission registry: (code, module, description)
PERMISSION_DEFINITIONS: List[tuple[str, str, str]] = [
    ("dashboard:view", "dashboard", "View main business dashboard KPIs and charts"),
    ("dashboard:financial_kpis", "dashboard", "View sensitive owner/accounts profit and cash KPIs"),

    ("products:view", "products", "View products and categories"),
    ("products:create", "products", "Create products and categories"),
    ("products:edit", "products", "Edit products and categories"),
    ("products:delete", "products", "Delete products and categories"),

    ("inventory:view", "inventory", "View stock levels, alerts, and stock movement ledger"),
    ("inventory:adjust", "inventory", "Record stock adjustments, damaged stock, and transfers"),

    ("suppliers:view", "suppliers", "View suppliers and supplier ledgers"),
    ("suppliers:create", "suppliers", "Add new suppliers"),
    ("suppliers:edit", "suppliers", "Update supplier information"),
    ("suppliers:delete", "suppliers", "Delete or deactivate suppliers"),

    ("purchases:view", "purchases", "View purchase orders, GRNs, and purchase invoices"),
    ("purchases:create", "purchases", "Create purchase orders and purchase invoices"),
    ("purchases:edit", "purchases", "Edit draft purchase orders and purchase entries"),
    ("purchases:receive", "purchases", "Record goods receipts (GRN) to increment stock"),
    ("purchases:return", "purchases", "Create purchase returns"),
    ("purchases:delete", "purchases", "Delete or cancel purchase entries"),

    ("customers:view", "customers", "View customers and customer ledgers"),
    ("customers:create", "customers", "Add new customers"),
    ("customers:edit", "customers", "Edit customer information"),
    ("customers:delete", "customers", "Delete or deactivate customers"),

    ("orders:view", "orders", "View customer orders"),
    ("orders:create", "orders", "Create customer orders"),
    ("orders:edit", "orders", "Edit customer orders and update status"),
    ("orders:convert", "orders", "Convert confirmed orders into sales invoices"),
    ("orders:delete", "orders", "Cancel or delete customer orders"),

    ("sales:view", "sales", "View wholesale and retail sales history and invoices"),
    ("sales:create", "sales", "Create wholesale and retail sales and generate invoices"),
    ("sales:edit", "sales", "Edit or return sales records"),
    ("sales:delete", "sales", "Cancel or delete sales records"),

    ("accounts:view", "accounts", "View cash book, bank book, ledger, and balances"),
    ("accounts:manage", "accounts", "Create/manage cash & bank accounts and financial entries"),
    ("payments:view", "accounts", "View customer collections and supplier payments"),
    ("payments:create", "accounts", "Record customer collections and supplier payments"),
    ("payments:approve", "accounts", "Approve or reject high-value financial payments"),

    ("expenses:view", "expenses", "View business expenses"),
    ("expenses:create", "expenses", "Create business expenses and upload bills"),
    ("expenses:approve", "expenses", "Approve or reject business expenses"),
    ("expenses:delete", "expenses", "Delete expense records"),

    ("employees:view", "employees", "View employee directory and assigned tasks"),
    ("employees:manage", "employees", "Create, edit, deactivate employees and assign tasks"),
    ("tasks:view_own", "employees", "View own assigned tasks and personal activity history"),
    ("tasks:update_own", "employees", "Update status/notes of own assigned tasks"),

    ("reports:view", "reports", "View operational and sales reports"),
    ("reports:financial", "reports", "View profit & loss and full financial reports"),
    ("reports:export", "reports", "Export reports to PDF, Excel, and CSV"),

    ("admin:manage", "admin", "Create and manage Admin and staff user accounts"),
    ("permissions:manage", "admin", "Manage role and user-level permissions"),
    ("settings:view", "settings", "View business configuration settings"),
    ("settings:manage", "settings", "Update business settings, GST, invoice numbering, and stock policies"),
    ("audit:view", "audit", "View system-wide audit logs and employee activity history"),
]

ALL_PERMISSION_CODES: Set[str] = {code for code, _, _ in PERMISSION_DEFINITIONS}

DEFAULT_ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    ROLE_OWNER: ALL_PERMISSION_CODES,
    ROLE_ADMIN: {
        "dashboard:view",
        "products:view", "products:create", "products:edit", "products:delete",
        "inventory:view", "inventory:adjust",
        "suppliers:view", "suppliers:create", "suppliers:edit",
        "purchases:view", "purchases:create", "purchases:edit", "purchases:receive", "purchases:return",
        "customers:view", "customers:create", "customers:edit",
        "orders:view", "orders:create", "orders:edit", "orders:convert",
        "sales:view", "sales:create", "sales:edit",
        "reports:view", "reports:export",
        "employees:view",
        "settings:view",
    },
    ROLE_SALES: {
        "dashboard:view",
        "products:view",
        "inventory:view",
        "customers:view", "customers:create", "customers:edit",
        "orders:view", "orders:create", "orders:edit", "orders:convert",
        "sales:view", "sales:create",
        "payments:view", "payments:create",
        "reports:view",
    },
    ROLE_ACCOUNTS: {
        "dashboard:view", "dashboard:financial_kpis",
        "suppliers:view", "customers:view",
        "purchases:view", "sales:view", "orders:view",
        "accounts:view", "accounts:manage",
        "payments:view", "payments:create", "payments:approve",
        "expenses:view", "expenses:create", "expenses:approve",
        "reports:view", "reports:financial", "reports:export",
    },
    ROLE_EMPLOYEE: {
        "dashboard:view",
        "products:view",
        "inventory:view",
        "tasks:view_own",
        "tasks:update_own",
    },
}

