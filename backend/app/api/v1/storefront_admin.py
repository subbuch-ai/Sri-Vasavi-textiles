import shutil
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError
from app.models.auth import User
from app.models.organization import BusinessSettings
from app.models.parties import Customer
from app.models.sales import CustomerOrder, CustomerOrderItem
from app.models.storefront import (
    DeliveryDetail,
    OrderStatusHistory,
    Promotion,
    StorefrontBanner,
    StorefrontConfig,
    WholesaleApplication,
    WholesaleEnquiry,
)
from app.schemas.common import MessageResponse
from app.schemas.storefront import (
    BannerCreate,
    BannerUpdate,
    DeliveryDetailOut,
    DeliveryDetailUpdate,
    ManualPaymentVerifyRequest,
    OrderCancelRequest,
    PromotionCreate,
    PromotionUpdate,
    StoreBannerOut,
    StoreOrderOut,
    StorePromotionOut,
    StorefrontConfigAdminOut,
    StorefrontConfigUpdate,
    WholesaleApplicationOut,
    WholesaleApplicationReview,
    WholesaleEnquiryOut,
    WholesaleEnquiryRespond,
)
from app.services.audit_service import record_audit_log
from app.services.notification_service import notify_customer_event, notify_customer_order_event
from app.services.storefront_service import (
    cancel_order_with_stock_and_refund,
    get_or_create_storefront_config,
    record_manual_online_payment_reference,
    to_store_order_out,
)

router = APIRouter(prefix="/storefront-admin", tags=["ERP Storefront Administration"])


def _to_admin_config(db: Session, cfg: StorefrontConfig) -> StorefrontConfigAdminOut:
    biz = db.scalar(select(BusinessSettings).limit(1))
    return StorefrontConfigAdminOut(
        store_enabled=cfg.store_enabled,
        business_name=biz.business_name if biz else "Sri Vasavi Textiles",
        tagline=biz.tagline if biz else "Wholesale & Retail Textile Trading",
        logo_url=biz.logo_url if biz else None,
        hero_title=cfg.hero_title,
        hero_subtitle=cfg.hero_subtitle,
        contact_phone=cfg.contact_phone,
        contact_email=cfg.contact_email,
        contact_address=cfg.contact_address,
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
        razorpay_key_id=cfg.razorpay_key_id,
        has_razorpay_secret=bool(cfg.razorpay_key_secret),
        email_notifications_enabled=cfg.email_notifications_enabled,
        smtp_host=cfg.smtp_host,
        smtp_port=cfg.smtp_port,
        smtp_user=cfg.smtp_user,
        has_smtp_password=bool(cfg.smtp_password),
        smtp_from_email=cfg.smtp_from_email,
        whatsapp_enabled=cfg.whatsapp_enabled,
        whatsapp_api_url=cfg.whatsapp_api_url,
        whatsapp_phone_number_id=cfg.whatsapp_phone_number_id,
        has_whatsapp_token=bool(cfg.whatsapp_access_token),
        cancellation_policy_text=cfg.cancellation_policy_text,
        return_policy_text=cfg.return_policy_text,
        privacy_policy_text=cfg.privacy_policy_text,
    )


# ---------------- Storefront Summary KPIs ----------------
@router.get("/summary")
def get_storefront_admin_summary(
    _: User = Depends(require_permission("storefront:view")),
    db: Session = Depends(get_db),
) -> dict:
    total_online_orders = db.scalar(
        select(func.count(CustomerOrder.id)).where(CustomerOrder.order_source == "ONLINE")
    ) or 0
    pending_online_orders = db.scalar(
        select(func.count(CustomerOrder.id)).where(
            CustomerOrder.order_source == "ONLINE",
            CustomerOrder.order_status.in_(["ORDER_PLACED", "PENDING", "CONFIRMED", "PROCESSING"]),
        )
    ) or 0
    online_revenue = db.scalar(
        select(func.coalesce(func.sum(CustomerOrder.total_amount), 0)).where(
            CustomerOrder.order_source == "ONLINE",
            CustomerOrder.order_status != "CANCELLED",
        )
    ) or Decimal("0.00")
    pending_wholesale = db.scalar(
        select(func.count(WholesaleApplication.id)).where(WholesaleApplication.status == "PENDING")
    ) or 0
    open_enquiries = db.scalar(
        select(func.count(WholesaleEnquiry.id)).where(WholesaleEnquiry.status == "OPEN")
    ) or 0
    return {
        "total_online_orders": total_online_orders,
        "pending_online_orders": pending_online_orders,
        "online_order_value": float(online_revenue),
        "pending_wholesale_applications": pending_wholesale,
        "open_wholesale_enquiries": open_enquiries,
    }


# ---------------- Storefront Configuration ----------------
@router.get("/config", response_model=StorefrontConfigAdminOut)
def get_admin_store_config(
    _: User = Depends(require_permission("storefront:view")),
    db: Session = Depends(get_db),
) -> StorefrontConfigAdminOut:
    cfg = get_or_create_storefront_config(db)
    db.commit()
    return _to_admin_config(db, cfg)


@router.put("/config", response_model=StorefrontConfigAdminOut)
def update_admin_store_config(
    payload: StorefrontConfigUpdate,
    request: Request,
    user: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> StorefrontConfigAdminOut:
    cfg = get_or_create_storefront_config(db)
    updates = payload.model_dump(exclude_unset=True)
    # Never blank out stored secrets if frontend sends empty string intentionally omitted
    for secret_field in ("razorpay_key_secret", "smtp_password", "whatsapp_access_token"):
        if secret_field in updates and updates[secret_field] == "":
            updates.pop(secret_field)
    for k, v in updates.items():
        setattr(cfg, k, v)
    cfg.updated_by = user.id

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="storefront",
        entity_type="storefront_config",
        entity_id=cfg.id,
        description="Updated customer storefront configuration.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(cfg)
    return _to_admin_config(db, cfg)


# ---------------- Banners ----------------
@router.get("/banners", response_model=List[StoreBannerOut])
def list_admin_banners(
    _: User = Depends(require_permission("storefront:view")),
    db: Session = Depends(get_db),
) -> List[StoreBannerOut]:
    rows = db.scalars(select(StorefrontBanner).order_by(StorefrontBanner.display_order, StorefrontBanner.id)).all()
    return [StoreBannerOut.model_validate(b) for b in rows]


@router.post("/banners", response_model=StoreBannerOut, status_code=201)
def create_admin_banner(
    payload: BannerCreate,
    user: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> StoreBannerOut:
    b = StorefrontBanner(**payload.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return StoreBannerOut.model_validate(b)


@router.post("/banners/{banner_id}/image", response_model=StoreBannerOut)
def upload_banner_image(
    banner_id: int,
    file: UploadFile = File(...),
    _: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> StoreBannerOut:
    b = db.scalar(select(StorefrontBanner).where(StorefrontBanner.id == banner_id))
    if not b:
        raise NotFoundError("Banner not found.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise ValidationError("Banner image must be PNG, JPG, or WEBP.")
    target_dir = settings.upload_path / "branding"
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"banner_{b.id}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}{ext}"
    with (target_dir / filename).open("wb") as buf:
        shutil.copyfileobj(file.file, buf)
    b.image_url = f"/uploads/branding/{filename}"
    db.commit()
    db.refresh(b)
    return StoreBannerOut.model_validate(b)


@router.patch("/banners/{banner_id}", response_model=StoreBannerOut)
def update_admin_banner(
    banner_id: int,
    payload: BannerUpdate,
    _: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> StoreBannerOut:
    b = db.scalar(select(StorefrontBanner).where(StorefrontBanner.id == banner_id))
    if not b:
        raise NotFoundError("Banner not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return StoreBannerOut.model_validate(b)


@router.delete("/banners/{banner_id}", response_model=MessageResponse)
def delete_admin_banner(
    banner_id: int,
    _: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    b = db.scalar(select(StorefrontBanner).where(StorefrontBanner.id == banner_id))
    if not b:
        raise NotFoundError("Banner not found.")
    db.delete(b)
    db.commit()
    return MessageResponse(message="Banner deleted.")


# ---------------- Promotions & Discounts ----------------
@router.get("/promotions", response_model=List[StorePromotionOut])
def list_admin_promotions(
    _: User = Depends(require_permission("storefront:view")),
    db: Session = Depends(get_db),
) -> List[StorePromotionOut]:
    rows = db.scalars(select(Promotion).order_by(desc(Promotion.id))).all()
    return [StorePromotionOut.model_validate(p) for p in rows]


@router.post("/promotions", response_model=StorePromotionOut, status_code=201)
def create_admin_promotion(
    payload: PromotionCreate,
    _: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> StorePromotionOut:
    code = payload.code.strip().upper()
    if db.scalar(select(Promotion.id).where(func.upper(Promotion.code) == code)):
        raise ValidationError(f"Promo code '{code}' already exists.")
    data = payload.model_dump()
    data["code"] = code
    p = Promotion(**data)
    db.add(p)
    db.commit()
    db.refresh(p)
    return StorePromotionOut.model_validate(p)


@router.patch("/promotions/{promo_id}", response_model=StorePromotionOut)
def update_admin_promotion(
    promo_id: int,
    payload: PromotionUpdate,
    _: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> StorePromotionOut:
    p = db.scalar(select(Promotion).where(Promotion.id == promo_id))
    if not p:
        raise NotFoundError("Promotion not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return StorePromotionOut.model_validate(p)


@router.delete("/promotions/{promo_id}", response_model=MessageResponse)
def delete_admin_promotion(
    promo_id: int,
    _: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    p = db.scalar(select(Promotion).where(Promotion.id == promo_id))
    if not p:
        raise NotFoundError("Promotion not found.")
    db.delete(p)
    db.commit()
    return MessageResponse(message="Promotion deleted.")


# ---------------- Wholesale Applications & Enquiries ----------------
@router.get("/wholesale-applications", response_model=List[WholesaleApplicationOut])
def list_wholesale_applications(
    status: Optional[str] = None,
    _: User = Depends(require_permission("storefront:view")),
    db: Session = Depends(get_db),
) -> List[WholesaleApplicationOut]:
    stmt = select(WholesaleApplication)
    if status:
        stmt = stmt.where(WholesaleApplication.status == status)
    rows = db.scalars(stmt.order_by(desc(WholesaleApplication.id))).all()
    return [WholesaleApplicationOut.model_validate(r) for r in rows]


@router.post("/wholesale-applications/{app_id}/review", response_model=WholesaleApplicationOut)
def review_wholesale_application(
    app_id: int,
    payload: WholesaleApplicationReview,
    request: Request,
    user: User = Depends(require_permission("customers:edit")),
    db: Session = Depends(get_db),
) -> WholesaleApplicationOut:
    app_row = db.scalar(select(WholesaleApplication).where(WholesaleApplication.id == app_id).with_for_update())
    if not app_row:
        raise NotFoundError("Wholesale application not found.")
    customer = db.scalar(select(Customer).where(Customer.id == app_row.customer_id).with_for_update())
    if not customer:
        raise NotFoundError("Customer not found.")

    app_row.status = payload.status
    app_row.admin_notes = payload.admin_notes
    app_row.reviewed_by = user.id
    app_row.reviewed_at = datetime.now(timezone.utc)

    if payload.status == "APPROVED":
        customer.customer_type = "WHOLESALE"
        customer.wholesale_status = "APPROVED"
        if app_row.gst_number:
            customer.gst_number = app_row.gst_number
        notify_customer_event(
            db,
            customer_id=customer.id,
            title="Wholesale Account Approved!",
            message="Congratulations! Your Wholesale Buyer account has been approved. You can now view wholesale pricing and place bulk orders.",
        )
    else:
        customer.wholesale_status = "REJECTED"
        notify_customer_event(
            db,
            customer_id=customer.id,
            title="Wholesale Application Update",
            message=f"Your wholesale application was not approved. Note: {payload.admin_notes or 'Please contact our store desk.'}",
        )

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="WHOLESALE_REVIEW",
        module="storefront",
        entity_type="wholesale_application",
        entity_id=app_row.id,
        description=f"{payload.status} wholesale application for {app_row.business_name}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(app_row)
    return WholesaleApplicationOut.model_validate(app_row)


@router.get("/wholesale-enquiries", response_model=List[WholesaleEnquiryOut])
def list_all_wholesale_enquiries(
    status: Optional[str] = None,
    _: User = Depends(require_permission("storefront:view")),
    db: Session = Depends(get_db),
) -> List[WholesaleEnquiryOut]:
    stmt = select(WholesaleEnquiry).options(joinedload(WholesaleEnquiry.product))
    if status:
        stmt = stmt.where(WholesaleEnquiry.status == status)
    rows = db.scalars(stmt.order_by(desc(WholesaleEnquiry.id))).all()
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


@router.post("/wholesale-enquiries/{enquiry_id}/respond", response_model=WholesaleEnquiryOut)
def respond_to_wholesale_enquiry(
    enquiry_id: int,
    payload: WholesaleEnquiryRespond,
    user: User = Depends(require_permission("storefront:manage")),
    db: Session = Depends(get_db),
) -> WholesaleEnquiryOut:
    enq = db.scalar(
        select(WholesaleEnquiry).options(joinedload(WholesaleEnquiry.product)).where(WholesaleEnquiry.id == enquiry_id)
    )
    if not enq:
        raise NotFoundError("Wholesale enquiry not found.")
    enq.status = payload.status
    enq.quoted_price = payload.quoted_price
    enq.admin_response = payload.admin_response
    enq.responded_by = user.id
    if enq.customer_id:
        notify_customer_event(
            db,
            customer_id=enq.customer_id,
            title=f"Quote Update: {enq.enquiry_number}",
            message=payload.admin_response
            + (f" (Quoted Rate: ₹{payload.quoted_price})" if payload.quoted_price is not None else ""),
        )
    db.commit()
    db.refresh(enq)
    return WholesaleEnquiryOut(
        id=enq.id,
        enquiry_number=enq.enquiry_number,
        customer_id=enq.customer_id,
        product_id=enq.product_id,
        product_name=enq.product.name if enq.product else None,
        contact_name=enq.contact_name,
        business_name=enq.business_name,
        mobile=enq.mobile,
        email=enq.email,
        requested_quantity=enq.requested_quantity,
        target_price=enq.target_price,
        message=enq.message,
        status=enq.status,
        quoted_price=enq.quoted_price,
        admin_response=enq.admin_response,
        created_at=enq.created_at,
    )


# ---------------- ERP Online Order Fulfillment, Delivery & Refunds ----------------
@router.patch("/orders/{order_id}/delivery", response_model=DeliveryDetailOut)
def update_order_delivery_details(
    order_id: int,
    payload: DeliveryDetailUpdate,
    user: User = Depends(require_permission("orders:edit")),
    db: Session = Depends(get_db),
) -> DeliveryDetailOut:
    order = db.scalar(select(CustomerOrder).where(CustomerOrder.id == order_id))
    if not order:
        raise NotFoundError("Order not found.")
    dd = db.scalar(select(DeliveryDetail).where(DeliveryDetail.order_id == order.id))
    if not dd:
        dd = DeliveryDetail(order_id=order.id)
        db.add(dd)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(dd, k, v)
    if payload.tracking_number and not dd.dispatched_at:
        dd.dispatched_at = datetime.now(timezone.utc)
        if order.order_status in {"ORDER_PLACED", "PENDING", "CONFIRMED", "PROCESSING", "READY_FOR_DISPATCH"}:
            order.order_status = "SHIPPED"
            db.add(
                OrderStatusHistory(
                    order_id=order.id,
                    status="SHIPPED",
                    notes=f"Shipped via {dd.courier_name or 'Courier'} (Tracking: {dd.tracking_number})",
                    changed_by_type="ERP_USER",
                    changed_by_id=user.id,
                )
            )
    notify_customer_order_event(
        db,
        order,
        title=f"Shipping Update: {order.order_number}",
        message=(
            f"Courier: {dd.courier_name or 'Updated'}"
            + (f", Tracking #: {dd.tracking_number}" if dd.tracking_number else "")
        ),
    )
    db.commit()
    db.refresh(dd)
    return DeliveryDetailOut.model_validate(dd)


@router.post("/orders/{order_id}/verify-payment", response_model=StoreOrderOut)
def admin_verify_online_order_payment(
    order_id: int,
    payload: ManualPaymentVerifyRequest,
    user: User = Depends(require_permission("payments:create")),
    db: Session = Depends(get_db),
) -> StoreOrderOut:
    order = db.scalar(select(CustomerOrder).where(CustomerOrder.id == order_id).with_for_update())
    if not order:
        raise NotFoundError("Order not found.")
    record_manual_online_payment_reference(
        db,
        order=order,
        transaction_reference=payload.transaction_reference,
        user_id=user.id,
        notes=payload.notes,
    )
    db.commit()
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


@router.post("/orders/{order_id}/cancel-refund", response_model=StoreOrderOut)
def admin_cancel_and_refund_order(
    order_id: int,
    payload: OrderCancelRequest,
    user: User = Depends(require_permission("orders:edit")),
    db: Session = Depends(get_db),
) -> StoreOrderOut:
    order = db.scalar(select(CustomerOrder).where(CustomerOrder.id == order_id).with_for_update())
    if not order:
        raise NotFoundError("Order not found.")
    cancel_order_with_stock_and_refund(
        db,
        order=order,
        reason=payload.reason,
        actor_type="ERP_USER",
        actor_id=user.id,
    )
    db.commit()
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

