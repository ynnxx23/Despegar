@echo off
REM Despegar - API backend (PHP 8.2 + PostgreSQL). Doble clic = sirve en 0.0.0.0:8000.
REM Requiere: PHP con extension pdo_pgsql, PostgreSQL con schema+seeds aplicados.
setlocal
echo [0/6] Ubicando raiz del repo...
cd /d "%~dp0" || (echo [ERROR] No se encontro la raiz del repo & pause & exit /b 1)
echo      OK: %CD%

echo [1/6] Buscando PHP...
if exist "C:\xampp\php\php.exe" set "PATH=C:\xampp\php;%PATH%"
where php >nul 2>nul || (echo [ERROR] PHP no esta en PATH ni en C:\xampp\php & pause & exit /b 1)
call php --version | findstr /C:"PHP"
call php -m | findstr /C:"pdo_pgsql" >nul 2>nul || (
  echo [AVISO] Falta extension pdo_pgsql en este PHP - activala en php.ini: extension=pdo_pgsql
  echo         Sin ella la API responde /api/health pero falla al tocar la BD.
)

echo [2/6] Revisando PostgreSQL...
set "PGOK="
netstat -ano | findstr /C:":5434" | findstr /C:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo      OK: PostgreSQL escucha en 5434 (docker despegar-pg).
  set "PGOK=1"
)
netstat -ano | findstr /C:":5432" | findstr /C:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo      OK: PostgreSQL escucha en 5432 (local).
  set "PGOK=1"
)
if not defined PGOK (
  echo      Nada escucha en 5432/5434 - intentando levantar docker despegar-pg...
  docker start despegar-pg >nul 2>nul
  if errorlevel 1 docker run -d --name despegar-pg -e POSTGRES_DB=despegar -e POSTGRES_USER=despegar -e POSTGRES_PASSWORD=despegar_dev -p 5434:5432 postgres:16-alpine >nul 2>nul
  timeout /t 8 /nobreak >nul
  netstat -ano | findstr /C:":5434" | findstr /C:"LISTENING" >nul 2>nul
  if not errorlevel 1 (
    echo      OK: despegar-pg levantado en 5434.
  ) else (
    echo [AVISO] Sin PostgreSQL - la API solo responde /api/health. Inicia el servicio o Docker.
  )
)

echo [3/6] Revisando backend\.env...
if not exist "backend\.env" (
  echo [AVISO] Falta backend\.env - copialo: copy backend\.env.example backend\.env
  echo         y ajusta DB_* + JWT_SECRET antes de probar login.
) else (
  echo      OK: backend\.env existe.
)

echo [4/6] Aplicando migraciones (idempotente)...
call php backend\db_migrate.php || echo [AVISO] Migraciones fallaron - revisa DB_* en backend\.env.

echo [5/6] Revisando puerto 8000...
netstat -ano | findstr /C:":8000" | findstr /C:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [ERROR] Puerto 8000 ocupado. Libera el proceso que lo usa e intenta de nuevo.
  pause & exit /b 1
)
echo      OK: puerto 8000 libre.

echo [6/6] Sirviendo API en http://0.0.0.0:8000  (salud: http://localhost:8000/api/health)
echo Deja esta ventana abierta. Ctrl+C para detener.
REM Con router explicito: rutas con extension (ej. /api/openapi.json) tambien pasan por index.php.
call php -S 0.0.0.0:8000 -t backend\public backend\public\index.php || (echo [ERROR] php fallo al arrancar & pause & exit /b 1)
