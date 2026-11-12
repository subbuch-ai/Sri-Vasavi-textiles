# Sri Vasavi Textiles — Wholesale & Retail Management ERP

A complete, production-ready Business Management ERP web application tailored for **Sri Vasavi Textiles** (Indian textile wholesale & retail trading).

## Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Axios, React Router, Recharts, React Hook Form
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, PyJWT, bcrypt, ReportLab (PDF), OpenPyXL (Excel)
- **Database**: PostgreSQL (decimal monetary precision, row-level locking on stock & document numbering, full audit logging)

## Project Structure
```text
My Business Project/
├── backend/
│   ├── alembic/               # Database migration environment & versions
│   ├── app/
│   │   ├── api/v1/            # Versioned REST API routers & RBAC dependencies
│   │   ├── core/              # Settings, DB engine, JWT security, RBAC registry
│   │   ├── models/            # Normalized SQLAlchemy 2.0 ORM models (29 tables)
│   │   ├── schemas/           # Pydantic validation schemas
│   │   └── services/          # Business workflows, accounting, exports, seeding
│   ├── scripts/               # DB init & pg_dump backup utilities
│   ├── tests/                 # Pytest API & business logic test suite
│   ├── .env.example
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/        # Reusable layout, UI, tables, modals
    │   ├── context/           # Auth & permission context
    │   ├── pages/             # ERP modules (Dashboard, Purchases, Sales, etc.)
    │   ├── services/          # Axios API clients with JWT auto-refresh
    │   └── types/             # TypeScript domain contracts
    ├── .env.example
    └── package.json
```

## Setup & Execution

### 1. Database (PostgreSQL)
Ensure PostgreSQL is running on port `5432` and create the databases:
```sql
CREATE DATABASE sri_vasavi_textiles;
CREATE DATABASE sri_vasavi_textiles_test; -- for automated pytest suite
```
If using the local user-space PostgreSQL 17 setup (`%USERPROFILE%\.local\pgsql`):
```powershell
& "$env:USERPROFILE\.local\pgsql\bin\postgres.exe" -D "$env:USERPROFILE\.local\pgsql\data" -p 5432
```
Copy `backend/.env.example` to `backend/.env` and update `DATABASE_URL` and `JWT_SECRET_KEY`.

### 2. Backend Setup
```powershell
cd backend
uv venv .venv --python 3.12
.venv\Scripts\activate
uv pip install -r requirements.txt
alembic upgrade head
python scripts/init_db.py
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```

### 4. Automated Integration & RBAC Tests
```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -v
```

### 5. Database Backup
Run `python backend/scripts/backup_db.py` or trigger a backup directly from **Settings** (Owner-only).

Open `http://localhost:5173` in your browser. First-time launch opens `/setup-owner` to register the Business Owner account.

