@echo off
REM Despegar - Portal Ayuda al Viajero (Expo SDK 57)
REM Doble clic = npm install + npx expo start. No requiere PowerShell.
setlocal
cd /d "%~dp0apps\viajero" || (echo [ERROR] No se encontro apps\viajero & pause & exit /b 1)

where node >nul 2>nul || (echo [ERROR] Node no esta en PATH & pause & exit /b 1)
echo Node: & call node --version
echo NPM: & call npm.cmd --version

echo.
echo [1/2] Instalando dependencias (viajero)...
call npm.cmd install || (echo [ERROR] npm install fallo & pause & exit /b 1)

echo.
echo [2/2] Iniciando Expo (viajero, puerto 8081)...
echo Usa la IP LAN de tu PC en apps\shared\api.js si pruebas en celular.
if "%~1"=="" (set EXPO_ARGS=--port 8081) else (set EXPO_ARGS=%*)
call npx.cmd expo start %EXPO_ARGS% || (echo [ERROR] expo start fallo & pause & exit /b 1)
