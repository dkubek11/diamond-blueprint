@echo off
echo ==========================================
echo   Diamond Blueprint - Starting Up
echo ==========================================
echo.

echo [1/3] Updating data to today...
C:\Users\dylan\AppData\Local\Programs\Python\Python313\python.exe C:\Users\dylan\projects\pitch-sequencing\run_update.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: Data update had an issue - starting app anyway with existing data.
    echo.
    timeout /t 3 /nobreak >nul
)

echo.
echo [2/3] Starting backend server...
start "Diamond Blueprint - Backend" cmd /k "cd /d C:\Users\dylan\projects\pitch-sequencing\backend && C:\Users\dylan\AppData\Local\Programs\Python\Python313\python.exe -m uvicorn app.main:app"

echo Waiting for backend to start...
timeout /t 8 /nobreak >nul

echo [3/3] Starting frontend...
start "Diamond Blueprint - Frontend" /min cmd /c "cd /d C:\Users\dylan\projects\pitch-sequencing\frontend && npm run dev"

echo Waiting for frontend to start...
timeout /t 10 /nobreak >nul

start chrome http://localhost:5173

echo.
echo Diamond Blueprint is running!
echo Close this window whenever you want.
timeout /t 5 /nobreak >nul
