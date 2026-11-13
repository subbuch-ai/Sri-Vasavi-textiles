from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "Sri Vasavi Textiles ERP"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/sri_vasavi_textiles"

    JWT_SECRET_KEY: str = "dev-only-secret-change-in-production-32-plus-characters"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: str = (
        "https://www.srivasavitextiles.com,https://srivasavitextiles.com,"
        "https://erp.srivasavitextiles.com,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:3000,http://127.0.0.1:3000"
    )

    UPLOAD_DIR: str = "uploads"
    BACKUP_DIR: str = "backups"
    MAX_UPLOAD_SIZE_MB: int = 10

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def upload_path(self) -> Path:
        path = Path(self.UPLOAD_DIR)
        if not path.is_absolute():
            path = BASE_DIR / path
        return path

    @property
    def backup_path(self) -> Path:
        path = Path(self.BACKUP_DIR)
        if not path.is_absolute():
            path = BASE_DIR / path
        return path

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        """
        Normalize standard PostgreSQL URLs (e.g. from Supabase / AWS RDS)
        like postgres:// or postgresql:// to postgresql+psycopg://
        so SQLAlchemy 2.0 with psycopg3 connects cleanly.
        """
        val = value.strip()
        if val.startswith("postgres://"):
            return "postgresql+psycopg://" + val[len("postgres://"):]
        if val.startswith("postgresql://") and not val.startswith("postgresql+"):
            return "postgresql+psycopg://" + val[len("postgresql://"):]
        return val

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value.strip()) < 24:
            raise ValueError("JWT_SECRET_KEY must be at least 24 characters long.")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

