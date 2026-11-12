from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.organization import AuditLog


def record_audit_log(
    db: Session,
    *,
    user_id: Optional[int],
    username: Optional[str],
    action: str,
    module: str,
    description: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[Any] = None,
    old_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    """Append an immutable entry to the audit_logs table within the active transaction."""
    log = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        module=module,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        description=description,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
    )
    db.add(log)
    return log

