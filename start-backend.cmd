@echo off
REM Despegar - API backend (PHP 8.2 + PostgreSQL). Doble clic = sirve en 0.0.0.0:8000.
REM Requiere: PHP con extension pdo_pgsql, PostgreSQL con schema+seeds aplicados.
setlocal
echo [0/5] Ubicando raiz del repo...
cd /d "%~dp0" || (echo [ERROR] No se encontro la raiz del repo & pause & exit /b 1)
echo      OK: %CD%

echo [1/5] Buscando PHP...
if exist "C:\xampp\php\php.exe" set "PATH=C:\xampp\php;%PATH%"
where php >nul 2>nul || (echo [ERROR] PHP no esta en PATH ni en C:\xampp\php & pause & exit /b 1)
call php --version | findstr /C:"PHP"
call php -m | findstr /C:"pdo_pgsql" >nul 2>nul || (
  echo [AVISO] Falta extension pdo_pgsql en este PHP - activala en php.ini: extension=pdo_pgsql
  echo         Sin ella la API responde /api/health pero falla al tocar la BD.
)

echo [2/5] Revisando PostgreSQL (:5432)...
netstat -ano | findstr /C:":5432" | findstr /C:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo      OK: PostgreSQL escucha en 5432.
) else (
  echo [AVISO] Nada escucha en 5432 - inicia el servicio PostgreSQL.
  echo         Servicios de Windows: postgresql-x64-XX -^> Iniciar.
  echo         O en terminal admin: net start postgresql-x64-18.
  echo         Sin BD la API solo responde /api/health.
)

echo [3/5] Revisando backend\.env...
if not exist "backend\.env" (
  echo [AVISO] Falta backend\.env - copialo: copy backend\.env.example backend\.env
  echo         y ajusta DB_* + JWT_SECRET antes de probar login.
) else (
  echo      OK: backend\.env existe.
)

echo [4/5] Revisando puerto 8000...
netstat -ano | findstr /C:":8000" | findstr /C:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [ERROR] Puerto 8000 ocupado. Libera el proceso que lo usa e intenta de nuevo.
  pause & exit /b 1
)
echo      OK: puerto 8000 libre.

echo [5/5] Sirviendo API en http://0.0.0.0:8000  (salud: http://localhost:8000/api/health)
echo Deja esta ventana abierta. Ctrl+C para detener.
call php -S 0.0.0.0:8000 -t backend\public || (echo [ERROR] php fallo al arrancar & pause & exit /b 1)
