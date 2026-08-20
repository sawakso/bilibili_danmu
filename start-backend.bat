@echo off
cd /d "%~dp0"

set "DOTNET_EXE="
if exist "C:\Program Files (x86)\dotnet\dotnet.exe" set "DOTNET_EXE=C:\Program Files (x86)\dotnet\dotnet.exe"
if not defined DOTNET_EXE if exist "C:\Program Files\dotnet\dotnet.exe" set "DOTNET_EXE=C:\Program Files\dotnet\dotnet.exe"
if not defined DOTNET_EXE set "DOTNET_EXE=dotnet"

set DOTNET_ROLL_FORWARD=Major
echo ============================================
echo  LiveServer backend starting...
echo  Listening on: http://localhost:5000
echo  Press Ctrl+C to stop
echo ============================================
"%DOTNET_EXE%" LiveServer\bin\Debug\net6.0\LiveServer.dll --urls=http://localhost:5000
pause
