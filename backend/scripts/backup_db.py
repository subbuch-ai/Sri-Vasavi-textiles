"""Database backup utility using pg_dump."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.backup_service import create_database_backup


def run_backup() -> Path:
    info = create_database_backup()
    out_file = Path(str(info["path"]))
    print(f"[OK] Database backup saved to: {out_file} ({info['size_bytes']} bytes)")
    return out_file


if __name__ == "__main__":
    run_backup()
