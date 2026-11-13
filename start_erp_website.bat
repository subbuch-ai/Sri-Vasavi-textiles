@echo off
title Sri Vasavi Textiles - ERP Portal (Port 5173)
cd /d "%~dp0frontend"
echo ========================================================
echo  Starting Sri Vasavi Textiles ERP Management Portal...
echo  Local URL:   http://localhost:5173
echo  Network URL: http://192.168.0.93:5173
echo ========================================================
npm run dev -- --host 0.0.0.0 --port 5173
pause
