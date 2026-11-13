# Sri Vasavi Textiles — Cloud Deployment Guide
## Vercel (Frontends) + AWS (FastAPI Backend) + Supabase (PostgreSQL Database)

This guide walks you through deploying the complete Sri Vasavi Textiles platform across **Vercel**, **AWS**, and **Supabase**.

```
                           ┌────────────────────────┐
                           │      SUPABASE          │
                           │ (PostgreSQL Database)  │
                           └───────────▲────────────┘
                                       │ DATABASE_URL
                                       │ (port 6543 / 5432)
                           ┌───────────┴────────────┐
                           │       AWS BACKEND      │
                           │  (FastAPI + Uvicorn)   │
                           │   App Runner / EC2     │
                           └───────▲────────▲───────┘
                                   │        │
               REST APIs / JSON    │        │ REST APIs / JSON
            (VITE_API_BASE_URL)    │        │ (VITE_API_BASE_URL)
                                   │        │
            ┌──────────────────────┴──┐  ┌──┴──────────────────────┐
            │         VERCEL          │  │         VERCEL          │
            │ Customer Shopping Site  │  │   ERP Management Portal │
            │   (customer-website/)   │  │       (frontend/)       │
            └─────────────────────────┘  └─────────────────────────┘
```

---

## Part 1: Setup Supabase Database

1. Sign up / Log in to [https://supabase.com](https://supabase.com).
2. Click **New Project**:
   - **Name**: `sri-vasavi-textiles`
   - **Database Password**: Set a strong password (save it safely).
   - **Region**: Choose `South Asia (Mumbai) - ap-south-1` (or closest to your customers).
3. Once the project is created:
   - Go to **Project Settings** (gear icon) $\rightarrow$ **Database**.
   - Under **Connection string**, select **URI**.
   - Copy the URI. It will look like:
     ```text
     postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
     ```
     *(The backend automatically accepts both `postgresql://` and `postgres://` and connects using psycopg3).*

---

## Part 2: Deploy Backend to AWS (AWS App Runner / EC2)

### Option A: AWS App Runner (Recommended — Fully Managed & Zero DevOps)
AWS App Runner connects directly to your GitHub repository and runs containers automatically with built-in HTTPS:

1. Log in to the [AWS Management Console](https://console.aws.amazon.com).
2. Search for **AWS App Runner** and click **Create service**.
3. **Source and deployment**:
   - **Repository type**: Source code repository.
   - Connect your GitHub account and select repository: `subbuch-ai/Sri-Vasavi-textiles`.
   - **Branch**: `main`.
   - **Deployment trigger**: *Automatic* (deploys on every git push).
4. **Build settings**:
   - **Configuration file**: Select *Configure all settings here*.
   - **Runtime**: `Python 3` (or choose *Container image* using the provided `backend/Dockerfile`).
   - If using Python runtime:
     - **Build command**: `cd backend && pip install -r requirements.txt && alembic upgrade head`
     - **Start command**: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000`
     - **Port**: `8000`
5. **Environment variables**:
   Add the following:
   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `DATABASE_URL` | *Your Supabase connection URI from Part 1* | Supabase connection string |
   | `APP_NAME` | `Sri Vasavi Textiles ERP` | Business title |
   | `APP_ENV` | `production` | Production mode |
   | `DEBUG` | `false` | Disable debug flags in prod |
   | `JWT_SECRET_KEY` | *(Generate a 32+ character random string)* | Auth signing key |
   | `CORS_ORIGINS` | `https://*.vercel.app,http://localhost:5173,http://localhost:5174` | Allowed origins |
6. Click **Next** $\rightarrow$ **Create & Deploy**.
7. In ~3 minutes, App Runner will deploy your backend and provide a public HTTPS URL:
   - Example: `https://xxxxxx.ap-south-1.awsapprunner.com`
   - Your API endpoints are at: `https://xxxxxx.ap-south-1.awsapprunner.com/api/v1`

---

## Part 3: Deploy Frontends to Vercel

You will create **two projects** in Vercel from the same GitHub repository:

### Project 1: Customer Shopping Website
1. Log in to [https://vercel.com](https://vercel.com).
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import your GitHub repository: `subbuch-ai/Sri-Vasavi-textiles`.
4. Configure Project:
   - **Project Name**: `sri-vasavi-textiles-shop`
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select **`customer-website`**.
   - **Build & Development Settings**: Keep defaults (`npm run build`, output directory `dist`).
5. **Environment Variables**:
   Add:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: `https://xxxxxx.ap-south-1.awsapprunner.com/api/v1` *(Your AWS backend URL from Part 2)*
6. Click **Deploy**.
   - Your customer shopping website is live at `https://sri-vasavi-textiles-shop.vercel.app`!
   - You can add your custom domain (e.g. `www.srivasavitextiles.com`).

---

### Project 2: ERP Management Portal
1. In Vercel, click **Add New...** $\rightarrow$ **Project**.
2. Import the same repository: `subbuch-ai/Sri-Vasavi-textiles`.
3. Configure Project:
   - **Project Name**: `sri-vasavi-textiles-erp`
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select **`frontend`**.
   - **Build & Development Settings**: Keep defaults (`npm run build`, output directory `dist`).
5. **Environment Variables**:
   Add:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: `https://xxxxxx.ap-south-1.awsapprunner.com/api/v1` *(Your AWS backend URL from Part 2)*
6. Click **Deploy**.
   - Your ERP portal is live at `https://sri-vasavi-textiles-erp.vercel.app`!
   - You can add your staff custom domain (e.g. `erp.srivasavitextiles.com`).

---

## Part 4: Verification & Smoke Test

1. **Database**: In Supabase Table Editor, verify tables (`products`, `customers`, `sales`, `customer_orders`, `wholesale_applications`, etc.) are auto-created by Alembic.
2. **Backend**: Open `https://your-aws-apprunner-url.com/docs` to see interactive FastAPI Swagger API documentation.
3. **ERP Portal**: Open your Vercel ERP URL, log in with Owner credentials:
   - Mobile: `9876543210`
   - Password: `Password@123`
4. **Customer Store**: Open your Vercel Customer URL, browse products, add to cart, and place a test order. Verify the order appears instantly in the ERP Orders module.
