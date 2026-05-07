@echo off
REM Setup script for Hoops Hype Studio AI Analysis (Windows)
REM This script helps configure Modal and Upstash for the video editing app

echo ================================================
echo Hoops Hype Studio - AI Analysis Setup
echo ================================================
echo.

REM Step 1: Check/Install Modal CLI
echo Step 1: Checking Modal CLI...
where modal >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Modal CLI not found. Installing...
    pip install modal
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Modal CLI installed
    ) else (
        echo [ERROR] Failed to install Modal CLI
        pause
        exit /b 1
    )
) else (
    echo [OK] Modal CLI already installed
)

REM Authenticate with Modal
echo.
echo Please authenticate with Modal if not already done.
echo Running: modal token new
modal token new

echo.

REM Step 2: Provide instructions for Upstash
echo ================================================
echo Step 2: Upstash Storage Setup
echo ================================================
echo.
echo Please get your Upstash storage credentials from:
echo https://console.upstash.com
echo.
echo You will need:
echo   - Bucket Name
echo   - Access Key ID
echo   - Secret Access Key
echo   - Endpoint URL (e.g., https://xxx.upstash.io)
echo.
echo Press any key when you have these credentials ready...
pause >nul

echo.
echo Opening browser to get credentials...
echo.
echo Please provide your Upstash credentials below:
echo.

set /p STORAGE_BUCKET="Upstash Bucket Name: "
set /p STORAGE_ACCESS_KEY="Upstash Access Key ID: "
set /p STORAGE_SECRET_KEY="Upstash Secret Access Key: "
set /p STORAGE_ENDPOINT="Upstash Endpoint URL: "
set STORAGE_REGION=us-east-1

echo.
echo [OK] Storage credentials collected
echo.

REM Step 3: Generate GPU Worker Token
echo Step 3: Generating GPU Worker Token...
REM Generate a random token (Windows doesn't have openssl by default, so use PowerShell)
for /f "delims=" %%i in ('powershell -command "$bytes = New-Object byte[] 32; (New-Object Random).NextBytes($bytes); -join ($bytes | ForEach-Object {$_.ToString('x2')})"') do set GPU_WORKER_TOKEN=%%i

echo [OK] Generated secure token
echo.

REM Step 4: Create Modal Secret
echo Step 4: Creating Modal secret 'hoops-hype-studio'...
modal secret create hoops-hype-studio GPU_WORKER_TOKEN="%GPU_WORKER_TOKEN%" STORAGE_BUCKET="%STORAGE_BUCKET%" STORAGE_ACCESS_KEY="%STORAGE_ACCESS_KEY%" STORAGE_SECRET_KEY="%STORAGE_SECRET_KEY%" STORAGE_REGION="%STORAGE_REGION%" STORAGE_ENDPOINT="%STORAGE_ENDPOINT%"

if %ERRORLEVEL% EQU 0 (
    echo [OK] Modal secret created successfully
) else (
    echo [WARNING] Failed to create Modal secret. It may already exist.
    echo Trying to update instead...
    modal secret delete hoops-hype-studio -y
    modal secret create hoops-hype-studio GPU_WORKER_TOKEN="%GPU_WORKER_TOKEN%" STORAGE_BUCKET="%STORAGE_BUCKET%" STORAGE_ACCESS_KEY="%STORAGE_ACCESS_KEY%" STORAGE_SECRET_KEY="%STORAGE_SECRET_KEY%" STORAGE_REGION="%STORAGE_REGION%" STORAGE_ENDPOINT="%STORAGE_ENDPOINT%"
)

echo.

REM Step 5: Update .env file
echo Step 5: Updating .env file...
(
echo # Storage (Upstash^)
echo STORAGE_BUCKET=%STORAGE_BUCKET%
echo STORAGE_REGION=%STORAGE_REGION%
echo STORAGE_ACCESS_KEY=%STORAGE_ACCESS_KEY%
echo STORAGE_SECRET_KEY=%STORAGE_SECRET_KEY%
echo STORAGE_ENDPOINT=%STORAGE_ENDPOINT%
echo.
echo # GPU worker (Modal^) bridge
echo GPU_WORKER_BASE_URL=https://hoops-hype-studio-worker--fastapi-app.modal.run
echo GPU_WORKER_TOKEN=%GPU_WORKER_TOKEN%
echo.
echo # Music provider (Pixabay^)
echo MUSIC_API_KEY=
echo MUSIC_API_BASE_URL=https://pixabay.com/api
echo.
echo # Redis (Upstash^) for job/progress + rate limiting
echo UPSTASH_REDIS_REST_URL=
echo UPSTASH_REDIS_REST_TOKEN=
echo.
echo # Observability
echo LOGTAIL_TOKEN=
echo SENTRY_DSN=
echo.
echo # Edge security
echo EDGE_HMAC_SECRET=
echo RATE_LIMIT_TOKENS=120
echo RATE_LIMIT_WINDOW_SEC=60
echo.
echo # Retention policy (days^)
echo RETENTION_DAYS=7
echo.
echo WEB_ORIGIN=http://localhost:5173
) > .env

echo [OK] .env file updated
echo.

REM Step 6: Deploy Modal GPU Worker
echo Step 6: Deploying Modal GPU worker...
modal deploy workers/modal/modal_app.py

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] Modal worker deployed successfully
) else (
    echo.
    echo [ERROR] Modal deployment failed
    echo Please check the error messages above
)

echo.

REM Step 7: Sync to Netlify
echo Step 7: Syncing environment variables to Netlify...
where netlify >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    netlify env:set GPU_WORKER_TOKEN "%GPU_WORKER_TOKEN%"
    netlify env:set STORAGE_BUCKET "%STORAGE_BUCKET%"
    netlify env:set STORAGE_ACCESS_KEY "%STORAGE_ACCESS_KEY%"
    netlify env:set STORAGE_SECRET_KEY "%STORAGE_SECRET_KEY%"
    netlify env:set STORAGE_REGION "%STORAGE_REGION%"
    netlify env:set STORAGE_ENDPOINT "%STORAGE_ENDPOINT%"
    netlify env:set GPU_WORKER_BASE_URL "https://hoops-hype-studio-worker--fastapi-app.modal.run"

    echo [OK] Environment variables synced to Netlify
) else (
    echo [WARNING] Netlify CLI not found
    echo Please set these environment variables manually in Netlify dashboard:
    echo.
    echo   GPU_WORKER_TOKEN=%GPU_WORKER_TOKEN%
    echo   STORAGE_BUCKET=%STORAGE_BUCKET%
    echo   STORAGE_ACCESS_KEY=%STORAGE_ACCESS_KEY%
    echo   STORAGE_SECRET_KEY=%STORAGE_SECRET_KEY%
    echo   STORAGE_REGION=%STORAGE_REGION%
    echo   STORAGE_ENDPOINT=%STORAGE_ENDPOINT%
    echo   GPU_WORKER_BASE_URL=https://hoops-hype-studio-worker--fastapi-app.modal.run
)

echo.
echo ================================================
echo Setup Complete!
echo ================================================
echo.
echo Next steps:
echo 1. Test the AI analysis by dropping a video in your app
echo 2. Check browser console for any errors
echo 3. View Modal logs: modal logs hoops-hype-studio-worker
echo 4. View Netlify function logs: netlify logs:function
echo.
echo Credentials saved to .env file
echo.
pause
