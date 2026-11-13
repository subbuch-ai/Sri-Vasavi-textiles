@echo off
title Sri Vasavi Textiles - Customer Shopping Website (Port 5174)
cd /d "%~dp0customer-website"
echo ========================================================
echo  Starting Sri Vasavi Textiles Customer Website...
echo  URL: http://localhost:5174
echo ========================================================
npm run dev -- --host 127.0.0.1 --port 5174
pause

