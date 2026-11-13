from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.exceptions import ERPException
from app.services.seed_service import seed_initial_master_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure upload directories exist and seed structural master records when DB is ready."""
    for sub in ("products", "expenses", "branding"):
        Path(settings.upload_path / sub).mkdir(parents=True, exist_ok=True)
    settings.backup_path.mkdir(parents=True, exist_ok=True)

    try:
        with SessionLocal() as db:
            seed_initial_master_data(db)
    except Exception:
        # Allows startup before initial Alembic migration runs; health check reports DB state.
        pass

    yield


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        description="Complete Wholesale & Retail Textile Trading ERP System for Sri Vasavi Textiles.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @app.exception_handler(ERPException)
    async def erp_exception_handler(request: Request, exc: ERPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "code": exc.code,
                "detail": exc.message,
                "details": exc.details,
            },
        )

    settings.upload_path.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(settings.upload_path)), name="uploads")

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", tags=["Root"])
    def root() -> dict:
        return {
            "app": settings.APP_NAME,
            "docs": "/docs",
            "health": f"{settings.API_V1_PREFIX}/health",
        }

    return app


app = create_application()

