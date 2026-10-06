@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js 18+ and try again.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo Installing Vibe dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

start "Vibe Server" /min node server.js
set attempts=0
:wait_for_server
curl.exe --silent --fail http://localhost:3000/api/health >nul 2>nul
if not errorlevel 1 goto server_ready
set /a attempts+=1
if %attempts% geq 30 goto server_failed
timeout /t 1 /nobreak >nul
goto wait_for_server

:server_ready
start "" http://localhost:3000/
exit /b 0

:server_failed
echo The Vibe server did not start. Check the Vibe Server window for errors.
pause
exit /b 1
