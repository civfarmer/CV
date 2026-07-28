@echo off
title FRIS Browser Build
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No Node.js found. For a TRULY no-install preview, just double-click:
  echo        FRIS-Standalone.html
  echo   Otherwise install Node.js from https://nodejs.org and run this again.
  echo.
  start "" "FRIS-Standalone.html"
  exit /b 0
)
echo Starting a local preview server... your browser will open automatically.
node serve.mjs
pause
