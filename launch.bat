@echo off
chcp 65001 >nul
title RAW Focus Launcher
echo.
echo ========================================
echo          RAW Focus Launcher
echo ========================================
echo.

REM Check if screentime tracker EXE exists
if exist "screentime-tracker.exe" (
    echo [INFO] Found screentime-tracker.exe
    echo.
    choice /C YN /M "Start standalone screentime tracker in background"
    if %ERRORLEVEL% EQU 1 (
        echo [OK] Launching screentime tracker...
        start /B screentime-tracker.exe
    )
    echo.
)

REM Check if Node.js is available
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is NOT installed! Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js is installed

REM Check if npm is available
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is NOT available!
    echo.
    pause
    exit /b 1
)
echo [OK] npm is available

REM Check if node_modules exist
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies!
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
)

REM Check if .env exists
if not exist ".env" (
    echo [INFO] Creating .env file from default configuration...
    (
        echo # AI Provider Configuration
        echo # Options: 'ollama' for local model, 'external' for cloud API
        echo AI_PROVIDER=ollama
        echo.
        echo # Ollama Configuration
        echo OLLAMA_BASE_URL=http://127.0.0.1:11434
        echo OLLAMA_MODEL=mistral:7b-instruct-q4_K_M
        echo.
        echo # External Cloud API Configuration (if using AI_PROVIDER=external)
        echo # EXTERNAL_API_URL=https://api.openai.com/v1/chat/completions
        echo # EXTERNAL_API_KEY=your-api-key-here
        echo # EXTERNAL_MODEL=gpt-4o
        echo.
        echo # ActivityWatch Local Server Configuration
        echo ACTIVITYWATCH_BASE_URL=http://localhost:5600
        echo.
        echo # Vite Dev Server Configuration
        echo VITE_DEV_SERVER_URL=http://localhost:5173
    ) > .env
    echo [OK] .env file created
)

REM Check Ollama status
echo.
echo Checking Ollama...
where ollama >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Ollama is NOT installed! Local AI will not be available.
    echo           Download Ollama from https://ollama.com/ if you want local AI.
) else (
    curl -s -o nul -w "%%{http_code}" http://127.0.0.1:11434/api/tags >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo [WARNING] Ollama is installed but NOT running! Local AI will not be available.
        echo           Start Ollama first if you want local AI.
    ) else (
        echo [OK] Ollama is installed and running
    )
)

REM Check ActivityWatch status
echo.
echo Checking ActivityWatch...
curl -s -o nul -w "%%{http_code}" http://localhost:5600/api/0/ >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] ActivityWatch is not running - using built-in screentime tracker
) else (
    echo [OK] ActivityWatch is running
)

echo.
echo ========================================
echo Starting RAW Focus...
echo ========================================
echo.

REM Launch the Electron app
call npm start

pause