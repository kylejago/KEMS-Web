@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 22 or newer is required.
  echo Install Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 22 (
  echo.
  echo Node.js 22 or newer is required. Installed major version: %NODE_MAJOR%
  echo Update Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4173"
echo Starting KEMS Alpha2 Web Companion...
echo Close this window to stop the website.
echo.
node server.mjs
pause
