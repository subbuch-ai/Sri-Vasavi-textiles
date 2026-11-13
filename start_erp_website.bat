@echo off
title Sri Vasavi Textiles - ERP Portal (Port 5173)
cd /d "%~dp0frontend"
echo ========================================================
echo  Starting Sri Vasavi Textiles ERP Management Portal...
echo  URL: http://localhost:5173
echo ========================================================
npm run dev -- --host 127.0.0.1 --port 5173
pause

