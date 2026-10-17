@echo off
REM Despegar - apaga la API (y la base) en Railway. Doble clic = pausar el deploy.
REM
REM Que hace:
REM   1. HEALTHCHECK_ENABLED=0 (el healthcheck deja de generar trafico).
REM   2. railway down en api y en Postgres: 0 CPU / 0 RAM facturados.
REM   3. Los datos quedan intactos en el volumen postgres-volume.
REM
REM Para volver a prenderla: start-railway.cmd
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0" || (echo [ERROR] No se pudo entrar a la carpeta del proyecto & pause & exit /b 1)

echo ==========================================================
echo  Despegar - Apagar la API en Railway
echo ==========================================================
echo.
echo Los datos se conservan en el volumen (no se borra nada).
echo.

set "RAILWAY="
where railway.cmd >nul 2>&1 && set "RAILWAY=railway.cmd"
if not defined RAILWAY if exist "%APPDATA%\npm\railway.cmd" set "RAILWAY=%APPDATA%\npm\railway.cmd"
if not defined RAILWAY (
  echo [ERROR] Falta la CLI de Railway.
  echo         Instalala con:  npm install -g @railway/cli
  pause
  exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%~dp0deploy\railway-pause.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo pausar el proyecto. Mira los mensajes de arriba.
  pause
  exit /b 1
)

echo.
echo [OK] Proyecto pausado: 0 CPU / 0 RAM facturados.
echo     Para volver: start-railway.cmd
echo.
pause
exit /b 0
