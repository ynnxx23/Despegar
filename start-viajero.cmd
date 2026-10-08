@echo off
REM Despegar - Portal Ayuda al Viajero (Expo SDK 57)
REM Doble clic = npm install + npx expo start. No requiere PowerShell.
REM
REM URL de la API:
REM   "start-viajero.cmd local"        -> fuerza la IP LAN de esta PC (backend local).
REM   "start-viajero.cmd railway"      -> deploy\api-url.txt (API publica en Railway).
REM   sin argumento                    -> deploy\api-url.txt si existe; si no, IP LAN.
REM
REM Nota: se usan subrutinas (call :label) en vez de goto dentro de bloques if,
REM porque en batch el goto dentro de un bloque if puede reejecutar el bloque.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0apps\viajero" || (echo [ERROR] No se encontro apps\viajero & pause & exit /b 1)

where node >nul 2>nul || (echo [ERROR] Node no esta en PATH & pause & exit /b 1)
echo Node: & call node --version
echo NPM: & call npm.cmd --version

REM --- modo opcional (primer argumento) y resto de argumentos para expo ---
set "MODE=%~1"
if /i "%MODE%"=="local" goto :MODE_CONSUMED
if /i "%MODE%"=="railway" goto :MODE_CONSUMED
set "MODE="
goto :COLLECT_ARGS
:MODE_CONSUMED
shift
:COLLECT_ARGS
set "EXPO_ARGS="
:ARGS_LOOP
if "%~1"=="" goto :ARGS_END
if not defined EXPO_ARGS (set "EXPO_ARGS=%~1") else (set "EXPO_ARGS=!EXPO_ARGS! %~1")
shift
goto :ARGS_LOOP
:ARGS_END

echo.
echo [1/2] Instalando dependencias (viajero)...
call npm.cmd install || (echo [ERROR] npm install fallo & pause & exit /b 1)

echo.
echo [2/2] Iniciando Expo (viajero, puerto 8081)...
call :PICK_URL
if not defined EXPO_API_URL goto :START_EXPO
if exist ".env" (
  findstr /V /B /C:"EXPO_PUBLIC_API_URL=" ".env" >".env.tmp" 2>nul
  (echo EXPO_PUBLIC_API_URL=!EXPO_API_URL!)>>".env.tmp"
  move /y ".env.tmp" ".env" >nul
) else (
  (echo EXPO_PUBLIC_API_URL=!EXPO_API_URL!)>".env"
)
echo [.env] EXPO_PUBLIC_API_URL=!EXPO_API_URL!

:START_EXPO
if not defined EXPO_ARGS set "EXPO_ARGS=--port 8081"
call npx.cmd expo start %EXPO_ARGS% || (echo [ERROR] expo start fallo & pause & exit /b 1)
exit /b 0

REM --- elige la URL de la API ---
:PICK_URL
set "EXPO_API_URL="
if /i "%MODE%"=="local" goto :PICK_LAN
if /i "%MODE%"=="railway" goto :PICK_RAILWAY
if exist "%~dp0deploy\api-url.txt" goto :PICK_RAILWAY
goto :PICK_LAN

:PICK_RAILWAY
set "RAIL_URL="
for /f "usebackq tokens=1 delims=" %%U in ("%~dp0deploy\api-url.txt") do set "RAIL_URL=%%U"
if defined RAIL_URL goto :PICK_RAIL_OK
echo [AVISO] deploy\api-url.txt vacio o inexistente - se usa la IP LAN
goto :PICK_LAN
:PICK_RAIL_OK
set "EXPO_API_URL=!RAIL_URL!"
goto :PICK_END

:PICK_LAN
call :DETECT_IP
if defined LANIP goto :PICK_LAN_OK
echo [AVISO] No se detecto IP LAN - crea apps\viajero\.env manual con EXPO_PUBLIC_API_URL=http://TU-IP:8000/api
goto :PICK_END
:PICK_LAN_OK
set "EXPO_API_URL=http://!LANIP!:8000/api"
:PICK_END
exit /b 0

REM --- IP LAN de esta PC ---
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
