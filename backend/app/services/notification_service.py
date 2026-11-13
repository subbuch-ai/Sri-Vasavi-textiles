import json
import smtplib
import urllib.request
from email.message import EmailMessage
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.parties import Customer
from app.models.sales import CustomerOrder
from app.models.storefront import CustomerNotification, StorefrontConfig


def _send_email_if_enabled(cfg: Optional[StorefrontConfig], to_email: Optional[str], subject: str, body: str) -> str:
    if not cfg or not cfg.email_notifications_enabled or not to_email:
        return "SKIPPED"
    if not cfg.smtp_host or not cfg.smtp_from_email:
        return "FAILED"
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = cfg.smtp_from_email
        msg["To"] = to_email
        msg.set_content(body)
        with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port or 587, timeout=8) as server:
            server.starttls()
            if cfg.smtp_user and cfg.smtp_password:
                server.login(cfg.smtp_user, cfg.smtp_password)
            server.send_message(msg)
        return "SENT"
    except Exception:
        return "FAILED"


def _send_whatsapp_if_enabled(cfg: Optional[StorefrontConfig], to_mobile: Optional[str], message: str) -> str:
    if not cfg or not cfg.whatsapp_enabled or not to_mobile:
        return "SKIPPED"
    if not cfg.whatsapp_api_url or not cfg.whatsapp_access_token:
        return "FAILED"
    try:
        digits = "".join(ch for ch in to_mobile if ch.isdigit())
        if len(digits) == 10:
            digits = "91" + digits
        payload = {
            "messaging_product": "whatsapp",
            "to": digits,
            "type": "text",
            "text": {"body": message},
        }
        req = urllib.request.Request(
            cfg.whatsapp_api_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {cfg.whatsapp_access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            if 200 <= resp.status < 300:
                return "SENT"
            return "FAILED"
    except Exception:
        return "FAILED"


def notify_customer_event(
    db: Session,
    *,
    customer_id: int,
    title: str,
    message: str,
    order_id: Optional[int] = None,
) -> None:
    """Record in-website notification and dispatch configured Email / WhatsApp channels cleanly."""
    db.add(
        CustomerNotification(
            customer_id=customer_id,
            order_id=order_id,
            title=title,
            message=message,
            channel="IN_APP",
            delivery_status="SENT",
            is_read=False,
        )
    )

    cfg = db.scalar(select(StorefrontConfig).limit(1))
    customer = db.scalar(select(Customer).where(Customer.id == customer_id))
    if not customer or not cfg:
        return

    if cfg.email_notifications_enabled and customer.email:
        email_status = _send_email_if_enabled(cfg, customer.email, f"Sri Vasavi Textiles — {title}", message)
        db.add(
            CustomerNotification(
                customer_id=customer_id,
                order_id=order_id,
                title=title,
                message=message,
                channel="EMAIL",
                delivery_status=email_status,
                is_read=True,
            )
        )

    if cfg.whatsapp_enabled and customer.mobile:
        wa_status = _send_whatsapp_if_enabled(cfg, customer.mobile, f"Sri Vasavi Textiles: {title} — {message}")
        db.add(
            CustomerNotification(
                customer_id=customer_id,
                order_id=order_id,
                title=title,
                message=message,
                channel="WHATSAPP",
                delivery_status=wa_status,
                is_read=True,
            )
        )


def notify_customer_order_event(
    db: Session,
    order: CustomerOrder,
    *,
    title: str,
    message: str,
) -> None:
    notify_customer_event(
        db,
        customer_id=order.customer_id,
        title=title,
        message=message,
        order_id=order.id,
    )

