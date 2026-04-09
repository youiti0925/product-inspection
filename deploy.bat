@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   Product Inspection App - Deploy Tool
echo ============================================
echo.

echo [1/3] Checking Firebase login...
call npx firebase projects:list >nul 2>&1
if errorlevel 1 (
    echo Browser will open. Please login with Google.
    call npx firebase login
    if errorlevel 1 (
        echo ERROR: Login failed.
        pause
        exit /b 1
    )
)
echo Login OK.
echo.

echo [2/3] Building app...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)
echo Build OK.
echo.

echo [3/3] Deploying to Firebase...
call npx firebase deploy --only hosting
if errorlevel 1 (
    echo ERROR: Deploy failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   DONE! Access your app at:
echo   https://inspection-time-c4fd3.web.app
echo ============================================
pause
