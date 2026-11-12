"""
Idempotent textile-only demo dataset seeder for testing PO generation, GRN stock-in,
Purchase Invoices, Wholesale & Retail GST Sales Invoices, Customer Orders, and Reports.

Only cloth/textile products, textile mills/suppliers, and textile dealers/customers are added.
Safe to run on a database that already has users/settings or existing products.
"""

import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.auth import User
from app.models.finance import Account, Expense, FinancialTransaction
from app.models.inventory import Category, Product
from app.models.parties import Customer, Supplier
from app.models.purchase import PurchaseOrder
from app.models.sales import CustomerOrder, Sale
from app.schemas.purchase import (
    GoodsReceiptCreate,
    PurchaseInvoiceCreate,
    PurchaseOrderCreate,
)
from app.schemas.sales import (
    ConvertOrderToSaleRequest,
    CustomerOrderCreate,
    SaleCreate,
)
from app.services.finance_service import record_financial_entry, resolve_account
from app.services.inventory_service import apply_stock_movement, get_default_branch_id
from app.services.numbering_service import generate_sequential_code
from app.services.purchase_service import (
    create_purchase_invoice,
    create_purchase_order,
    record_goods_receipt,
)
from app.services.sales_service import (
    convert_order_to_sale,
    create_customer_order,
    create_sale,
)
from app.services.seed_service import seed_initial_master_data

CLOTH_SUPPLIERS = [
    {
        "company_name": "Kanchi Looms & Silk Weavers Pvt Ltd",
        "contact_person": "Subramanian Iyer",
        "mobile": "9840112233",
        "email": "orders@kanchilooms.in",
        "address": "42 Gandhi Road, Silk Weavers Colony",
        "city": "Kanchipuram",
        "state": "Tamil Nadu",
        "gst_number": "33AABCK1234F1Z5",
        "notes": "Handloom pure silk & zari sarees manufacturer",
    },
    {
        "company_name": "Surat Heritage Sarees & Fabrics Mill",
        "contact_person": "Maheshbhai Patel",
        "mobile": "9825044556",
        "email": "dispatch@suratheritage.in",
        "address": "Plot 18, Ring Road Textile Market",
        "city": "Surat",
        "state": "Gujarat",
        "gst_number": "24AADCS5678M1Z2",
        "notes": "Bulk printed cotton sarees, georgette sarees & dress materials",
    },
    {
        "company_name": "Tiruppur Combed Knitwear & Cotton Mills",
        "contact_person": "Karthikeyan N",
        "mobile": "9894077889",
        "email": "sales@tiruppurknitwear.in",
        "address": "105 Avinashi Main Road, Textile Park",
        "city": "Tiruppur",
        "state": "Tamil Nadu",
        "gst_number": "33AAECT9012K1Z8",
        "notes": "Cotton polo T-shirts, combed jersey & innerwear garments",
    },
    {
        "company_name": "Arvind & Raymond Suiting Distributors",
        "contact_person": "Raghavendra Kulkarni",
        "mobile": "9820133445",
        "email": "wholesale@arvindtextiles.in",
        "address": "12 Kalbadevi Cloth Market",
        "city": "Mumbai",
        "state": "Maharashtra",
        "gst_number": "27AAACA4321D1Z9",
        "notes": "Men's suiting fabric, linen shirts & formal trouser cloth",
    },
]

CLOTH_CUSTOMERS = [
    {
        "name": "Lakshmi Silk Emporium",
        "mobile": "9848011122",
        "email": "accounts@lakshmisilks.in",
        "address": "MG Road Cloth Market",
        "city": "Vijayawada",
        "state": "Andhra Pradesh",
        "customer_type": "WHOLESALE",
        "gst_number": "37AABCL2345E1Z4",
        "credit_limit": Decimal("300000.00"),
        "notes": "Wholesale silk sarees & dress material dealer",
    },
    {
        "name": "Annapurna Vastralaya",
        "mobile": "9849022233",
        "email": "purchase@annapurnavastralaya.in",
        "address": "14 Cloth Bazaar, Main Road",
        "city": "Guntur",
        "state": "Andhra Pradesh",
        "customer_type": "WHOLESALE",
        "gst_number": "37AACCA6789H1Z1",
        "credit_limit": Decimal("250000.00"),
        "notes": "Wholesale menswear shirts, trousers & knitwear buyer",
    },
    {
        "name": "Sri Venkateswara Cloth Palace",
        "mobile": "9701033344",
        "email": "orders@svclothpalace.in",
        "address": "Station Road Textile Plaza",
        "city": "Warangal",
        "state": "Telangana",
        "customer_type": "WHOLESALE",
        "gst_number": "36AADCS8899L1Z7",
        "credit_limit": Decimal("200000.00"),
        "notes": "Seasonal festive & wedding textile bulk buyer",
    },
    {
        "name": "Ananya Reddy",
        "mobile": "9989044455",
        "email": "ananya.r@example.com",
        "address": "Jubilee Hills Road No. 12",
        "city": "Hyderabad",
        "state": "Telangana",
        "customer_type": "RETAIL",
        "gst_number": None,
        "credit_limit": Decimal("0.00"),
        "notes": "Retail silk saree & ethnic wear customer",
    },
    {
        "name": "Kiran Kumar Rao",
        "mobile": "9440055566",
        "email": "kiran.rao@example.com",
        "address": "4-12 Tilak Nagar",
        "city": "Tirupati",
        "state": "Andhra Pradesh",
        "customer_type": "RETAIL",
        "gst_number": None,
        "credit_limit": Decimal("0.00"),
        "notes": "Retail menswear formal shirts & trousers customer",
    },
]

# 100% Cloth & Textile Products only
CLOTH_PRODUCTS = [
    {
        "name": "Kanchipuram Pure Mulberry Silk Saree (Gold Zari)",
        "category_code": "SAREES",
        "brand": "Kanchi Looms",
        "fabric_type": "Pure Mulberry Silk",
        "size": "6.2m (with Blouse)",
        "color": "Crimson Red / Gold",
        "hsn_code": "5007",
        "unit": "PCS",
        "purchase_price": Decimal("6200.00"),
        "wholesale_price": Decimal("7450.00"),
        "retail_price": Decimal("8990.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901001",
        "min_stock_level": Decimal("8.000"),
        "initial_seed_stock": Decimal("18.000"),
        "description": "Traditional Kanchipuram handloom pure silk saree woven with rich gold zari pallu.",
    },
    {
        "name": "Banarasi Soft Georgette Zari Saree",
        "category_code": "SAREES",
        "brand": "Surat Heritage",
        "fabric_type": "Soft Viscose Georgette",
        "size": "6.3m (with Blouse)",
        "color": "Emerald Green",
        "hsn_code": "5407",
        "unit": "PCS",
        "purchase_price": Decimal("1650.00"),
        "wholesale_price": Decimal("2100.00"),
        "retail_price": Decimal("2750.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901002",
        "min_stock_level": Decimal("12.000"),
        "initial_seed_stock": Decimal("30.000"),
        "description": "Lightweight Banarasi zari-work georgette saree suited for weddings and festive wear.",
    },
    {
        "name": "Surat Printed Daily Wear Malmal Cotton Saree",
        "category_code": "SAREES",
        "brand": "Surat Heritage",
        "fabric_type": "100% Pure Mulmul Cotton",
        "size": "5.5m + 0.8m Blouse",
        "color": "Indigo Floral",
        "hsn_code": "5208",
        "unit": "PCS",
        "purchase_price": Decimal("480.00"),
        "wholesale_price": Decimal("620.00"),
        "retail_price": Decimal("850.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901003",
        "min_stock_level": Decimal("25.000"),
        "initial_seed_stock": Decimal("20.000"),  # Intentionally near/below min_stock_level for low-stock alert check
        "description": "Breathable summer daily-wear cotton saree with floral block prints.",
    },
    {
        "name": "Pure Linen Formal Full-Sleeve Shirt",
        "category_code": "SHIRTS",
        "brand": "Arvind Linen",
        "fabric_type": "100% European Linen",
        "size": "L (40)",
        "color": "Classic White",
        "hsn_code": "6205",
        "unit": "PCS",
        "purchase_price": Decimal("720.00"),
        "wholesale_price": Decimal("940.00"),
        "retail_price": Decimal("1290.00"),
        "gst_rate": Decimal("12.00"),
        "barcode": "SVT8901004",
        "min_stock_level": Decimal("15.000"),
        "initial_seed_stock": Decimal("40.000"),
        "description": "Crisp breathable pure linen formal shirt for office and festive wear.",
    },
    {
        "name": "Handloom Checks Casual Cotton Shirt",
        "category_code": "SHIRTS",
        "brand": "Sri Vasavi Loom",
        "fabric_type": "60s Combed Cotton",
        "size": "M / L / XL",
        "color": "Navy & Sky Checks",
        "hsn_code": "6205",
        "unit": "PCS",
        "purchase_price": Decimal("440.00"),
        "wholesale_price": Decimal("580.00"),
        "retail_price": Decimal("795.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901005",
        "min_stock_level": Decimal("20.000"),
        "initial_seed_stock": Decimal("45.000"),
        "description": "Soft yarn-dyed cotton check shirt suitable for daily retail and wholesale bundles.",
    },
    {
        "name": "Combed Cotton Pique Polo Collar T-Shirt",
        "category_code": "TSHIRTS",
        "brand": "Tiruppur Knit",
        "fabric_type": "220 GSM Combed Pique Cotton",
        "size": "L (40)",
        "color": "Deep Maroon",
        "hsn_code": "6109",
        "unit": "PCS",
        "purchase_price": Decimal("260.00"),
        "wholesale_price": Decimal("350.00"),
        "retail_price": Decimal("499.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901006",
        "min_stock_level": Decimal("30.000"),
        "initial_seed_stock": Decimal("60.000"),
        "description": "Bio-washed Tiruppur combed cotton polo T-shirt with ribbed collar.",
    },
    {
        "name": "Stretch Cotton Twill Chino Trousers",
        "category_code": "PANTS",
        "brand": "Raymond Ready",
        "fabric_type": "Cotton Lycra Twill",
        "size": "32 / 34 / 36",
        "color": "Charcoal Grey",
        "hsn_code": "6203",
        "unit": "PCS",
        "purchase_price": Decimal("780.00"),
        "wholesale_price": Decimal("990.00"),
        "retail_price": Decimal("1399.00"),
        "gst_rate": Decimal("12.00"),
        "barcode": "SVT8901007",
        "min_stock_level": Decimal("15.000"),
        "initial_seed_stock": Decimal("35.000"),
        "description": "Comfortable 2-way stretch cotton twill formal & smart-casual trousers.",
    },
    {
        "name": "Jaipur Block-Print Cotton Kurti Palazzo Set (3-Pc)",
        "category_code": "WOMENS_WEAR",
        "brand": "Vastra Kala",
        "fabric_type": "Jaipur Cambric Cotton",
        "size": "M / L / XL",
        "color": "Mustard & Teal",
        "hsn_code": "6204",
        "unit": "SET",
        "purchase_price": Decimal("820.00"),
        "wholesale_price": Decimal("1050.00"),
        "retail_price": Decimal("1450.00"),
        "gst_rate": Decimal("12.00"),
        "barcode": "SVT8901008",
        "min_stock_level": Decimal("12.000"),
        "initial_seed_stock": Decimal("28.000"),
        "description": "3-piece stitched cotton kurti, printed palazzo pant, and mulmul dupatta set.",
    },
    {
        "name": "Unstitched Chanderi Silk Embroidered Dress Material",
        "category_code": "DRESS_MATERIALS",
        "brand": "Surat Heritage",
        "fabric_type": "Chanderi Silk Cotton",
        "size": "2.5m Top + 2.5m Bottom + 2.25m Dupatta",
        "color": "Rose Pink",
        "hsn_code": "5407",
        "unit": "SET",
        "purchase_price": Decimal("920.00"),
        "wholesale_price": Decimal("1180.00"),
        "retail_price": Decimal("1590.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901009",
        "min_stock_level": Decimal("10.000"),
        "initial_seed_stock": Decimal("24.000"),
        "description": "Unstitched 3-piece Chanderi silk salwar suit fabric with thread-embroidered dupatta.",
    },
    {
        "name": "Boys Festive Cotton Silk Kurta Pyjama Set",
        "category_code": "KIDS_WEAR",
        "brand": "Bala Vastra",
        "fabric_type": "Cotton Silk Blend",
        "size": "24 / 26 / 28 / 30",
        "color": "Royal Blue & Cream",
        "hsn_code": "6211",
        "unit": "SET",
        "purchase_price": Decimal("510.00"),
        "wholesale_price": Decimal("675.00"),
        "retail_price": Decimal("950.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901010",
        "min_stock_level": Decimal("12.000"),
        "initial_seed_stock": Decimal("9.000"),  # Intentionally below min_stock_level for low-stock alert check
        "description": "Soft ethnic cotton-silk kurta pyjama set for boys festive occasions.",
    },
    {
        "name": "Raymond Terry-Wool Suiting Fabric (Running Meter)",
        "category_code": "MENS_WEAR",
        "brand": "Raymond Mills",
        "fabric_type": "Poly-Viscose & Wool Blend",
        "size": "58-inch Width",
        "color": "Midnight Navy",
        "hsn_code": "5515",
        "unit": "MTR",
        "purchase_price": Decimal("560.00"),
        "wholesale_price": Decimal("710.00"),
        "retail_price": Decimal("960.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901011",
        "min_stock_level": Decimal("20.000"),
        "initial_seed_stock": Decimal("80.000"),
        "description": "Premium tailored suiting and trouser cloth sold per running meter.",
    },
    {
        "name": "Pochampally Ikat Cotton Dhoti & Angavastram Towel Set",
        "category_code": "OTHER_TEXTILES",
        "brand": "Kanchi Looms",
        "fabric_type": "100% Handloom Combed Cotton",
        "size": "4m Dhoti + 1.8m Towel",
        "color": "Ivory White / Gold Border",
        "hsn_code": "6302",
        "unit": "SET",
        "purchase_price": Decimal("430.00"),
        "wholesale_price": Decimal("560.00"),
        "retail_price": Decimal("780.00"),
        "gst_rate": Decimal("5.00"),
        "barcode": "SVT8901012",
        "min_stock_level": Decimal("15.000"),
        "initial_seed_stock": Decimal("35.000"),
        "description": "Traditional South Indian handloom zari-border dhoti and matching cloth towel combo.",
    },
]


def _get_or_create_suppliers(db: Session) -> dict[str, Supplier]:
    suppliers: dict[str, Supplier] = {}
    for s_data in CLOTH_SUPPLIERS:
        existing = db.scalar(select(Supplier).where(Supplier.company_name == s_data["company_name"]))
        if not existing:
            code = generate_sequential_code(db, Supplier, "supplier_code", "SUP-", 4)
            existing = Supplier(supplier_code=code, is_active=True, **s_data)
            db.add(existing)
            db.flush()
        suppliers[existing.company_name] = existing
    return suppliers


def _get_or_create_customers(db: Session) -> dict[str, Customer]:
    customers: dict[str, Customer] = {}
    for c_data in CLOTH_CUSTOMERS:
        existing = db.scalar(select(Customer).where(Customer.name == c_data["name"]))
        if not existing:
            code = generate_sequential_code(db, Customer, "customer_code", "CUS-", 4)
            existing = Customer(customer_code=code, is_active=True, **c_data)
            db.add(existing)
            db.flush()
        customers[existing.name] = existing
    return customers


def _get_or_create_products(db: Session, branch_id: int, user_id: int) -> dict[str, Product]:
    cats = {c.code: c for c in db.scalars(select(Category)).all()}
    products: dict[str, Product] = {}

    for p_data in CLOTH_PRODUCTS:
        existing = db.scalar(
            select(Product).where(
                (Product.barcode == p_data["barcode"]) | (Product.name == p_data["name"])
            )
        )
        if not existing:
            cat = cats[p_data["category_code"]]
            code = generate_sequential_code(db, Product, "product_code", "SVT-PRD-", 5)
            existing = Product(
                product_code=code,
                name=p_data["name"],
                category_id=cat.id,
                brand=p_data["brand"],
                description=p_data["description"],
                size=p_data["size"],
                color=p_data["color"],
                fabric_type=p_data["fabric_type"],
                hsn_code=p_data["hsn_code"],
                unit=p_data["unit"],
                purchase_price=p_data["purchase_price"],
                wholesale_price=p_data["wholesale_price"],
                retail_price=p_data["retail_price"],
                gst_rate=p_data["gst_rate"],
                barcode=p_data["barcode"],
                current_stock=Decimal("0.000"),
                min_stock_level=p_data["min_stock_level"],
                is_active=True,
            )
            db.add(existing)
            db.flush()

            apply_stock_movement(
                db,
                product_id=existing.id,
                branch_id=branch_id,
                transaction_type="OPENING",
                quantity_change=p_data["initial_seed_stock"],
                unit_cost=existing.purchase_price,
                reference_type="DEMO_SEED",
                reference_number=code,
                notes="Initial cloth stock seeded for verification",
                user_id=user_id,
            )
        products[existing.barcode or existing.name] = existing
    return products


def _seed_opening_working_capital(db: Session, user_id: int) -> tuple[Account, Account]:
    cash_acc = resolve_account(db, None, "CASH")
    bank_acc = resolve_account(db, None, "BANK_TRANSFER")

    tx_count = db.scalar(select(func.count()).select_from(FinancialTransaction)) or 0
    if tx_count == 0 and cash_acc.current_balance == Decimal("0.00") and bank_acc.current_balance == Decimal("0.00"):
        today = date.today()
        record_financial_entry(
            db,
            account_id=cash_acc.id,
            tx_date=today - timedelta(days=10),
            tx_type="DEPOSIT",
            credit=Decimal("150000.00"),
            payment_mode="CASH",
            description="Opening Showroom Cash Working Capital",
            reference_type="OPENING_CAPITAL",
            reference_number="CAP-CASH-01",
            user_id=user_id,
        )
        record_financial_entry(
            db,
            account_id=bank_acc.id,
            tx_date=today - timedelta(days=10),
            tx_type="DEPOSIT",
            credit=Decimal("650000.00"),
            payment_mode="BANK_TRANSFER",
            description="Opening Business Bank Working Capital",
            reference_type="OPENING_CAPITAL",
            reference_number="CAP-BANK-01",
            user_id=user_id,
        )
    return cash_acc, bank_acc


def _seed_sample_workflows(
    db: Session,
    suppliers: dict[str, Supplier],
    customers: dict[str, Customer],
    products: dict[str, Product],
    cash_acc: Account,
    bank_acc: Account,
    branch_id: int,
    user_id: int,
) -> dict[str, int]:
    today = date.today()
    summary = {"purchase_orders": 0, "purchase_invoices": 0, "customer_orders": 0, "sales_invoices": 0, "expenses": 0}

    kanchi = suppliers["Kanchi Looms & Silk Weavers Pvt Ltd"]
    surat = suppliers["Surat Heritage Sarees & Fabrics Mill"]
    tiruppur = suppliers["Tiruppur Combed Knitwear & Cotton Mills"]
    arvind = suppliers["Arvind & Raymond Suiting Distributors"]

    lakshmi = customers["Lakshmi Silk Emporium"]
    annapurna = customers["Annapurna Vastralaya"]
    venkateswara = customers["Sri Venkateswara Cloth Palace"]
    ananya = customers["Ananya Reddy"]
    kiran = customers["Kiran Kumar Rao"]

    silk_saree = products["SVT8901001"]
    georgette_saree = products["SVT8901002"]
    cotton_saree = products["SVT8901003"]
    linen_shirt = products["SVT8901004"]
    check_shirt = products["SVT8901005"]
    polo_tshirt = products["SVT8901006"]
    chino_pant = products["SVT8901007"]
    kurti_set = products["SVT8901008"]
    chanderi_set = products["SVT8901009"]
    suiting_mtr = products["SVT8901011"]
    dhoti_set = products["SVT8901012"]

    existing_po_count = db.scalar(select(func.count()).select_from(PurchaseOrder)) or 0
    if existing_po_count == 0:
        # PO-1: Confirmed -> Fully Received via GRN -> Purchase Invoice (partial payment)
        po1 = create_purchase_order(
            db,
            PurchaseOrderCreate(
                supplier_id=kanchi.id,
                branch_id=branch_id,
                order_date=today - timedelta(days=7),
                expected_date=today - timedelta(days=3),
                transport_charges=Decimal("1200.00"),
                status="CONFIRMED",
                notes="Bulk bridal silk sarees & handloom dhoti combo consignment",
                items=[
                    {"product_id": silk_saree.id, "quantity": Decimal("10"), "unit_price": Decimal("6200.00"), "gst_rate": Decimal("5.00")},
                    {"product_id": dhoti_set.id, "quantity": Decimal("20"), "unit_price": Decimal("430.00"), "gst_rate": Decimal("5.00")},
                ],
            ),
            user_id=user_id,
        )
        grn1 = record_goods_receipt(
            db,
            GoodsReceiptCreate(
                purchase_order_id=po1.id,
                supplier_id=kanchi.id,
                branch_id=branch_id,
                received_date=today - timedelta(days=5),
                challan_number="KL-DC-409",
                notes="Verified silk saree bales received cleanly",
                items=[
                    {"po_item_id": po1.items[0].id, "product_id": silk_saree.id, "quantity_received": Decimal("10")},
                    {"po_item_id": po1.items[1].id, "product_id": dhoti_set.id, "quantity_received": Decimal("20")},
                ],
            ),
            user_id=user_id,
        )
        create_purchase_invoice(
            db,
            PurchaseInvoiceCreate(
                supplier_id=kanchi.id,
                supplier_invoice_no="KL/26-27/1042",
                purchase_order_id=po1.id,
                goods_receipt_id=grn1.id,
                branch_id=branch_id,
                invoice_date=today - timedelta(days=5),
                due_date=today + timedelta(days=25),
                transport_charges=Decimal("1200.00"),
                is_interstate=True,
                paid_amount=Decimal("45000.00"),
                payment_mode="BANK_TRANSFER",
                account_id=bank_acc.id,
                receive_stock_now=False,
                notes="Partial NEFT advance paid against Kanchi silk sarees bill",
                items=[
                    {"product_id": silk_saree.id, "quantity": Decimal("10"), "unit_price": Decimal("6200.00"), "gst_rate": Decimal("5.00")},
                    {"product_id": dhoti_set.id, "quantity": Decimal("20"), "unit_price": Decimal("430.00"), "gst_rate": Decimal("5.00")},
                ],
            ),
            user_id=user_id,
        )

        # PO-2: Confirmed -> Partially Received via GRN (so user can test receiving remaining qty)
        po2 = create_purchase_order(
            db,
            PurchaseOrderCreate(
                supplier_id=surat.id,
                branch_id=branch_id,
                order_date=today - timedelta(days=3),
                expected_date=today + timedelta(days=2),
                transport_charges=Decimal("850.00"),
                status="CONFIRMED",
                notes="Festive georgette sarees & Chanderi dress materials lot",
                items=[
                    {"product_id": georgette_saree.id, "quantity": Decimal("25"), "unit_price": Decimal("1650.00"), "gst_rate": Decimal("5.00")},
                    {"product_id": chanderi_set.id, "quantity": Decimal("20"), "unit_price": Decimal("920.00"), "gst_rate": Decimal("5.00")},
                ],
            ),
            user_id=user_id,
        )
        record_goods_receipt(
            db,
            GoodsReceiptCreate(
                purchase_order_id=po2.id,
                supplier_id=surat.id,
                branch_id=branch_id,
                received_date=today - timedelta(days=2),
                challan_number="SH-LR-881",
                notes="First bale received; balance 10 sarees & 20 dress sets in transit",
                items=[
                    {"po_item_id": po2.items[0].id, "product_id": georgette_saree.id, "quantity_received": Decimal("15")},
                ],
            ),
            user_id=user_id,
        )

        # PO-3: Confirmed & Awaiting Receipt (ready for user to test GRN / PO actions)
        create_purchase_order(
            db,
            PurchaseOrderCreate(
                supplier_id=arvind.id,
                branch_id=branch_id,
                order_date=today - timedelta(days=1),
                expected_date=today + timedelta(days=5),
                transport_charges=Decimal("600.00"),
                status="CONFIRMED",
                notes="Pending menswear linen shirts, chinos & suiting roll replenishment",
                items=[
                    {"product_id": linen_shirt.id, "quantity": Decimal("30"), "unit_price": Decimal("720.00"), "gst_rate": Decimal("12.00")},
                    {"product_id": chino_pant.id, "quantity": Decimal("20"), "unit_price": Decimal("780.00"), "gst_rate": Decimal("12.00")},
                    {"product_id": suiting_mtr.id, "quantity": Decimal("50"), "unit_price": Decimal("560.00"), "gst_rate": Decimal("5.00")},
                ],
            ),
            user_id=user_id,
        )

        # Direct Purchase Invoice #2 (Paid via bank transfer - Tiruppur cotton T-shirts)
        create_purchase_invoice(
            db,
            PurchaseInvoiceCreate(
                supplier_id=tiruppur.id,
                supplier_invoice_no="TKM/26-27/318",
                branch_id=branch_id,
                invoice_date=today - timedelta(days=4),
                due_date=today + timedelta(days=15),
                transport_charges=Decimal("500.00"),
                is_interstate=True,
                paid_amount=Decimal("22550.00"),
                payment_mode="BANK_TRANSFER",
                account_id=bank_acc.id,
                receive_stock_now=True,
                notes="Cotton polo T-shirts & handloom check shirts received at godown",
                items=[
                    {"product_id": polo_tshirt.id, "quantity": Decimal("40"), "unit_price": Decimal("260.00"), "gst_rate": Decimal("5.00")},
                    {"product_id": check_shirt.id, "quantity": Decimal("25"), "unit_price": Decimal("440.00"), "gst_rate": Decimal("5.00")},
                ],
            ),
            user_id=user_id,
        )
        summary["purchase_orders"] = 3
        summary["purchase_invoices"] = 2

    existing_sale_count = db.scalar(select(func.count()).select_from(Sale)) or 0
    existing_order_count = db.scalar(select(func.count()).select_from(CustomerOrder)) or 0

    if existing_order_count == 0 and existing_sale_count == 0:
        # Wholesale Sales Invoice #1 (Partial payment -> creates customer receivable)
        create_sale(
            db,
            SaleCreate(
                customer_id=lakshmi.id,
                branch_id=branch_id,
                sale_type="WHOLESALE",
                sale_date=today - timedelta(days=3),
                discount_amount=Decimal("500.00"),
                is_interstate=False,
                paid_amount=Decimal("30000.00"),
                payment_mode="BANK_TRANSFER",
                account_id=bank_acc.id,
                notes="Wholesale silk & georgette saree stock dispatch",
                items=[
                    {"product_id": silk_saree.id, "quantity": Decimal("4")},
                    {"product_id": georgette_saree.id, "quantity": Decimal("10")},
                    {"product_id": chanderi_set.id, "quantity": Decimal("6")},
                ],
            ),
            user_id=user_id,
        )

        # Wholesale Sales Invoice #2 (Paid in full via Bank)
        create_sale(
            db,
            SaleCreate(
                customer_id=annapurna.id,
                branch_id=branch_id,
                sale_type="WHOLESALE",
                sale_date=today - timedelta(days=2),
                discount_amount=Decimal("300.00"),
                is_interstate=False,
                paid_amount=Decimal("36000.00"),
                payment_mode="BANK_TRANSFER",
                account_id=bank_acc.id,
                notes="Wholesale menswear shirts, polos & trouser lot",
                items=[
                    {"product_id": linen_shirt.id, "quantity": Decimal("12")},
                    {"product_id": check_shirt.id, "quantity": Decimal("15")},
                    {"product_id": polo_tshirt.id, "quantity": Decimal("25")},
                    {"product_id": chino_pant.id, "quantity": Decimal("8")},
                ],
            ),
            user_id=user_id,
        )

        # Retail Sales Invoice #1 (Today - Paid Cash, ideal for PDF invoice preview/download)
        create_sale(
            db,
            SaleCreate(
                customer_id=ananya.id,
                branch_id=branch_id,
                sale_type="RETAIL",
                sale_date=today,
                discount_amount=Decimal("200.00"),
                is_interstate=False,
                payment_mode="CASH",
                account_id=cash_acc.id,
                notes="Retail wedding saree & Jaipur kurti counter billing",
                items=[
                    {"product_id": silk_saree.id, "quantity": Decimal("1")},
                    {"product_id": kurti_set.id, "quantity": Decimal("2")},
                    {"product_id": cotton_saree.id, "quantity": Decimal("2")},
                ],
            ),
            user_id=user_id,
        )

        # Retail Sales Invoice #2 (Today - Paid UPI)
        create_sale(
            db,
            SaleCreate(
                customer_id=kiran.id,
                branch_id=branch_id,
                sale_type="RETAIL",
                sale_date=today,
                discount_amount=Decimal("0.00"),
                is_interstate=False,
                payment_mode="UPI",
                account_id=bank_acc.id,
                notes="Retail formal shirt, chino trouser & suiting meter cut",
                items=[
                    {"product_id": linen_shirt.id, "quantity": Decimal("2")},
                    {"product_id": chino_pant.id, "quantity": Decimal("1")},
                    {"product_id": suiting_mtr.id, "quantity": Decimal("3")},
                ],
            ),
            user_id=user_id,
        )

        # Customer Order #1: Confirmed with Advance -> Converted to Invoice (tests Order->Sale link)
        ord_converted = create_customer_order(
            db,
            CustomerOrderCreate(
                customer_id=lakshmi.id,
                branch_id=branch_id,
                order_date=today - timedelta(days=4),
                expected_delivery_date=today - timedelta(days=1),
                order_type="WHOLESALE",
                advance_amount=Decimal("5000.00"),
                payment_mode="CASH",
                account_id=cash_acc.id,
                notes="Handloom dhoti combo & kurti wholesale advance order",
                items=[
                    {"product_id": dhoti_set.id, "quantity": Decimal("10")},
                    {"product_id": kurti_set.id, "quantity": Decimal("5")},
                ],
            ),
            user_id=user_id,
        )
        convert_order_to_sale(
            db,
            ord_converted.id,
            ConvertOrderToSaleRequest(
                sale_date=today - timedelta(days=1),
                additional_paid_amount=Decimal("6760.00"),
                payment_mode="UPI",
                account_id=bank_acc.id,
                notes="Converted confirmed wholesale textile order to GST invoice",
            ),
            user_id=user_id,
        )

        # Customer Order #2: Open CONFIRMED wholesale order with advance (ready to convert in Orders tab!)
        create_customer_order(
            db,
            CustomerOrderCreate(
                customer_id=venkateswara.id,
                branch_id=branch_id,
                order_date=today,
                expected_delivery_date=today + timedelta(days=4),
                order_type="WHOLESALE",
                advance_amount=Decimal("10000.00"),
                payment_mode="BANK_TRANSFER",
                account_id=bank_acc.id,
                notes="Festive bulk sarees & dress materials order (ready to test Convert to Invoice)",
                items=[
                    {"product_id": silk_saree.id, "quantity": Decimal("3")},
                    {"product_id": georgette_saree.id, "quantity": Decimal("8")},
                    {"product_id": chanderi_set.id, "quantity": Decimal("5")},
                ],
            ),
            user_id=user_id,
        )
        summary["customer_orders"] = 2
        summary["sales_invoices"] = 5

    existing_exp_count = db.scalar(select(func.count()).select_from(Expense)) or 0
    if existing_exp_count == 0:
        demo_expenses = [
            {
                "expense_date": today - timedelta(days=5),
                "category": "TRANSPORTATION",
                "title": "Textile Bale Transport & Lorry Freight (Surat - Main Godown)",
                "amount": Decimal("2400.00"),
                "tax_amount": Decimal("120.00"),
                "payment_mode": "CASH",
                "account": cash_acc,
                "vendor_name": "VRL Textile Logistics",
            },
            {
                "expense_date": today - timedelta(days=3),
                "category": "SHOP_RENT",
                "title": "Showroom & Cloth Warehouse Monthly Rent",
                "amount": Decimal("25000.00"),
                "tax_amount": Decimal("0.00"),
                "payment_mode": "BANK_TRANSFER",
                "account": bank_acc,
                "vendor_name": "Vasavi Commercial Complex",
            },
            {
                "expense_date": today - timedelta(days=1),
                "category": "ELECTRICITY",
                "title": "Showroom Lighting & AC Electricity Bill",
                "amount": Decimal("3850.00"),
                "tax_amount": Decimal("0.00"),
                "payment_mode": "UPI",
                "account": bank_acc,
                "vendor_name": "TSSPDCL",
            },
        ]
        for exp_item in demo_expenses:
            total_amt = exp_item["amount"] + exp_item["tax_amount"]
            exp_row = Expense(
                expense_number=generate_sequential_code(db, Expense, "expense_number", "EXP-", 5),
                expense_date=exp_item["expense_date"],
                category=exp_item["category"],
                title=exp_item["title"],
                amount=exp_item["amount"],
                tax_amount=exp_item["tax_amount"],
                total_amount=total_amt,
                payment_mode=exp_item["payment_mode"],
                account_id=exp_item["account"].id,
                vendor_name=exp_item["vendor_name"],
                approval_status="APPROVED",
                approved_by=user_id,
                created_by=user_id,
            )
            db.add(exp_row)
            db.flush()
            record_financial_entry(
                db,
                account_id=exp_item["account"].id,
                tx_date=exp_row.expense_date,
                tx_type="EXPENSE",
                debit=total_amt,
                payment_mode=exp_item["payment_mode"],
                description=f"Expense {exp_row.expense_number}: {exp_row.title}",
                reference_type="EXPENSE",
                reference_id=exp_row.id,
                reference_number=exp_row.expense_number,
                user_id=user_id,
            )
        summary["expenses"] = len(demo_expenses)

    return summary


def seed_demo_textile_data() -> None:
    with SessionLocal() as db:
        seed_initial_master_data(db)
        owner = db.scalar(select(User).order_by(User.is_owner.desc(), User.id))
        if not owner:
            raise RuntimeError("No user found in DB. Create the Owner account first via /setup-owner or scripts/init_db.py.")

        branch_id = get_default_branch_id(db)
        suppliers = _get_or_create_suppliers(db)
        customers = _get_or_create_customers(db)
        products = _get_or_create_products(db, branch_id, owner.id)
        cash_acc, bank_acc = _seed_opening_working_capital(db, owner.id)
        wf_summary = _seed_sample_workflows(
            db, suppliers, customers, products, cash_acc, bank_acc, branch_id, owner.id
        )
        db.commit()

        print("[OK] Textile-only demo data ready:")
        print(f"     Suppliers: {len(suppliers)} | Customers: {len(customers)} | Cloth Products: {len(products)}")
        print(f"     Workflows added in this run: {wf_summary}")


if __name__ == "__main__":
    seed_demo_textile_data()
