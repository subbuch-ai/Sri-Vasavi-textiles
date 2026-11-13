@echo off
title Sri Vasavi Textiles - Customer Shopping Website (Port 5174)
cd /d "%~dp0customer-website"
echo ========================================================
echo  Starting Sri Vasavi Textiles Customer Website...
echo  Local URL:   http://localhost:5174
echo  Network URL: http://192.168.0.93:5174
echo ========================================================
npm run dev -- --host 0.0.0.0 --port 5174
pause
