from fastapi import APIRouter

from app.api.v1 import (
    accounts,
    audit,
    auth,
    categories,
    customers,
    dashboard,
    employees,
    expenses,
    health,
    inventory,
    orders,
    payments,
    products,
    purchases,
    reports,
    sales,
    settings,
    suppliers,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(settings.router)
api_router.include_router(audit.router)
api_router.include_router(dashboard.router)
api_router.include_router(categories.router)
api_router.include_router(products.router)
api_router.include_router(inventory.router)
api_router.include_router(suppliers.router)
api_router.include_router(customers.router)
api_router.include_router(purchases.router)
api_router.include_router(orders.router)
api_router.include_router(sales.router)
api_router.include_router(accounts.router)
api_router.include_router(payments.router)
api_router.include_router(expenses.router)
api_router.include_router(employees.router)
api_router.include_router(reports.router)
