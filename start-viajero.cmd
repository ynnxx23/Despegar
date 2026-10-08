@echo off
REM Despegar - Portal Ayuda al Viajero (Expo SDK 57)
REM Doble clic = npm install + npx expo start. No requiere PowerShell.
REM
REM URL de la API (en este orden):
REM   1) "start-viajero.cmd local"        -> fuerza la IP LAN de esta PC (backend local).
REM   2) deploy\api-url.txt               -> API pública en Railway (https://...).
REM   3) sin argumento y sin deploy\api-url.txt -> IP LAN detectada (backend local).
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0apps\viajero" || (echo [ERROR] No se encontro apps\viajero & pause & exit /b 1)

where node >nul 2>nul || (echo [ERROR] Node no esta en PATH & pause & exit /b 1)
echo Node: & call node --version
echo NPM: & call npm.cmd --version

REM --- modo opcional: local | railway ---
set "MODE="
if /i "%~1"=="local" (set "MODE=local" & shift)
if /i "%~1"=="railway" (set "MODE=railway" & shift)

echo.
echo [1/2] Instalando dependencias (viajero)...
call npm.cmd install || (echo [ERROR] npm install fallo & pause & exit /b 1)

echo.
echo [2/2] Iniciando Expo (viajero, puerto 8081)...
set "EXPO_API_URL="
if /i "%MODE%"=="local" goto :URL_LAN
if /i "%MODE%"=="railway" goto :URL_RAILWAY
if exist ".env.railway" goto :URL_RAILWAY
goto :URL_LAN

:URL_RAILWAY
set "RAIL_URL="
if exist "%~dp0deploy\api-url.txt" (
  for /f "usebackq tokens=1 delims=" %%U in ("%~dp0deploy\api-url.txt") do set "RAIL_URL=%%U"
)
if not defined RAIL_URL (
  echo [AVISO] deploy\api-url.txt vacio o inexistente - se usa la IP LAN
  goto :URL_LAN
)
set "EXPO_API_URL=!RAIL_URL!"
goto :URL_WRITE

:URL_LAN
call :DETECT_IP
if not defined LANIP (
  echo [AVISO] No se detecto IP LAN - crea apps\viajero\.env manual con EXPO_PUBLIC_API_URL=http://TU-IP:8000/api
  goto :URL_SKIP
)
set "EXPO_API_URL=http://!LANIP!:8000/api"

:URL_WRITE
if exist ".env" (
  findstr /V /B /C:"EXPO_PUBLIC_API_URL=" ".env" >".env.tmp" 2>nul
  (echo EXPO_PUBLIC_API_URL=!EXPO_API_URL!)>>".env.tmp"
  move /y ".env.tmp" ".env" >nul
  echo [.env] EXPO_PUBLIC_API_URL=!EXPO_API_URL!
) else (
  (echo EXPO_PUBLIC_API_URL=!EXPO_API_URL!)>".env"
  echo [.env] Creado con EXPO_PUBLIC_API_URL=!EXPO_API_URL!
)

:URL_SKIP
if "%~1"=="" (set EXPO_ARGS=--port 8081) else (set EXPO_ARGS=%*)
call npx.cmd expo start %EXPO_ARGS% || (echo [ERROR] expo start fallo & pause & exit /b 1)
exit /b 0

:DETECT_IP
echo [.env] Detectando IP LAN de esta PC (prioriza 192.168, luego 10., luego 172.16-31)...
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
