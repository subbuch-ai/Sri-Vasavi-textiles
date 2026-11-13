import base64
import hashlib
import hmac
import json
import secrets
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.exceptions import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.inventory import Category, Product
from app.models.organization import Notification
from app.models.parties import Customer
from app.models.sales import CustomerOrder, CustomerOrderItem
from app.models.storefront import (
    CartItem,
    CustomerAccount,
    CustomerAddress,
    CustomerCart,
    CustomerNotification,
    CustomerRefreshToken,
    DeliveryDetail,
    OnlinePayment,
    OrderStatusHistory,
    PaymentTransaction,
    Promotion,
    StorefrontBanner,
    StorefrontConfig,
    WholesaleApplication,
    WholesaleEnquiry,
)
from app.schemas.finance import PaymentCreate
from app.schemas.storefront import (
    CartItemOut,
    CartOut,
    CustomerAddressOut,
    CustomerAuthOut,
    CustomerLoginRequest,
    CustomerMeOut,
    CustomerRegisterRequest,
    DeliveryDetailOut,
    OnlinePaymentOut,
    OrderStatusHistoryOut,
    StoreBannerOut,
    StoreCheckoutOut,
    StoreCheckoutRequest,
    StoreOrderOut,
    StoreProductImageOut,
    StoreProductOut,
    StorefrontConfigPublicOut,
    WholesaleApplicationCreate,
    WholesaleEnquiryCreate,
)
from app.schemas.sales import CustomerOrderItemOut
from app.services.finance_service import create_payment_record, record_financial_entry, resolve_account
from app.services.inventory_service import get_default_branch_id
from app.services.notification_service import notify_customer_event, notify_customer_order_event
from app.services.numbering_service import generate_sequential_code, next_settings_document_number


def _q2(val: Decimal) -> Decimal:
    return Decimal(val).quantize(Decimal("0.01"))


def get_or_create_storefront_config(db: Session) -> StorefrontConfig:
    cfg = db.scalar(select(StorefrontConfig).limit(1))
    if not cfg:
        cfg = StorefrontConfig(
            store_enabled=True,
            contact_phone="+91 98765 43210",
            contact_email="orders@srivasavitextiles.com",
            contact_address="Sri Vasavi Textiles, Main Cloth Market, India",
            free_delivery_threshold=Decimal("1500.00"),
            standard_delivery_charge=Decimal("80.00"),
            cod_enabled=True,
            upi_enabled=True,
            bank_transfer_enabled=True,
        )
        db.add(cfg)
        db.flush()
    return cfg


def _split_csv_tokens(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def to_store_product(p: Product, account: Optional[CustomerAccount]) -> StoreProductOut:
    """Serialize a Product for public/customer storefront, strictly hiding wholesale_price unless approved."""
    customer = account.customer if account else None
    is_wholesale = bool(customer and customer.is_wholesale_approved)
    avail = max(Decimal("0.000"), Decimal(p.current_stock) - Decimal(p.reserved_stock))
    specs = p.specifications if isinstance(p.specifications, dict) else {}

    sizes = specs.get("sizes") if isinstance(specs.get("sizes"), list) else _split_csv_tokens(p.size)
    colors = specs.get("colors") if isinstance(specs.get("colors"), list) else _split_csv_tokens(p.color)

    return StoreProductOut(
        id=p.id,
        product_code=p.product_code,
        name=p.name,
        category_id=p.category_id,
        category_name=p.category.name if p.category else "",
        category_code=p.category.code if p.category else "",
        brand=p.brand,
        description=p.description,
        size=p.size,
        color=p.color,
        available_sizes=[str(s) for s in sizes],
        available_colors=[str(c) for c in colors],
        fabric_type=p.fabric_type,
        hsn_code=p.hsn_code,
        unit=p.unit,
        retail_price=p.retail_price,
        wholesale_price=p.wholesale_price if is_wholesale else None,
        wholesale_eligible=Decimal(p.wholesale_price) < Decimal(p.retail_price),
        wholesale_min_qty=p.wholesale_min_qty,
        gst_rate=p.gst_rate,
        available_stock=avail,
        in_stock=avail > Decimal("0.000"),
        image_url=p.image_url,
        images=[StoreProductImageOut.model_validate(im) for im in (p.images or [])],
        is_featured=p.is_featured,
        is_new_arrival=p.is_new_arrival,
        is_best_seller=p.is_best_seller,
        specifications=p.specifications,
        created_at=p.created_at,
    )


def _to_customer_me(db: Session, account: CustomerAccount) -> CustomerMeOut:
    c = account.customer
    addresses = db.scalars(
        select(CustomerAddress)
        .where(CustomerAddress.customer_id == c.id)
        .order_by(CustomerAddress.is_default.desc(), CustomerAddress.id.desc())
    ).all()
    return CustomerMeOut(
        id=account.id,
        customer_id=c.id,
        customer_code=c.customer_code,
        name=c.name,
        email=account.email,
        mobile=account.mobile,
        address=c.address,
        city=c.city,
        state=c.state,
        customer_type=c.customer_type,
        wholesale_status=c.wholesale_status,
        is_wholesale_approved=c.is_wholesale_approved,
        gst_number=c.gst_number,
        credit_limit=c.credit_limit,
        outstanding_balance=c.outstanding_balance,
        addresses=[CustomerAddressOut.model_validate(a) for a in addresses],
    )


def _issue_customer_tokens(db: Session, account: CustomerAccount) -> CustomerAuthOut:
    customer = account.customer
    access_token = create_access_token(
        subject=str(account.id),
        role="CUSTOMER",
        extra_claims={
            "scope": "customer",
            "customer_id": customer.id,
            "customer_type": customer.customer_type,
        },
    )
    raw_refresh, token_hash, expires_at = create_refresh_token(subject=f"cust:{account.id}")
    db.add(
        CustomerRefreshToken(
            customer_account_id=account.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    db.flush()
    return CustomerAuthOut(
        access_token=access_token,
        refresh_token=raw_refresh,
        customer=_to_customer_me(db, account),
    )


# ---------------- Auth & Account Management ----------------
def register_customer(db: Session, payload: CustomerRegisterRequest) -> CustomerAuthOut:
    email_norm = payload.email.strip().lower()
    mobile_norm = payload.mobile.strip()

    if db.scalar(select(CustomerAccount.id).where(CustomerAccount.email == email_norm)):
        raise ConflictError("An account with this email address already exists.")
    if db.scalar(select(CustomerAccount.id).where(CustomerAccount.mobile == mobile_norm)):
        raise ConflictError("An account with this mobile number already exists.")

    # Reuse existing CRM Customer without an online account if mobile matches, else create new
    existing_cust = db.scalar(
        select(Customer)
        .outerjoin(CustomerAccount, CustomerAccount.customer_id == Customer.id)
        .where(Customer.mobile == mobile_norm, CustomerAccount.id.is_(None))
    )

    is_ws_req = payload.customer_type == "WHOLESALE"
    if existing_cust:
        customer = existing_cust
        customer.name = payload.name.strip()
        customer.email = email_norm
        if payload.address:
            customer.address = payload.address
        if payload.city:
            customer.city = payload.city
        if payload.state:
            customer.state = payload.state
        if payload.gst_number:
            customer.gst_number = payload.gst_number
        if is_ws_req and not customer.is_wholesale_approved:
            customer.customer_type = "WHOLESALE"
            customer.wholesale_status = "PENDING"
    else:
        code = generate_sequential_code(db, Customer, "customer_code", "SVT-CUS-", 5)
        customer = Customer(
            customer_code=code,
            name=payload.name.strip(),
            mobile=mobile_norm,
            email=email_norm,
            address=payload.address,
            city=payload.city,
            state=payload.state,
            customer_type=payload.customer_type,
            wholesale_status="PENDING" if is_ws_req else "NONE",
            gst_number=payload.gst_number,
            credit_limit=Decimal("0.00"),
            opening_balance=Decimal("0.00"),
            is_active=True,
        )
        db.add(customer)
        db.flush()

    account = CustomerAccount(
        customer_id=customer.id,
        email=email_norm,
        mobile=mobile_norm,
        password_hash=hash_password(payload.password),
        is_verified=True,
        is_active=True,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(account)
    db.flush()

    if payload.address and payload.city and payload.state and payload.pincode:
        db.add(
            CustomerAddress(
                customer_id=customer.id,
                label="Shop" if is_ws_req else "Home",
                recipient_name=customer.name,
                mobile=mobile_norm,
                address_line1=payload.address,
                city=payload.city,
                state=payload.state,
                pincode=payload.pincode,
                is_default=True,
            )
        )

    if is_ws_req and not customer.is_wholesale_approved:
        app_row = WholesaleApplication(
            customer_id=customer.id,
            business_name=(payload.business_name or customer.name).strip(),
            gst_number=payload.gst_number,
            shop_address=payload.address or "Provided during registration",
            city=payload.city or "-",
            state=payload.state or "-",
            pincode=payload.pincode or "000000",
            contact_name=customer.name,
            contact_mobile=mobile_norm,
            contact_email=email_norm,
            estimated_monthly_volume=payload.estimated_monthly_volume,
            status="PENDING",
        )
        db.add(app_row)
        db.add(
            Notification(
                user_id=None,
                title=f"New Wholesale Registration: {app_row.business_name}",
                message=f"{customer.name} ({mobile_norm}) applied for a Wholesale Storefront Account.",
                category="WHOLESALE_APPROVAL",
                link="/storefront-admin",
            )
        )

    notify_customer_event(
        db,
        customer_id=customer.id,
        title="Welcome to Sri Vasavi Textiles",
        message=(
            "Your wholesale account application is pending owner approval. You can browse & order at retail prices meanwhile."
            if is_ws_req and not customer.is_wholesale_approved
            else "Your shopping account is ready! Enjoy authentic Sri Vasavi Textiles collections."
        ),
    )
    db.flush()
    db.refresh(account)
    return _issue_customer_tokens(db, account)


def login_customer(db: Session, payload: CustomerLoginRequest) -> CustomerAuthOut:
    ident = payload.email_or_mobile.strip().lower()
    account = db.scalar(
        select(CustomerAccount)
        .options(joinedload(CustomerAccount.customer))
        .where(
            or_(
                func.lower(CustomerAccount.email) == ident,
                CustomerAccount.mobile == payload.email_or_mobile.strip(),
            )
        )
    )
    if not account or not verify_password(payload.password, account.password_hash):
        raise AuthenticationError("Invalid email/mobile or password.")
    if not account.is_active or not account.customer or not account.customer.is_active:
        raise AuthenticationError("Your customer account has been deactivated.")

    account.last_login_at = datetime.now(timezone.utc)
    return _issue_customer_tokens(db, account)


def refresh_customer_session(db: Session, raw_refresh_token: str) -> CustomerAuthOut:
    payload = decode_token(raw_refresh_token, expected_type="refresh")
    sub = str(payload.get("sub") or "")
    if not sub.startswith("cust:"):
        raise AuthenticationError("Invalid customer refresh token.")
    account_id = int(sub.split(":", 1)[1])

    t_hash = hash_token(raw_refresh_token)
    rt = db.scalar(
        select(CustomerRefreshToken).where(
            CustomerRefreshToken.customer_account_id == account_id,
            CustomerRefreshToken.token_hash == t_hash,
            CustomerRefreshToken.revoked_at.is_(None),
        )
    )
    if not rt or rt.expires_at < datetime.now(timezone.utc):
        raise AuthenticationError("Refresh token expired or revoked.")

    rt.revoked_at = datetime.now(timezone.utc)
    account = db.scalar(
        select(CustomerAccount)
        .options(joinedload(CustomerAccount.customer))
        .where(CustomerAccount.id == account_id)
    )
    if not account or not account.is_active:
        raise AuthenticationError("Customer account not found or inactive.")
    return _issue_customer_tokens(db, account)


def request_password_reset(db: Session, email: str) -> Dict[str, Any]:
    account = db.scalar(
        select(CustomerAccount)
        .options(joinedload(CustomerAccount.customer))
        .where(func.lower(CustomerAccount.email) == email.strip().lower())
    )
    if not account:
        return {"message": "If an account exists for this email, a reset token has been generated."}

    raw_token = secrets.token_urlsafe(24)
    account.reset_token_hash = hash_token(raw_token)
    account.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    notify_customer_event(
        db,
        customer_id=account.customer_id,
        title="Password Reset Requested",
        message=f"Use reset token {raw_token} within 30 minutes to reset your Sri Vasavi Textiles password.",
    )
    out: Dict[str, Any] = {
        "message": "If an account exists for this email, password reset instructions have been sent."
    }
    if settings.DEBUG:
        out["dev_reset_token"] = raw_token
    return out


def reset_password_confirm(db: Session, token: str, new_password: str) -> None:
    t_hash = hash_token(token.strip())
    account = db.scalar(select(CustomerAccount).where(CustomerAccount.reset_token_hash == t_hash))
    if not account or not account.reset_token_expires_at or account.reset_token_expires_at < datetime.now(timezone.utc):
        raise ValidationError("Invalid or expired password reset token.")
    account.password_hash = hash_password(new_password)
    account.reset_token_hash = None
    account.reset_token_expires_at = None
    notify_customer_event(
        db,
        customer_id=account.customer_id,
        title="Password Updated",
        message="Your storefront account password was changed successfully.",
    )


# ---------------- Shopping Cart & Pricing ----------------
def _get_or_create_cart(db: Session, customer_id: int) -> CustomerCart:
    cart = db.scalar(
        select(CustomerCart)
        .options(joinedload(CustomerCart.items).joinedload(CartItem.product).joinedload(Product.category))
        .where(CustomerCart.customer_id == customer_id)
    )
    if not cart:
        cart = CustomerCart(customer_id=customer_id)
        db.add(cart)
        db.flush()
    return cart


def _evaluate_promo(
    db: Session,
    promo_code: Optional[str],
    subtotal: Decimal,
    customer: Customer,
) -> Tuple[Optional[str], Decimal, Optional[str]]:
    if not promo_code or not promo_code.strip() or subtotal <= Decimal("0.00"):
        return None, Decimal("0.00"), None

    code_clean = promo_code.strip().upper()
    promo = db.scalar(select(Promotion).where(func.upper(Promotion.code) == code_clean, Promotion.is_active.is_(True)))
    if not promo:
        return code_clean, Decimal("0.00"), "Invalid or inactive promo code."

    now = datetime.now(timezone.utc)
    if promo.starts_at and promo.starts_at > now:
        return code_clean, Decimal("0.00"), "This offer has not started yet."
    if promo.ends_at and promo.ends_at < now:
        return code_clean, Decimal("0.00"), "This promo code has expired."
    if promo.applicable_customer_type == "WHOLESALE" and not customer.is_wholesale_approved:
        return code_clean, Decimal("0.00"), "This promo is reserved for approved Wholesale buyers."
    if promo.applicable_customer_type == "RETAIL" and customer.is_wholesale_approved:
        return code_clean, Decimal("0.00"), "This promo applies to Retail orders only."
    if subtotal < Decimal(promo.min_order_amount):
        return code_clean, Decimal("0.00"), f"Minimum order of ₹{promo.min_order_amount} required for '{code_clean}'."

    if promo.discount_type == "PERCENT":
        disc = _q2(subtotal * Decimal(promo.discount_value) / Decimal("100"))
        if promo.max_discount_amount is not None:
            disc = min(disc, Decimal(promo.max_discount_amount))
    else:
        disc = min(subtotal, _q2(Decimal(promo.discount_value)))

    return code_clean, disc, f"Offer '{code_clean}' applied (-₹{disc})."


def compute_cart_out(
    db: Session,
    account: CustomerAccount,
    promo_override: Optional[str] = None,
) -> CartOut:
    customer = account.customer
    cart = _get_or_create_cart(db, customer.id)
    cfg = get_or_create_storefront_config(db)

    raw_items: List[Tuple[CartItem, Product, Decimal, str]] = []
    subtotal = Decimal("0.00")

    for ci in cart.items:
        p = ci.product
        if not p or not p.is_active or not p.is_storefront_visible:
            continue
        use_wholesale = customer.is_wholesale_approved and Decimal(ci.quantity) >= Decimal(p.wholesale_min_qty)
        unit_price = Decimal(p.wholesale_price) if use_wholesale else Decimal(p.retail_price)
        tier = "WHOLESALE" if use_wholesale else "RETAIL"
        line_sub = _q2(Decimal(ci.quantity) * unit_price)
        subtotal += line_sub
        raw_items.append((ci, p, unit_price, tier))

    active_code = promo_override if promo_override is not None else cart.promo_code
    applied_code, discount_amt, promo_msg = _evaluate_promo(db, active_code, subtotal, customer)

    items_out: List[CartItemOut] = []
    gst_total = Decimal("0.00")

    for ci, p, unit_price, tier in raw_items:
        line_sub = _q2(Decimal(ci.quantity) * unit_price)
        line_gst = _q2(line_sub * Decimal(p.gst_rate) / Decimal("100"))
        gst_total += line_gst
        avail = max(Decimal("0.000"), Decimal(p.current_stock) - Decimal(p.reserved_stock))
        items_out.append(
            CartItemOut(
                id=ci.id,
                product_id=p.id,
                product_code=p.product_code,
                product_name=p.name,
                category_name=p.category.name if p.category else "",
                image_url=p.image_url,
                unit=p.unit,
                selected_size=ci.selected_size,
                selected_color=ci.selected_color,
                quantity=ci.quantity,
                available_stock=avail,
                unit_price=unit_price,
                pricing_tier=tier,
                wholesale_min_qty=p.wholesale_min_qty,
                gst_rate=p.gst_rate,
                line_subtotal=line_sub,
                line_gst=line_gst,
                line_total=_q2(line_sub + line_gst),
            )
        )

    delivery = Decimal("0.00")
    if items_out:
        if Decimal(cfg.free_delivery_threshold) <= Decimal("0.00") or subtotal >= Decimal(cfg.free_delivery_threshold):
            delivery = Decimal("0.00")
        else:
            delivery = _q2(Decimal(cfg.standard_delivery_charge))

    total_amount = _q2(max(Decimal("0.00"), subtotal - discount_amt + gst_total + delivery))
    return CartOut(
        items=items_out,
        item_count=len(items_out),
        promo_code=applied_code if discount_amt > Decimal("0.00") else None,
        promo_message=promo_msg,
        subtotal=subtotal,
        discount_amount=discount_amt,
        gst_amount=gst_total,
        delivery_charge=delivery,
        total_amount=total_amount,
    )


def add_item_to_cart(
    db: Session,
    account: CustomerAccount,
    *,
    product_id: int,
    quantity: Decimal,
    selected_size: str = "",
    selected_color: str = "",
) -> CartOut:
    p = db.scalar(select(Product).where(Product.id == product_id, Product.is_active.is_(True)))
    if not p or not p.is_storefront_visible:
        raise NotFoundError("Product is not available for online ordering.")

    avail = max(Decimal("0.000"), Decimal(p.current_stock) - Decimal(p.reserved_stock))
    cart = _get_or_create_cart(db, account.customer_id)

    sz = selected_size.strip()
    cl = selected_color.strip()
    existing = db.scalar(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.product_id == p.id,
            CartItem.selected_size == sz,
            CartItem.selected_color == cl,
        )
    )
    new_qty = (Decimal(existing.quantity) + Decimal(quantity)) if existing else Decimal(quantity)
    if new_qty > avail:
        raise ValidationError(
            f"Only {avail} {p.unit} of '{p.name}' currently available in stock."
        )

    if existing:
        existing.quantity = new_qty
    else:
        db.add(
            CartItem(
                cart_id=cart.id,
                product_id=p.id,
                quantity=new_qty,
                selected_size=sz,
                selected_color=cl,
            )
        )
    db.flush()
    return compute_cart_out(db, account)


def update_cart_item_qty(
    db: Session,
    account: CustomerAccount,
    item_id: int,
    quantity: Decimal,
) -> CartOut:
    cart = _get_or_create_cart(db, account.customer_id)
    item = db.scalar(select(CartItem).where(CartItem.id == item_id, CartItem.cart_id == cart.id))
    if not item:
        raise NotFoundError("Cart item not found.")

    if quantity <= Decimal("0.000"):
        db.delete(item)
    else:
        p = db.scalar(select(Product).where(Product.id == item.product_id))
        if not p or not p.is_active:
            raise ValidationError("Product is no longer available.")
        avail = max(Decimal("0.000"), Decimal(p.current_stock) - Decimal(p.reserved_stock))
        if quantity > avail:
            raise ValidationError(f"Only {avail} {p.unit} of '{p.name}' available in stock.")
        item.quantity = quantity
    db.flush()
    return compute_cart_out(db, account)


# ---------------- Checkout, Stock Reservation & Gateway Verification ----------------
def _create_razorpay_order(cfg: StorefrontConfig, amount_paise: int, receipt: str) -> str:
    """Create a Razorpay order via official API, or deterministic test order when configured with rzp_test_local_*."""
    key_id = (cfg.razorpay_key_id or "").strip()
    key_secret = (cfg.razorpay_key_secret or "").strip()
    if not key_id or not key_secret:
        raise ValidationError("Online payment gateway (Razorpay) credentials are not configured yet.")

    if key_id.startswith("rzp_test_local"):
        return f"order_local_{secrets.token_hex(8)}"

    auth_token = base64.b64encode(f"{key_id}:{key_secret}".encode("utf-8")).decode("ascii")
    body = json.dumps(
        {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "payment_capture": 1,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.razorpay.com/v1/orders",
        data=body,
        headers={
            "Authorization": f"Basic {auth_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "id" not in data:
                raise ValidationError("Unexpected response from Razorpay order API.")
            return data["id"]
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(f"Failed to initiate Razorpay payment order: {exc}") from exc


def to_store_order_out(db: Session, o: CustomerOrder) -> StoreOrderOut:
    op = db.scalar(select(OnlinePayment).where(OnlinePayment.order_id == o.id).order_by(desc(OnlinePayment.id)))
    return StoreOrderOut(
        id=o.id,
        order_number=o.order_number,
        order_date=o.order_date.isoformat(),
        order_type=o.order_type,
        order_source=o.order_source,
        order_status=o.order_status,
        payment_status=o.payment_status,
        payment_method=o.payment_method,
        subtotal=o.subtotal,
        discount_amount=o.discount_amount,
        tax_amount=o.tax_amount,
        delivery_charge=o.delivery_charge,
        total_amount=o.total_amount,
        advance_amount=o.advance_amount,
        remaining_amount=o.remaining_amount,
        shipping_name=o.shipping_name,
        shipping_mobile=o.shipping_mobile,
        shipping_address=o.shipping_address,
        shipping_city=o.shipping_city,
        shipping_state=o.shipping_state,
        shipping_pincode=o.shipping_pincode,
        cancellation_requested=o.cancellation_requested,
        cancellation_reason=o.cancellation_reason,
        converted_sale_id=o.converted_sale_id,
        notes=o.notes,
        created_at=o.created_at,
        items=[
            CustomerOrderItemOut(
                id=it.id,
                product_id=it.product_id,
                product_code=it.product.product_code if it.product else None,
                product_name=it.product.name if it.product else None,
                quantity=it.quantity,
                unit_price=it.unit_price,
                discount_amount=it.discount_amount,
                gst_rate=it.gst_rate,
                gst_amount=it.gst_amount,
                total_amount=it.total_amount,
            )
            for it in (o.items or [])
        ],
        status_history=[OrderStatusHistoryOut.model_validate(h) for h in (o.status_history or [])],
        delivery_detail=DeliveryDetailOut.model_validate(o.delivery_detail) if o.delivery_detail else None,
        online_payment=OnlinePaymentOut.model_validate(op) if op else None,
    )


def checkout_customer_cart(
    db: Session,
    account: CustomerAccount,
    payload: StoreCheckoutRequest,
) -> StoreCheckoutOut:
    """
    Atomically lock stock, reserve inventory, create unified ERP CustomerOrder,
    initiate payment gateway order if requested, clear cart, and notify both ERP and customer.
    """
    customer = account.customer
    cfg = get_or_create_storefront_config(db)
    if not cfg.store_enabled:
        raise ValidationError("Online storefront ordering is currently paused by the store owner.")

    method_enabled = {
        "COD": cfg.cod_enabled,
        "UPI": cfg.upi_enabled,
        "BANK_TRANSFER": cfg.bank_transfer_enabled,
        "RAZORPAY": bool(cfg.razorpay_key_id and cfg.razorpay_key_secret),
    }
    if not method_enabled.get(payload.payment_method, False):
        raise ValidationError(f"Payment method '{payload.payment_method}' is not currently enabled.")

    cart = _get_or_create_cart(db, customer.id)
    if not cart.items:
        raise ValidationError("Your shopping cart is empty.")

    promo_to_use = payload.promo_code if payload.promo_code is not None else cart.promo_code
    cart_summary = compute_cart_out(db, account, promo_override=promo_to_use)
    if not cart_summary.items:
        raise ValidationError("No active items remain in your shopping cart.")

    # Lock products cleanly in deterministic ID order to avoid deadlocks and double-booking
    product_ids = sorted({item.product_id for item in cart_summary.items})
    locked_products: Dict[int, Product] = {
        p.id: p
        for p in db.scalars(select(Product).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()).all()
    }

    qty_by_product: Dict[int, Decimal] = {}
    for item in cart_summary.items:
        qty_by_product[item.product_id] = qty_by_product.get(item.product_id, Decimal("0.000")) + Decimal(item.quantity)

    for pid, needed_qty in qty_by_product.items():
        prod = locked_products.get(pid)
        if not prod or not prod.is_active:
            raise ValidationError("One of the products in your cart is unavailable.")
        avail = max(Decimal("0.000"), Decimal(prod.current_stock) - Decimal(prod.reserved_stock))
        if needed_qty > avail:
            raise ValidationError(
                f"Insufficient stock for '{prod.name}'. Only {avail} {prod.unit} remaining."
            )

    # Reserve stock for each ordered product
    for pid, needed_qty in qty_by_product.items():
        locked_products[pid].reserved_stock = Decimal(locked_products[pid].reserved_stock) + needed_qty

    order_type = (
        "WHOLESALE"
        if customer.is_wholesale_approved and any(it.pricing_tier == "WHOLESALE" for it in cart_summary.items)
        else "RETAIL"
    )
    order_number = next_settings_document_number(db, "ORDER")
    branch_id = get_default_branch_id(db)

    order_items = [
        CustomerOrderItem(
            product_id=it.product_id,
            quantity=it.quantity,
            unit_price=it.unit_price,
            discount_amount=Decimal("0.00"),
            gst_rate=it.gst_rate,
            gst_amount=it.line_gst,
            total_amount=_q2(it.line_subtotal + it.line_gst),
        )
        for it in cart_summary.items
    ]

    variant_notes = "; ".join(
        f"{it.product_name}"
        + (f" [Size: {it.selected_size}]" if it.selected_size else "")
        + (f" [Color: {it.selected_color}]" if it.selected_color else "")
        + f" x{it.quantity}"
        for it in cart_summary.items
    )
    combined_notes = f"Online Order ({payload.payment_method}) | {variant_notes}"
    if payload.notes:
        combined_notes += f" | Note: {payload.notes.strip()}"

    order = CustomerOrder(
        order_number=order_number,
        customer_id=customer.id,
        branch_id=branch_id,
        order_date=date.today(),
        order_type=order_type,
        order_source="ONLINE",
        subtotal=cart_summary.subtotal,
        discount_amount=cart_summary.discount_amount,
        tax_amount=cart_summary.gst_amount,
        delivery_charge=cart_summary.delivery_charge,
        total_amount=cart_summary.total_amount,
        advance_amount=Decimal("0.00"),
        remaining_amount=cart_summary.total_amount,
        order_status="ORDER_PLACED",
        payment_status="UNPAID",
        payment_method=payload.payment_method,
        stock_deducted=False,
        stock_reserved=True,
        shipping_name=payload.recipient_name.strip(),
        shipping_mobile=payload.mobile.strip(),
        shipping_address=payload.address.strip(),
        shipping_city=payload.city.strip(),
        shipping_state=payload.state.strip(),
        shipping_pincode=payload.pincode.strip(),
        notes=combined_notes,
        items=order_items,
    )
    db.add(order)
    db.flush()

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            status="ORDER_PLACED",
            notes=f"Placed via online storefront ({payload.payment_method}). Stock reserved.",
            changed_by_type="CUSTOMER",
            changed_by_id=customer.id,
        )
    )
    db.add(DeliveryDetail(order_id=order.id, notes="Awaiting confirmation and dispatch."))

    razorpay_order_id: Optional[str] = None
    amount_paise: Optional[int] = None
    if payload.payment_method == "RAZORPAY":
        amount_paise = int(_q2(order.total_amount) * 100)
        razorpay_order_id = _create_razorpay_order(cfg, amount_paise, order.order_number)
        db.add(
            OnlinePayment(
                order_id=order.id,
                customer_id=customer.id,
                gateway_name="RAZORPAY",
                payment_method="RAZORPAY",
                gateway_order_id=razorpay_order_id,
                amount=order.total_amount,
                status="PENDING",
                verified_server_side=False,
            )
        )
    elif payload.payment_method in ("UPI", "BANK_TRANSFER"):
        db.add(
            OnlinePayment(
                order_id=order.id,
                customer_id=customer.id,
                gateway_name="DIRECT",
                payment_method=payload.payment_method,
                gateway_order_id=f"DIR_{order.order_number}",
                amount=order.total_amount,
                status="PENDING",
                verified_server_side=False,
            )
        )

    # Clear cart cleanly
    for ci in list(cart.items):
        db.delete(ci)
    cart.promo_code = None

    # Notify ERP staff + customer
    db.add(
        Notification(
            user_id=None,
            title=f"New Online {order_type.title()} Order: {order.order_number}",
            message=f"{customer.name} placed order {order.order_number} for ₹{order.total_amount} via {payload.payment_method}.",
            category="ONLINE_ORDER",
            link="/orders",
        )
    )
    notify_customer_order_event(
        db,
        order,
        title=f"Order Placed: {order.order_number}",
        message=f"Thank you! Your order {order.order_number} totaling ₹{order.total_amount} has been received.",
    )
    db.flush()

    loaded = db.scalar(
        select(CustomerOrder)
        .options(
            joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
            joinedload(CustomerOrder.status_history),
            joinedload(CustomerOrder.delivery_detail),
        )
        .where(CustomerOrder.id == order.id)
    )
    return StoreCheckoutOut(
        order=to_store_order_out(db, loaded),
        razorpay_order_id=razorpay_order_id,
        razorpay_key_id=cfg.razorpay_key_id if payload.payment_method == "RAZORPAY" else None,
        amount_paise=amount_paise,
    )


def verify_razorpay_order_payment(
    db: Session,
    account: CustomerAccount,
    *,
    order_id: int,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> StoreOrderOut:
    """Server-side HMAC-SHA256 verification before updating order & ERP financial accounts."""
    order = db.scalar(
        select(CustomerOrder)
        .where(CustomerOrder.id == order_id, CustomerOrder.customer_id == account.customer_id)
        .with_for_update()
    )
    if not order:
        raise NotFoundError("Order not found.")
    if order.order_status == "CANCELLED":
        raise ValidationError("Cannot capture payment on a cancelled order.")

    cfg = get_or_create_storefront_config(db)
    secret = (cfg.razorpay_key_secret or "").strip()
    if not secret:
        raise ValidationError("Razorpay gateway secret is not configured.")

    expected_sig = hmac.new(
        secret.encode("utf-8"),
        f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_sig, razorpay_signature):
        op_fail = db.scalar(
            select(OnlinePayment).where(OnlinePayment.order_id == order.id, OnlinePayment.gateway_order_id == razorpay_order_id)
        )
        if op_fail:
            op_fail.status = "FAILED"
            op_fail.failure_reason = "Invalid Razorpay signature."
        raise ValidationError("Payment verification failed: invalid gateway signature.")

    op = db.scalar(
        select(OnlinePayment)
        .where(OnlinePayment.order_id == order.id, OnlinePayment.gateway_order_id == razorpay_order_id)
        .with_for_update()
    )
    if not op:
        raise NotFoundError("Pending gateway payment record not found for this order.")
    if op.status == "CAPTURED" and op.verified_server_side:
        loaded = db.scalar(
            select(CustomerOrder)
            .options(
                joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
                joinedload(CustomerOrder.status_history),
                joinedload(CustomerOrder.delivery_detail),
            )
            .where(CustomerOrder.id == order.id)
        )
        return to_store_order_out(db, loaded)

    op.gateway_payment_id = razorpay_payment_id
    op.gateway_signature = razorpay_signature
    op.status = "CAPTURED"
    op.verified_server_side = True
    op.raw_payload = {
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": razorpay_payment_id,
    }
    db.add(
        PaymentTransaction(
            online_payment_id=op.id,
            order_id=order.id,
            transaction_type="CAPTURE",
            amount=op.amount,
            status="SUCCESS",
            gateway_reference=razorpay_payment_id,
            notes="Verified server-side via HMAC-SHA256.",
        )
    )

    create_payment_record(
        db,
        PaymentCreate(
            payment_date=date.today(),
            direction="INBOUND",
            party_type="CUSTOMER",
            customer_id=order.customer_id,
            customer_order_id=order.id,
            amount=op.amount,
            payment_mode="BANK_TRANSFER",
            reference_number=razorpay_payment_id,
            notes=f"Online payment captured for order {order.order_number} (Razorpay: {razorpay_payment_id})",
        ),
        user_id=None,
    )

    if order.order_status == "ORDER_PLACED":
        order.order_status = "CONFIRMED"
        db.add(
            OrderStatusHistory(
                order_id=order.id,
                status="CONFIRMED",
                notes=f"Payment verified ({razorpay_payment_id}). Order confirmed automatically.",
                changed_by_type="SYSTEM",
            )
        )

    notify_customer_order_event(
        db,
        order,
        title=f"Payment Confirmed: {order.order_number}",
        message=f"Payment of ₹{op.amount} verified successfully (Ref: {razorpay_payment_id}).",
    )
    db.flush()

    loaded = db.scalar(
        select(CustomerOrder)
        .options(
            joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
            joinedload(CustomerOrder.status_history),
            joinedload(CustomerOrder.delivery_detail),
        )
        .where(CustomerOrder.id == order.id)
    )
    return to_store_order_out(db, loaded)


def record_manual_online_payment_reference(
    db: Session,
    *,
    order: CustomerOrder,
    transaction_reference: str,
    user_id: Optional[int],
    notes: Optional[str] = None,
) -> None:
    """Confirm a UPI / Bank Transfer customer payment in ERP or verified reference into Accounts."""
    op = db.scalar(select(OnlinePayment).where(OnlinePayment.order_id == order.id).with_for_update())
    if not op:
        op = OnlinePayment(
            order_id=order.id,
            customer_id=order.customer_id,
            gateway_name="DIRECT",
            payment_method=order.payment_method,
            gateway_order_id=f"DIR_{order.order_number}",
            amount=order.remaining_amount if order.remaining_amount > 0 else order.total_amount,
            status="PENDING",
            verified_server_side=False,
        )
        db.add(op)
        db.flush()

    if op.status == "CAPTURED":
        raise ValidationError("Payment for this order is already verified and captured.")

    op.gateway_payment_id = transaction_reference.strip()
    op.status = "CAPTURED"
    op.verified_server_side = True
    db.add(
        PaymentTransaction(
            online_payment_id=op.id,
            order_id=order.id,
            transaction_type="CAPTURE",
            amount=op.amount,
            status="SUCCESS",
            gateway_reference=transaction_reference.strip(),
            notes=notes or f"{order.payment_method} verified into business bank account.",
        )
    )

    mode = "UPI" if order.payment_method == "UPI" else "BANK_TRANSFER"
    create_payment_record(
        db,
        PaymentCreate(
            payment_date=date.today(),
            direction="INBOUND",
            party_type="CUSTOMER",
            customer_id=order.customer_id,
            customer_order_id=order.id,
            amount=op.amount,
            payment_mode=mode,
            reference_number=transaction_reference.strip(),
            notes=notes or f"Verified {order.payment_method} payment for order {order.order_number}",
        ),
        user_id=user_id,
    )
    if order.order_status == "ORDER_PLACED":
        order.order_status = "CONFIRMED"
        db.add(
            OrderStatusHistory(
                order_id=order.id,
                status="CONFIRMED",
                notes=f"{order.payment_method} payment verified ({transaction_reference.strip()}).",
                changed_by_type="ERP_USER" if user_id else "SYSTEM",
                changed_by_id=user_id,
            )
        )
    notify_customer_order_event(
        db,
        order,
        title=f"Payment Verified: {order.order_number}",
        message=f"Your {order.payment_method} payment of ₹{op.amount} (Ref: {transaction_reference.strip()}) is confirmed.",
    )


def cancel_order_with_stock_and_refund(
    db: Session,
    *,
    order: CustomerOrder,
    reason: str,
    actor_type: str,
    actor_id: Optional[int],
) -> CustomerOrder:
    """
    Cancel an eligible order prior to dispatch/invoicing, release reserved_stock cleanly,
    and record accounting refund if advance/online payment was already captured.
    """
    eligible = {"ORDER_PLACED", "PENDING", "CONFIRMED", "PROCESSING"}
    if order.converted_sale_id is not None or order.stock_deducted:
        raise ValidationError("Order has already been invoiced; process a Sales Return instead.")
    if order.order_status not in eligible:
        raise ValidationError(
            f"Orders in status '{order.order_status}' cannot be cancelled under store policy."
        )

    # Release reserved stock atomically
    if order.stock_reserved:
        order_items = db.scalars(
            select(CustomerOrderItem).where(CustomerOrderItem.order_id == order.id)
        ).all()
        for it in order_items:
            prod = db.scalar(select(Product).where(Product.id == it.product_id).with_for_update())
            if prod:
                prod.reserved_stock = max(
                    Decimal("0.000"), Decimal(prod.reserved_stock) - Decimal(it.quantity)
                )
        order.stock_reserved = False

    # Reverse advance/captured payment cleanly into FinancialTransaction + Customer balance
    paid_amt = Decimal(order.advance_amount)
    if paid_amt > Decimal("0.00"):
        customer = db.scalar(select(Customer).where(Customer.id == order.customer_id).with_for_update())
        account = resolve_account(db, None, "BANK_TRANSFER" if order.payment_method != "COD" else "CASH")
        record_financial_entry(
            db,
            account_id=account.id,
            tx_date=date.today(),
            tx_type="CUSTOMER_REFUND",
            debit=paid_amt,
            credit=Decimal("0.00"),
            payment_mode="BANK_TRANSFER" if order.payment_method != "COD" else "CASH",
            description=f"Refund for cancelled order {order.order_number} ({reason})",
            reference_type="CUSTOMER_ORDER",
            reference_id=order.id,
            reference_number=order.order_number,
            user_id=actor_id if actor_type == "ERP_USER" else None,
        )
        if customer:
            customer.total_payments = max(Decimal("0.00"), Decimal(customer.total_payments) - paid_amt)
            customer.outstanding_balance = Decimal(customer.outstanding_balance) + paid_amt

        op = db.scalar(select(OnlinePayment).where(OnlinePayment.order_id == order.id).with_for_update())
        if op and op.status == "CAPTURED":
            op.status = "REFUNDED"
            db.add(
                PaymentTransaction(
                    online_payment_id=op.id,
                    order_id=order.id,
                    transaction_type="REFUND",
                    amount=paid_amt,
                    status="SUCCESS",
                    gateway_reference=f"REF-{order.order_number}",
                    notes=f"Order cancelled: {reason}",
                )
            )
        order.advance_amount = Decimal("0.00")
        order.remaining_amount = Decimal("0.00")
        order.payment_status = "REFUNDED"
    else:
        order.remaining_amount = Decimal("0.00")

    order.order_status = "CANCELLED"
    order.cancellation_requested = False
    order.cancellation_reason = reason.strip()

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            status="CANCELLED",
            notes=f"Cancelled ({actor_type}): {reason.strip()}",
            changed_by_type=actor_type,
            changed_by_id=actor_id,
        )
    )
    notify_customer_order_event(
        db,
        order,
        title=f"Order Cancelled: {order.order_number}",
        message=(
            f"Order {order.order_number} has been cancelled and reserved stock released."
            + (f" Refund of ₹{paid_amt} has been recorded." if paid_amt > 0 else "")
        ),
    )
    db.flush()
    return order


def to_public_config_out(db: Session) -> StorefrontConfigPublicOut:
    from app.models.organization import BusinessSettings

    biz = db.scalar(select(BusinessSettings).limit(1))
    cfg = get_or_create_storefront_config(db)
    return StorefrontConfigPublicOut(
        store_enabled=cfg.store_enabled,
        business_name=biz.business_name if biz else "Sri Vasavi Textiles",
        tagline=biz.tagline if biz else "Wholesale & Retail Textile Trading",
        logo_url=biz.logo_url if biz else None,
        hero_title=cfg.hero_title,
        hero_subtitle=cfg.hero_subtitle,
        contact_phone=cfg.contact_phone or (biz.phone if biz else None),
        contact_email=cfg.contact_email or (biz.email if biz else None),
        contact_address=cfg.contact_address or (biz.address if biz else None),
        whatsapp_number=cfg.whatsapp_number,
        free_delivery_threshold=cfg.free_delivery_threshold,
        standard_delivery_charge=cfg.standard_delivery_charge,
        cod_enabled=cfg.cod_enabled,
        upi_enabled=cfg.upi_enabled,
        upi_id=cfg.upi_id,
        bank_transfer_enabled=cfg.bank_transfer_enabled,
        bank_details_text=cfg.bank_details_text,
        gateway_provider=cfg.gateway_provider,
        razorpay_enabled=bool(cfg.razorpay_key_id and cfg.razorpay_key_secret),
        razorpay_key_id=cfg.razorpay_key_id if (cfg.razorpay_key_id and cfg.razorpay_key_secret) else None,
        cancellation_policy_text=cfg.cancellation_policy_text,
        return_policy_text=cfg.return_policy_text,
        privacy_policy_text=cfg.privacy_policy_text,
    )
