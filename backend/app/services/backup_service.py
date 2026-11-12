import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict
from urllib.parse import urlparse

from app.core.config import settings
from app.core.exceptions import ValidationError


def _find_pg_dump() -> str:
    found = shutil.which("pg_dump")
    if found:
        return found

    candidates = [
        Path.home() / ".local" / "pgsql" / "bin" / "pg_dump.exe",
        Path("C:/Program Files/PostgreSQL/17/bin/pg_dump.exe"),
        Path("C:/Program Files/PostgreSQL/16/bin/pg_dump.exe"),
        Path("C:/Program Files/PostgreSQL/15/bin/pg_dump.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    raise ValidationError(
        "pg_dump executable was not found on PATH or standard PostgreSQL directories."
    )


def create_database_backup() -> Dict[str, str | int]:
    """Run pg_dump into BACKUP_DIR and return backup metadata."""
    pg_dump_bin = _find_pg_dump()
    settings.backup_path.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = settings.backup_path / f"svt_erp_backup_{timestamp}.sql"

    parsed = urlparse(settings.DATABASE_URL.replace("postgresql+psycopg://", "postgresql://"))
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = parsed.password

    cmd = [
        pg_dump_bin,
        "-h",
        parsed.hostname or "localhost",
        "-p",
        str(parsed.port or 5432),
        "-U",
        parsed.username or "postgres",
        "-F",
        "p",
        "-f",
        str(out_file),
        parsed.path.lstrip("/"),
    ]
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise ValidationError(f"Database backup failed: {result.stderr.strip() or 'pg_dump error'}")

    return {
        "filename": out_file.name,
        "path": str(out_file),
        "size_bytes": out_file.stat().st_size,
    }

