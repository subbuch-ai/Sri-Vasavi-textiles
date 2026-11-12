"""ORM model registry ensuring Alembic and SQLAlchemy load all tables cleanly."""

from app.core.database import Base
from app.models.auth import (
    Permission,
    RefreshToken,
    Role,
    RolePermission,
    User,
    UserPermission,
)
from app.models.finance import Account, Expense, FinancialTransaction, Payment
from app.models.hr import Employee, EmployeeTask
from app.models.inventory import BranchStock, Category, Product, StockTransaction
from app.models.organization import AuditLog, Branch, BusinessSettings, Notification
from app.models.parties import Customer, Supplier
from app.models.purchase import (
    GoodsReceipt,
    GoodsReceiptItem,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReturn,
    PurchaseReturnItem,
)
from app.models.sales import (
    CustomerOrder,
    CustomerOrderItem,
    Sale,
    SaleItem,
    SaleReturn,
    SaleReturnItem,
)

__all__ = [
    "Base",
    "Role",
    "Permission",
    "RolePermission",
    "UserPermission",
    "User",
    "RefreshToken",
    "Branch",
    "BusinessSettings",
    "AuditLog",
    "Notification",
    "Employee",
    "EmployeeTask",
    "Category",
    "Product",
    "BranchStock",
    "StockTransaction",
    "Supplier",
    "Customer",
    "PurchaseOrder",
    "PurchaseOrderItem",
    "GoodsReceipt",
    "GoodsReceiptItem",
    "PurchaseInvoice",
    "PurchaseInvoiceItem",
    "PurchaseReturn",
    "PurchaseReturnItem",
    "CustomerOrder",
    "CustomerOrderItem",
    "Sale",
    "SaleItem",
    "SaleReturn",
    "SaleReturnItem",
    "Account",
    "Payment",
    "Expense",
    "FinancialTransaction",
]

