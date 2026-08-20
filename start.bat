@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ================================================
echo   Bilibili Danmu Tool - One-Click Launcher
echo ================================================

REM ---- 1. locate dotnet ----
set "DOTNET_EXE="
if exist "C:\Program Files (x86)\dotnet\dotnet.exe" set "DOTNET_EXE=C:\Program Files (x86)\dotnet\dotnet.exe"
if not defined DOTNET_EXE if exist "C:\Program Files\dotnet\dotnet.exe" set "DOTNET_EXE=C:\Program Files\dotnet\dotnet.exe"
if not defined DOTNET_EXE (
    where dotnet >nul 2>nul
    if not errorlevel 1 set "DOTNET_EXE=dotnet"
)
if not defined DOTNET_EXE (
    echo [ERROR] dotnet not found. Install .NET SDK first: https://dotnet.microsoft.com/download
    pause
    exit /b 1
)
echo [1/3] dotnet: %DOTNET_EXE%

REM ---- 2. build backend ----
echo [2/3] Building LiveServer...
"%DOTNET_EXE%" build LiveServer\LiveServer.csproj -c Debug
if errorlevel 1 (
    echo [ERROR] backend build failed. See errors above.
    pause
    exit /b 1
)

REM ---- 3. start backend in a new window ----
echo Starting backend window...
start "LiveServer-Backend" cmd /k "%~dp0start-backend.bat"

REM ---- wait for port 5000 ----
echo Waiting for backend on localhost:5000 ...
set /a tries=0
:waitloop
set /a tries+=1
if !tries! gtr 40 (
    echo [WARN] backend not up after 80s, check the backend window for errors.
    goto :front
)
netstat -ano | findstr /C:":5000" | findstr /C:"LISTENING" >nul
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto :waitloop
)
echo Backend is up on localhost:5000

:front
REM ---- 4. start frontend (Electron) in a new window ----
echo [3/3] Starting frontend (Electron)...
if not exist "%~dp0danmu-ui\node_modules" (
    echo Installing frontend dependencies, this may take a few minutes...
    pushd "%~dp0danmu-ui"
    call npm install
    popd
)
start "DanmuUI-Frontend" cmd /k "set NODE_OPTIONS=&& set ELECTRON_RUN_AS_NODE=&& cd /d %~dp0danmu-ui && npm run dev"

echo ================================================
echo   Launched! In the Electron app: enter a LIVE
echo   room id (e.g. 571631) on the login page, click
echo   connect, and the top overlay will show danmu.
echo   Close the two black windows to stop.
echo ================================================
pause
