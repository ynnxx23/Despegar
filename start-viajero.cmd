@echo off
REM Despegar - Portal Ayuda al Viajero (Expo SDK 57)
REM Doble clic = npm install + npx expo start. No requiere PowerShell.
setlocal
cd /d "%~dp0apps\viajero" || (echo [ERROR] No se encontro apps\viajero & pause & exit /b 1)

where node >nul 2>nul || (echo [ERROR] Node no esta en PATH & pause & exit /b 1)
echo Node: & call node --version
echo NPM: & call npm.cmd --version

echo.
echo [1/2] Dependencias (viajero)...
if exist "node_modules\expo\AppEntry.js" (
  echo      OK: node_modules presente, salto install.
) else (
  call npm.cmd install || (echo [ERROR] npm install fallo & pause & exit /b 1)
)

echo.
echo [2/2] Iniciando Expo (viajero, puerto 8081)...
if not exist ".env" call :DETECT_IP
if not exist ".env" if defined LANIP (
  (echo EXPO_PUBLIC_API_URL=http://%LANIP%:8000/api)>".env"
  echo [.env] Creado con EXPO_PUBLIC_API_URL=http://%LANIP%:8000/api
)
if not exist ".env" (
  echo [AVISO] No se detecto IP LAN - crea apps\viajero\.env manual con EXPO_PUBLIC_API_URL=http://TU-IP:8000/api
)
if "%~1"=="" (set EXPO_ARGS=--port 8081) else (set EXPO_ARGS=%*)
call npx.cmd expo start %EXPO_ARGS% || (echo [ERROR] expo start fallo & pause & exit /b 1)
exit /b 0

:DETECT_IP
echo [.env] No existe, detectando IP LAN de esta PC (prioriza 192.168, luego 10., luego 172.16-31)...
set "LANIP="
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /R /C:"IPv4.*192\.168\."') do (
  for /f "tokens=1" %%j in ("%%i") do if not defined LANIP set "LANIP=%%j"
)
if not defined LANIP for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /R /C:"IPv4.*10\."') do (
  for /f "tokens=1" %%j in ("%%i") do if not defined LANIP set "LANIP=%%j"
)
if not defined LANIP for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /R /C:"IPv4.*172\.1[6-9]\." /C:"IPv4.*172\.2[0-9]\." /C:"IPv4.*172\.3[0-1]\."') do (
  for /f "tokens=1" %%j in ("%%i") do if not defined LANIP set "LANIP=%%j"
)
exit /b 0
