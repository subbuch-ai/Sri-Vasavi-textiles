from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_customer, get_optional_customer
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.security import hash_token
from app.models.inventory import Category, Product
from app.models.organization import BusinessSettings, Notification
from app.models.sales import CustomerOrder, CustomerOrderItem, Sale, SaleItem
from app.models.storefront import (
    CartItem,
    CustomerAccount,
    CustomerAddress,
    CustomerCart,
    CustomerNotification,
    CustomerRefreshToken,
    Promotion,
    StorefrontBanner,
    WholesaleApplication,
    WholesaleEnquiry,
)
from app.schemas.auth import RefreshTokenRequest
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.storefront import (
    CartItemAdd,
    CartItemUpdate,
    CartOut,
    CartPromoApply,
    CustomerAddressCreate,
    CustomerAddressOut,
    CustomerAddressUpdate,
    CustomerAuthOut,
    CustomerForgotPasswordRequest,
    CustomerLoginRequest,
    CustomerMeOut,
    CustomerNotificationOut,
    CustomerProfileUpdate,
    CustomerRegisterRequest,
    CustomerResetPasswordRequest,
    ManualPaymentVerifyRequest,
    OrderCancelRequest,
    RazorpayVerifyRequest,
    StoreBannerOut,
    StoreCheckoutOut,
    StoreCheckoutRequest,
    StoreOrderOut,
    StoreProductOut,
    StorePromotionOut,
    StorefrontConfigPublicOut,
    WholesaleApplicationCreate,
    WholesaleApplicationOut,
    WholesaleEnquiryCreate,
    WholesaleEnquiryOut,
)
from app.services.export_service import build_invoice_pdf
from app.services.numbering_service import generate_sequential_code
from app.services.storefront_service import (
    _get_or_create_cart,
    _to_customer_me,
    add_item_to_cart,
    cancel_order_with_stock_and_refund,
    checkout_customer_cart,
    compute_cart_out,
    login_customer,
    record_manual_online_payment_reference,
    refresh_customer_session,
    register_customer,
    request_password_reset,
    reset_password_confirm,
    to_public_config_out,
    to_store_order_out,
    to_store_product,
    update_cart_item_qty,
    verify_razorpay_order_payment,
)

router = APIRouter(prefix="/store", tags=["Customer E-Commerce Storefront"])


# ---------------- Public Storefront Home & Catalogue ----------------
@router.get("/home")
def get_storefront_home(
    account: Optional[CustomerAccount] = Depends(get_optional_customer),
    db: Session = Depends(get_db),
) -> dict:
    config = to_public_config_out(db)
    banners = db.scalars(
        select(StorefrontBanner)
        .where(StorefrontBanner.is_active.is_(True))
        .order_by(StorefrontBanner.display_order, StorefrontBanner.id)
    ).all()
    categories = db.scalars(
        select(Category).where(Category.is_active.is_(True)).order_by(Category.id)
    ).all()

    base_stmt = (
        select(Product)
        .options(joinedload(Product.category), joinedload(Product.images))
        .where(Product.is_active.is_(True), Product.is_storefront_visible.is_(True))
    )
    all_visible = db.scalars(base_stmt.order_by(desc(Product.id))).unique().all()

    featured = [to_store_product(p, account) for p in all_visible if p.is_featured][:8]
    if not featured:
        featured = [to_store_product(p, account) for p in all_visible[:8]]

    new_arrivals = [to_store_product(p, account) for p in all_visible if p.is_new_arrival][:8]
    if not new_arrivals:
        new_arrivals = [to_store_product(p, account) for p in all_visible[:8]]

    best_sellers = [to_store_product(p, account) for p in all_visible if p.is_best_seller][:8]
    if not best_sellers:
        best_sellers = [to_store_product(p, account) for p in all_visible[:8]]

    now = datetime.now(timezone.utc)
    promos = db.scalars(
        select(Promotion)
        .where(
            Promotion.is_active.is_(True),
            or_(Promotion.starts_at.is_(None), Promotion.starts_at <= now),
            or_(Promotion.ends_at.is_(None), Promotion.ends_at >= now),
        )
        .order_by(desc(Promotion.id))
    ).all()

    return {
        "config": config,
        "banners": [StoreBannerOut.model_validate(b) for b in banners],
        "categories": [{"id": c.id, "name": c.name, "code": c.code, "description": c.description} for c in categories],
        "featured_products": featured,
        "new_arrivals": new_arrivals,
        "best_sellers": best_sellers,
        "promotions": [StorePromotionOut.model_validate(pr) for pr in promos],
    }


@router.get("/config", response_model=StorefrontConfigPublicOut)
def get_public_store_config(db: Session = Depends(get_db)) -> StorefrontConfigPublicOut:
    return to_public_config_out(db)


@router.get("/categories")
def list_store_categories(db: Session = Depends(get_db)) -> List[dict]:
    cats = db.scalars(select(Category).where(Category.is_active.is_(True)).order_by(Category.id)).all()
    return [{"id": c.id, "name": c.name, "code": c.code, "description": c.description} for c in cats]


@router.get("/products", response_model=PaginatedResponse[StoreProductOut])
def list_store_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=60),
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    category_code: Optional[str] = None,
    min_price: Optional[Decimal] = None,
    max_price: Optional[Decimal] = None,
    size: Optional[str] = None,
    color: Optional[str] = None,
    featured: Optional[bool] = None,
    new_arrival: Optional[bool] = None,
    best_seller: Optional[bool] = None,
    in_stock_only: bool = False,
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc|name_asc)$"),
    account: Optional[CustomerAccount] = Depends(get_optional_customer),
    db: Session = Depends(get_db),
) -> PaginatedResponse[StoreProductOut]:
    stmt = (
        select(Product)
        .join(Category, Category.id == Product.category_id)
        .options(joinedload(Product.category), joinedload(Product.images))
        .where(Product.is_active.is_(True), Product.is_storefront_visible.is_(True), Category.is_active.is_(True))
    )
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if category_code:
        stmt = stmt.where(func.upper(Category.code) == category_code.strip().upper())
    if min_price is not None:
        stmt = stmt.where(Product.retail_price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.retail_price <= max_price)
    if size:
        stmt = stmt.where(Product.size.ilike(f"%{size.strip()}%"))
    if color:
        stmt = stmt.where(Product.color.ilike(f"%{color.strip()}%"))
    if featured is not None:
        stmt = stmt.where(Product.is_featured.is_(featured))
    if new_arrival is not None:
        stmt = stmt.where(Product.is_new_arrival.is_(new_arrival))
    if best_seller is not None:
        stmt = stmt.where(Product.is_best_seller.is_(best_seller))
    if in_stock_only:
        stmt = stmt.where((Product.current_stock - Product.reserved_stock) > 0)
    if search and search.strip():
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(pat),
                Product.description.ilike(pat),
                Product.brand.ilike(pat),
                Product.fabric_type.ilike(pat),
                Product.product_code.ilike(pat),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(Product.id).subquery())) or 0

    if sort == "price_asc":
        order_col = asc(Product.retail_price)
    elif sort == "price_desc":
        order_col = desc(Product.retail_price)
    elif sort == "name_asc":
        order_col = asc(Product.name)
    else:
        order_col = desc(Product.id)

    rows = db.scalars(stmt.order_by(order_col, desc(Product.id)).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return PaginatedResponse(
        items=[to_store_product(p, account) for p in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/products/{product_id}", response_model=StoreProductOut)
def get_store_product_detail(
    product_id: int,
    account: Optional[CustomerAccount] = Depends(get_optional_customer),
    db: Session = Depends(get_db),
) -> StoreProductOut:
    p = db.scalar(
        select(Product)
        .options(joinedload(Product.category), joinedload(Product.images))
        .where(Product.id == product_id, Product.is_active.is_(True), Product.is_storefront_visible.is_(True))
    )
    if not p:
        raise NotFoundError("Product not found.")
    return to_store_product(p, account)


# ---------------- Customer Authentication & Profile ----------------
@router.post("/auth/register", response_model=CustomerAuthOut, status_code=201)
def customer_register(payload: CustomerRegisterRequest, db: Session = Depends(get_db)) -> CustomerAuthOut:
    out = register_customer(db, payload)
    db.commit()
    return out


@router.post("/auth/login", response_model=CustomerAuthOut)
def customer_login(payload: CustomerLoginRequest, db: Session = Depends(get_db)) -> CustomerAuthOut:
    out = login_customer(db, payload)
    db.commit()
    return out


@router.post("/auth/refresh", response_model=CustomerAuthOut)
def customer_refresh(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> CustomerAuthOut:
    out = refresh_customer_session(db, payload.refresh_token)
    db.commit()
    return out


@router.post("/auth/logout", response_model=MessageResponse)
def customer_logout(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> MessageResponse:
    rt = db.scalar(select(CustomerRefreshToken).where(CustomerRefreshToken.token_hash == hash_token(payload.refresh_token)))
    if rt and not rt.revoked_at:
        rt.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return MessageResponse(message="Logged out successfully.")


@router.post("/auth/forgot-password")
def customer_forgot_password(payload: CustomerForgotPasswordRequest, db: Session = Depends(get_db)) -> dict:
    res = request_password_reset(db, payload.email)
    db.commit()
    return res


@router.post("/auth/reset-password", response_model=MessageResponse)
def customer_reset_password(payload: CustomerResetPasswordRequest, db: Session = Depends(get_db)) -> MessageResponse:
    reset_password_confirm(db, payload.token, payload.new_password)
    db.commit()
    return MessageResponse(message="Password reset successfully. You can now sign in.")


@router.get("/auth/me", response_model=CustomerMeOut)
def customer_me(
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CustomerMeOut:
    return _to_customer_me(db, account)


@router.patch("/auth/me", response_model=CustomerMeOut)
def update_customer_profile(
    payload: CustomerProfileUpdate,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CustomerMeOut:
    c = account.customer
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return _to_customer_me(db, account)


# ---------------- Addresses ----------------
@router.get("/addresses", response_model=List[CustomerAddressOut])
def list_addresses(
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> List[CustomerAddressOut]:
    rows = db.scalars(
        select(CustomerAddress)
        .where(CustomerAddress.customer_id == account.customer_id)
        .order_by(CustomerAddress.is_default.desc(), CustomerAddress.id.desc())
    ).all()
    return [CustomerAddressOut.model_validate(a) for a in rows]


@router.post("/addresses", response_model=CustomerAddressOut, status_code=201)
def create_address(
    payload: CustomerAddressCreate,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CustomerAddressOut:
    if payload.is_default:
        existing_defs = db.scalars(
            select(CustomerAddress).where(CustomerAddress.customer_id == account.customer_id, CustomerAddress.is_default.is_(True))
        ).all()
        for a in existing_defs:
            a.is_default = False
    addr = CustomerAddress(customer_id=account.customer_id, **payload.model_dump())
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return CustomerAddressOut.model_validate(addr)


@router.patch("/addresses/{address_id}", response_model=CustomerAddressOut)
def update_address(
    address_id: int,
    payload: CustomerAddressUpdate,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CustomerAddressOut:
    addr = db.scalar(
        select(CustomerAddress).where(CustomerAddress.id == address_id, CustomerAddress.customer_id == account.customer_id)
    )
    if not addr:
        raise NotFoundError("Address not found.")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("is_default"):
        existing_defs = db.scalars(
            select(CustomerAddress).where(CustomerAddress.customer_id == account.customer_id, CustomerAddress.id != addr.id)
        ).all()
        for a in existing_defs:
            a.is_default = False
    for k, v in updates.items():
        setattr(addr, k, v)
    db.commit()
    db.refresh(addr)
    return CustomerAddressOut.model_validate(addr)


@router.delete("/addresses/{address_id}", response_model=MessageResponse)
def delete_address(
    address_id: int,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> MessageResponse:
    addr = db.scalar(
        select(CustomerAddress).where(CustomerAddress.id == address_id, CustomerAddress.customer_id == account.customer_id)
    )
    if not addr:
        raise NotFoundError("Address not found.")
    db.delete(addr)
    db.commit()
    return MessageResponse(message="Address deleted.")


# ---------------- Shopping Cart ----------------
@router.get("/cart", response_model=CartOut)
def get_cart(
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CartOut:
    out = compute_cart_out(db, account)
    db.commit()
    return out


@router.post("/cart/items", response_model=CartOut)
def add_to_cart(
    payload: CartItemAdd,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CartOut:
    out = add_item_to_cart(
        db,
        account,
        product_id=payload.product_id,
        quantity=payload.quantity,
        selected_size=payload.selected_size,
        selected_color=payload.selected_color,
    )
    db.commit()
    return out


@router.patch("/cart/items/{item_id}", response_model=CartOut)
def update_cart_item(
    item_id: int,
    payload: CartItemUpdate,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CartOut:
    out = update_cart_item_qty(db, account, item_id, payload.quantity)
    db.commit()
    return out


@router.delete("/cart/items/{item_id}", response_model=CartOut)
def remove_cart_item(
    item_id: int,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CartOut:
    out = update_cart_item_qty(db, account, item_id, Decimal("0.000"))
    db.commit()
    return out


@router.post("/cart/promo", response_model=CartOut)
def apply_promo_code(
    payload: CartPromoApply,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> CartOut:
    cart = _get_or_create_cart(db, account.customer_id)
    cart.promo_code = payload.promo_code.strip().upper() if payload.promo_code else None
    out = compute_cart_out(db, account, promo_override=cart.promo_code)
    if payload.promo_code and not out.promo_code and out.promo_message:
        cart.promo_code = None
        db.commit()
        raise ValidationError(out.promo_message)
    db.commit()
    return out


# ---------------- Checkout, Payment Verification & Orders ----------------
@router.post("/checkout", response_model=StoreCheckoutOut, status_code=201)
def store_checkout(
    payload: StoreCheckoutRequest,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> StoreCheckoutOut:
    out = checkout_customer_cart(db, account, payload)
    db.commit()
    return out


@router.post("/payments/razorpay/verify", response_model=StoreOrderOut)
def verify_razorpay(
    payload: RazorpayVerifyRequest,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> StoreOrderOut:
    out = verify_razorpay_order_payment(
        db,
        account,
        order_id=payload.order_id,
        razorpay_order_id=payload.razorpay_order_id,
        razorpay_payment_id=payload.razorpay_payment_id,
        razorpay_signature=payload.razorpay_signature,
    )
    db.commit()
    return out


@router.post("/payments/manual/submit-ref", response_model=StoreOrderOut)
def submit_manual_payment_reference(
    payload: ManualPaymentVerifyRequest,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> StoreOrderOut:
    order = db.scalar(
        select(CustomerOrder)
        .options(
            joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
            joinedload(CustomerOrder.status_history),
            joinedload(CustomerOrder.delivery_detail),
        )
        .where(CustomerOrder.id == payload.order_id, CustomerOrder.customer_id == account.customer_id)
    )
    if not order:
        raise NotFoundError("Order not found.")
    if order.payment_method not in ("UPI", "BANK_TRANSFER"):
        raise ValidationError("Reference submission is only for UPI or Bank Transfer orders.")
    record_manual_online_payment_reference(
        db,
        order=order,
        transaction_reference=payload.transaction_reference,
        user_id=None,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(order)
    return to_store_order_out(db, order)


@router.get("/orders", response_model=List[StoreOrderOut])
def list_my_orders(
    order_type: Optional[str] = None,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> List[StoreOrderOut]:
    stmt = (
        select(CustomerOrder)
        .options(
            joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
            joinedload(CustomerOrder.status_history),
            joinedload(CustomerOrder.delivery_detail),
        )
        .where(CustomerOrder.customer_id == account.customer_id)
    )
    if order_type:
        stmt = stmt.where(CustomerOrder.order_type == order_type)
    rows = db.scalars(stmt.order_by(desc(CustomerOrder.id))).unique().all()
    return [to_store_order_out(db, o) for o in rows]


@router.get("/orders/{order_id}", response_model=StoreOrderOut)
def get_my_order(
    order_id: int,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> StoreOrderOut:
    o = db.scalar(
        select(CustomerOrder)
        .options(
            joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
            joinedload(CustomerOrder.status_history),
            joinedload(CustomerOrder.delivery_detail),
        )
        .where(CustomerOrder.id == order_id, CustomerOrder.customer_id == account.customer_id)
    )
    if not o:
        raise NotFoundError("Order not found.")
    return to_store_order_out(db, o)


@router.post("/orders/{order_id}/cancel", response_model=StoreOrderOut)
def cancel_my_order(
    order_id: int,
    payload: OrderCancelRequest,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> StoreOrderOut:
    o = db.scalar(
        select(CustomerOrder)
        .where(CustomerOrder.id == order_id, CustomerOrder.customer_id == account.customer_id)
        .with_for_update()
    )
    if not o:
        raise NotFoundError("Order not found.")
    cancel_order_with_stock_and_refund(
        db,
        order=o,
        reason=payload.reason,
        actor_type="CUSTOMER",
        actor_id=account.customer_id,
    )
    db.commit()
    loaded = db.scalar(
        select(CustomerOrder)
        .options(
            joinedload(CustomerOrder.items).joinedload(CustomerOrderItem.product),
            joinedload(CustomerOrder.status_history),
            joinedload(CustomerOrder.delivery_detail),
        )
        .where(CustomerOrder.id == o.id)
    )
    return to_store_order_out(db, loaded)


@router.get("/orders/{order_id}/invoice/pdf")
def download_my_order_invoice_pdf(
    order_id: int,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> Response:
    o = db.scalar(
        select(CustomerOrder).where(CustomerOrder.id == order_id, CustomerOrder.customer_id == account.customer_id)
    )
    if not o:
        raise NotFoundError("Order not found.")
    if not o.converted_sale_id:
        raise ValidationError("Tax invoice PDF will be available once the order is confirmed and billed.")
    sale = db.scalar(
        select(Sale)
        .options(joinedload(Sale.customer), joinedload(Sale.items).joinedload(SaleItem.product))
        .where(Sale.id == o.converted_sale_id)
    )
    if not sale:
        raise NotFoundError("Linked tax invoice not found.")
    biz = db.scalar(select(BusinessSettings).limit(1))
    pdf_bytes = build_invoice_pdf(sale, biz)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{sale.invoice_number}.pdf"'},
    )


# ---------------- Wholesale Portal (Applications & Bulk Enquiries) ----------------
@router.post("/wholesale/apply", response_model=WholesaleApplicationOut, status_code=201)
def submit_wholesale_application(
    payload: WholesaleApplicationCreate,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> WholesaleApplicationOut:
    c = account.customer
    if c.is_wholesale_approved:
        raise ConflictError("Your account is already an approved Wholesale Dealer.")
    existing_pending = db.scalar(
        select(WholesaleApplication).where(
            WholesaleApplication.customer_id == c.id,
            WholesaleApplication.status == "PENDING",
        )
    )
    if existing_pending:
        raise ConflictError("You already have a pending wholesale application under review.")

    app_row = WholesaleApplication(customer_id=c.id, **payload.model_dump(), status="PENDING")
    c.customer_type = "WHOLESALE"
    c.wholesale_status = "PENDING"
    if payload.gst_number:
        c.gst_number = payload.gst_number
    db.add(app_row)
    db.add(
        Notification(
            user_id=None,
            title=f"Wholesale Application: {payload.business_name}",
            message=f"{c.name} ({payload.contact_mobile}) submitted a wholesale dealer verification request.",
            category="WHOLESALE_APPROVAL",
            link="/storefront-admin",
        )
    )
    db.commit()
    db.refresh(app_row)
    return WholesaleApplicationOut.model_validate(app_row)


@router.get("/wholesale/applications", response_model=List[WholesaleApplicationOut])
def my_wholesale_applications(
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> List[WholesaleApplicationOut]:
    rows = db.scalars(
        select(WholesaleApplication)
        .where(WholesaleApplication.customer_id == account.customer_id)
        .order_by(desc(WholesaleApplication.id))
    ).all()
    return [WholesaleApplicationOut.model_validate(r) for r in rows]


@router.post("/wholesale/enquiries", response_model=WholesaleEnquiryOut, status_code=201)
def create_wholesale_enquiry(
    payload: WholesaleEnquiryCreate,
    account: Optional[CustomerAccount] = Depends(get_optional_customer),
    db: Session = Depends(get_db),
) -> WholesaleEnquiryOut:
    prod_name = None
    if payload.product_id:
        p = db.scalar(select(Product).where(Product.id == payload.product_id))
        if not p:
            raise NotFoundError("Selected product not found.")
        prod_name = p.name

    enq = WholesaleEnquiry(
        enquiry_number=generate_sequential_code(db, WholesaleEnquiry, "enquiry_number", "SVT-ENQ-", 5),
        customer_id=account.customer_id if account else None,
        product_id=payload.product_id,
        contact_name=payload.contact_name.strip(),
        business_name=payload.business_name.strip() if payload.business_name else None,
        mobile=payload.mobile.strip(),
        email=payload.email,
        requested_quantity=payload.requested_quantity,
        target_price=payload.target_price,
        message=payload.message.strip(),
        status="OPEN",
    )
    db.add(enq)
    db.add(
        Notification(
            user_id=None,
            title=f"Wholesale Bulk Enquiry {enq.enquiry_number}",
            message=f"{enq.contact_name} ({enq.mobile}) requested quote for qty {enq.requested_quantity}.",
            category="WHOLESALE_ENQUIRY",
            link="/storefront-admin",
        )
    )
    db.commit()
    db.refresh(enq)
    return WholesaleEnquiryOut(
        **{
            k: getattr(enq, k)
            for k in (
                "id",
                "enquiry_number",
                "customer_id",
                "product_id",
                "contact_name",
                "business_name",
                "mobile",
                "email",
                "requested_quantity",
                "target_price",
                "message",
                "status",
                "quoted_price",
                "admin_response",
                "created_at",
            )
        },
        product_name=prod_name,
    )


@router.get("/wholesale/enquiries", response_model=List[WholesaleEnquiryOut])
def list_my_wholesale_enquiries(
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> List[WholesaleEnquiryOut]:
    rows = db.scalars(
        select(WholesaleEnquiry)
        .options(joinedload(WholesaleEnquiry.product))
        .where(WholesaleEnquiry.customer_id == account.customer_id)
        .order_by(desc(WholesaleEnquiry.id))
    ).all()
    return [
        WholesaleEnquiryOut(
            id=r.id,
            enquiry_number=r.enquiry_number,
            customer_id=r.customer_id,
            product_id=r.product_id,
            product_name=r.product.name if r.product else None,
            contact_name=r.contact_name,
            business_name=r.business_name,
            mobile=r.mobile,
            email=r.email,
            requested_quantity=r.requested_quantity,
            target_price=r.target_price,
            message=r.message,
            status=r.status,
            quoted_price=r.quoted_price,
            admin_response=r.admin_response,
            created_at=r.created_at,
        )
        for r in rows
    ]


# ---------------- Customer Notifications ----------------
@router.get("/notifications", response_model=List[CustomerNotificationOut])
def list_customer_notifications(
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> List[CustomerNotificationOut]:
    rows = db.scalars(
        select(CustomerNotification)
        .where(
            CustomerNotification.customer_id == account.customer_id,
            CustomerNotification.channel == "IN_APP",
        )
        .order_by(desc(CustomerNotification.id))
        .limit(50)
    ).all()
    return [CustomerNotificationOut.model_validate(n) for n in rows]


@router.post("/notifications/{notification_id}/read", response_model=MessageResponse)
def mark_customer_notification_read(
    notification_id: int,
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> MessageResponse:
    n = db.scalar(
        select(CustomerNotification).where(
            CustomerNotification.id == notification_id,
            CustomerNotification.customer_id == account.customer_id,
        )
    )
    if n:
        n.is_read = True
        db.commit()
    return MessageResponse(message="Marked as read.")


@router.post("/notifications/read-all", response_model=MessageResponse)
def mark_all_customer_notifications_read(
    account: CustomerAccount = Depends(get_current_customer),
    db: Session = Depends(get_db),
) -> MessageResponse:
    rows = db.scalars(
        select(CustomerNotification).where(
            CustomerNotification.customer_id == account.customer_id,
            CustomerNotification.is_read.is_(False),
        )
    ).all()
    for r in rows:
        r.is_read = True
    db.commit()
    return MessageResponse(message="All notifications marked as read.")
