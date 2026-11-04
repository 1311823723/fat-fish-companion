@echo off
setlocal
cd /d "%~dp0"
node scripts/doctor.mjs
if errorlevel 1 exit /b 1
node src/server.mjs
