from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.auth import User

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> dict:
    """Verify API and PostgreSQL database connectivity and whether Owner setup is completed."""
    db_ok = False
    user_count = 0
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
        user_count = db.scalar(select(func.count()).select_from(User)) or 0
    except Exception as exc:
        return {
            "status": "degraded",
            "app": settings.APP_NAME,
            "database": "disconnected",
            "error": str(exc),
        }

    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database": "connected" if db_ok else "disconnected",
        "owner_initialized": user_count > 0,
    }

