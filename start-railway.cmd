@echo off
REM Despegar - prende la API (y la base) en Railway. Doble clic = resumir el deploy.
REM
REM Que hace:
REM   1. Verifica que este la CLI de Railway (npm i -g @railway/cli) y que el
REM      proyecto "despegar-api" este vinculado en esta PC (railway link).
REM   2. Levanta PostgreSQL y la API (deploy\railway-resume.ps1) y espera el health.
REM   3. Muestra la URL publica para abrirla en el celu.
REM
REM Para apagarla de nuevo: stop-railway.cmd
REM
REM Nota: se usan subrutinas (call :label) en vez de goto dentro de bloques if,
REM porque en batch el goto dentro de un bloque if puede reejecutar el bloque.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0" || (echo [ERROR] No se pudo entrar a la carpeta del proyecto & pause & exit /b 1)

echo ==========================================================
echo  Despegar - Encender la API en Railway
echo ==========================================================
echo.

REM --- 1. CLI de Railway ---
set "RAILWAY="
where railway.cmd >nul 2>nul && set "RAILWAY=railway.cmd"
if not defined RAILWAY if exist "%APPDATA%\npm\railway.cmd" set "RAILWAY=%APPDATA%\npm\railway.cmd"
if not defined RAILWAY (
  echo [ERROR] Falta la CLI de Railway.
  echo         Instalala con:  npm install -g @railway/cli
  pause
  exit /b 1
)
echo [i] CLI: !RAILWAY!

REM --- 2. Vinculo al proyecto ---
call %RAILWAY% status >nul 2>&1
if errorlevel 1 (
  echo.
  echo [AVISO] Esta PC no tiene vinculado el proyecto de Railway.
  echo         Ejecuta una vez:  railway link
  echo         y elegi el proyecto "despegar-api".
  pause
  exit /b 1
)

echo.
echo [1/2] Encendiendo PostgreSQL y la API (1-2 minutos)...
echo       [i] el deploy sube el codigo actual de esta carpeta
powershell -ExecutionPolicy Bypass -File "%~dp0deploy\railway-resume.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo levantar el proyecto. Mira los mensajes de arriba.
  pause
  exit /b 1
)

REM --- 3. Chequeo del health ---
echo.
echo [2/2] Verificando la API...
set "APIURL="
if exist "%~dp0deploy\api-url.txt" (
  for /f "usebackq tokens=1 delims=" %%U in ("%~dp0deploy\api-url.txt") do set "APIURL=%%U"
)
if not defined APIURL (
  echo [AVISO] deploy\api-url.txt vacio o inexistente.
  pause
  exit /b 0
)
set "HEALTH=!APIURL!/health"
where curl.exe >nul 2>nul
if errorlevel 1 (
  echo [AVISO] curl.exe no esta disponible: no puedo verificar el health.
  echo         API: !HEALTH!
  pause
  exit /b 0
)
set "OK=0"
for /l %%i in (1,1,20) do (
  if "!OK!"=="0" (
    curl.exe -fsS "!HEALTH!" >nul 2>&1
    if not errorlevel 1 set "OK=1"
    if "!OK!"=="0" timeout /t 3 /nobreak >nul
  )
)

echo.
if "!OK!"=="1" (
  echo [OK] API encendida y respondiendo.
) else (
  echo [!] La API todavia no responde. Puede ser el cold start: probá en 30 s.
)
echo.
echo     API:  !HEALTH!
echo     Apps (celu): la app instalada usa !APIURL!
echo     Cuentas: ver datos.md en la raiz del repo.
echo.
echo     Para apagarla: stop-railway.cmd
echo.
pause
exit /b 0
