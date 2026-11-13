@echo off
title Sri Vasavi Textiles - Launch All Platforms
cd /d "%~dp0"
echo ========================================================
echo  Launching Sri Vasavi Textiles Full Platform Suite
echo ========================================================
echo 1. Starting FastAPI Backend Server on port 8000...
start "SVT Backend API (8000)" cmd /c "cd /d "%~dp0backend" && .venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000"

timeout /t 2 /nobreak >nul

echo 2. Starting ERP Portal on port 5173...
start "SVT ERP Portal (5173)" cmd /c "cd /d "%~dp0frontend" && npm run dev -- --host 0.0.0.0 --port 5173"

echo 3. Starting Customer Shopping Website on port 5174...
start "SVT Customer Website (5174)" cmd /c "cd /d "%~dp0customer-website" && npm run dev -- --host 0.0.0.0 --port 5174"

echo ========================================================
echo  All 3 services launched on Local and Network (Wi-Fi)!
echo.
echo  Access from THIS computer:
echo   - ERP Website:       http://localhost:5173
echo   - Customer Website:  http://localhost:5174
echo   - Backend API:       http://localhost:8000
echo.
echo  Access from OTHER computers / laptops / phones on Wi-Fi:
echo   - ERP Website:       http://192.168.0.93:5173
echo   - Customer Website:  http://192.168.0.93:5174
echo ========================================================
timeout /t 8
