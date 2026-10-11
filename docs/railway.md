# Deploy en Railway — API Despegar

La API queda **24/7 en la nube**, con dominio HTTPS público. El celular ya no necesita estar en
la misma Wi-Fi que la PC ni la PC encendida: las dos apps pegan contra
`https://api-production-88975.up.railway.app/api`.

```
Celular (Expo Go)  ──HTTPS──>  Railway: servicio "api" (Dockerfile, PHP 8.2 CLI)
                                        │
                                        └──> Railway Postgres (plugin, red privada)
```

## Servicios del proyecto

| Servicio | Qué es | Origen |
|---|---|---|
| `api` | API PHP 8.2 (server embebido) | `Dockerfile` de la raíz del repo |
| `Postgres` | PostgreSQL 18 (plugin oficial) | volumen persistente `postgres-volume` |

## Archivos del repo que sostienen el deploy

| Archivo | Para qué |
|---|---|
| `Dockerfile` | imagen `php:8.2-cli` + `pdo_pgsql`, escucha `$PORT`, 8 workers, healthcheck con switch |
| `.dockerignore` | excluye `backend/.env` y el resto del repo del build |
| `.railwayignore` | qué se sube con `railway up` |
| `deploy/init-db.ps1` | aplica schema + seeds (base nueva) o seeds + migraciones (base v2) contra la BD remota |
| `deploy/api-url.txt` | URL pública que las apps incrustan en el bundle |
| `deploy/railway-pause.ps1` | pausa la API (deja de facturar CPU/RAM) |
| `deploy/railway-resume.ps1` | la vuelve a levantar y espera que `/api/health` responda |

## Variables de entorno (servicio `api`)

| Variable | Valor | Nota |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | referencia al plugin; el backend la parsea (`backend/src/Database.php`) |
| `JWT_SECRET` | 64 hex aleatorios | **obligatoria**, mínimo 32 caracteres, si no el backend arranca con error 500 |
| `CORS_ORIGIN` | vacío (por defecto) | vacío = sin cabeceras CORS (las apps nativas no las necesitan) · `*` = cualquier origen (solo dev) · lista `https://a.com,https://b.com` = allowlist |
| `APP_ENV` | `production` | solo controla el aviso cuando `CORS_ORIGIN=*` |
| `REFRESH_TTL_DAYS` | 30 | vida del refresh token (1-90) |
| `HEALTHCHECK_ENABLED` | 1 | `0` apaga el healthcheck (sin tráfico saliente) para que el servicio pueda dormir |
| `PORT` | lo inyecta Railway | el `Dockerfile` escucha en `${PORT}` |
| `PHP_CLI_SERVER_WORKERS` | 8 (en el `Dockerfile`) | el server embebido de PHP es single-thread por defecto |

## Deploy (CLI, una vez)

```powershell
npm install -g @railway/cli
railway login --browserless          # abre https://railway.com/activate con un codigo
railway init --name despegar-api    # crea el proyecto y lo vincula a esta carpeta
railway add --database postgres      # plugin Postgres
railway ssh keys add                 # clave SSH (solo si vas a usar el tunel de la BD)
railway add --service api --variables "JWT_SECRET=<64 hex>"
railway variable set --service api 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
railway up --service api --detach    # sube el repo y construye la imagen
railway domain --service api         # imprime/crea el dominio publico
```

> En PowerShell las referencias de Railway van entre comillas simples:
> `'DATABASE_URL=${{Postgres.DATABASE_URL}}'` — con comillas dobles PowerShell expande `${...}`.

### Base de datos (una vez)

`db/schema.sql` **borra las tablas** (DROP TABLE), así que solo se aplica sobre una base vacía.
El plugin Postgres no expone el puerto a internet: se entra por túnel SSH.

```powershell
# 1. tunel: en otra terminal queda escuchando en 127.0.0.1:54320
railway connect Postgres --tunnel-only --port 54320

# 2. schema + seeds (base nueva) o seeds + migraciones (base vieja)
powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 `
  -DatabaseUrl "postgresql://postgres:<pass>@127.0.0.1:54320/railway"
```

`deploy/init-db.ps1` es idempotente salvo `schema.sql`: si la base ya tiene tablas y no se pasa
`-Force`, solo aplica seeds y migraciones (suben una base v2 a v3).

## Actualizar el código

```powershell
railway up --service api --detach
railway logs --service api            # ver la salida del container
```

El `Dockerfile` no copia `backend/.env` (`.dockerignore`), así que la configuración sale solo de
las variables del servicio.

## Apuntar las apps a la nube

La URL de la API se **incrusta en el bundle** de Expo al compilar, no se lee en runtime. Por eso:

1. `deploy/api-url.txt` (versionado, sin secretos) con la URL pública:
   `https://api-production-88975.up.railway.app/api`.
2. `start-viajero.cmd` / `start-agente.cmd` leen ese archivo y escriben `apps/<app>/.env`
   con `EXPO_PUBLIC_API_URL` (los `.env` están gitignored).
3. **Reiniciar** Expo (doble clic en el `.cmd`): recargar la app en el celu no alcanza, porque
   el valor viejo ya quedó dentro del bundle.

### Volver al backend local

```powershell
start-viajero.cmd local      # fuerza http://<IP-LAN>:8000/api
start-agente.cmd local
```

Sin argumento los scripts usan `deploy/api-url.txt`; con `local` detectan la IP LAN de la PC.

## Costo

Railway factura por uso (CPU/RAM del container + volumen del Postgres) con créditos prepagos. Una
demo en vivo consume poco, pero **la API queda encendida 24/7** mientras el proyecto exista.
Hay tres formas de gastar menos:

### 1. Pausar el proyecto entre demostraciones

```powershell
powershell -ExecutionPolicy Bypass -File deploy\railway-pause.ps1
```

Qué hace: setea `HEALTHCHECK_ENABLED=0` (el healthcheck sale sin pegarle un request al server,
así no hay tráfico saliente) y baja los deployments de `api` **y** `Postgres`
(`railway down`): los containers se apagan y dejan de facturar CPU/RAM. **Los datos no se
tocan**: quedan en el volumen `postgres-volume`.

```powershell
powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1
```

Rehace el deploy desde el repo local (`railway up`) y espera a que `/api/health` devuelva 200.
Antes de eso recrea el deployment de Postgres desde la imagen del plugin
(`railway service source connect --image ghcr.io/railwayapp-templates/postgres-ssl:18`):
mismo volumen, mismos datos, mismas variables.

Opciones: `-SoloHealthcheck` (solo apaga el healthcheck, sin bajar los deployments) y
`-AutoSleep` (deja el healthcheck apagado y avisa que actives *Settings → Deploy → Serverless*
en el dashboard para que la API se duerma sola a los 5-10 min de inactividad, con 0 compute).

### 2. Serverless

Con *Settings → Deploy → Serverless* activado y el healthcheck apagado, Railway duerme el
servicio cuando no hay tráfico: la primera request lo despierta (frío de unos segundos).

### 3. Sacar la base del proyecto

El Postgres **sigue facturando RAM + volumen** (~5-20 USD/mes) si queda corriendo. Con
`deploy\railway-pause.ps1` ya se apaga junto con la API (el volumen sobrevive, así que
`deploy\railway-resume.ps1` lo levanta de nuevo sin perder datos).

Si además querés sacarlo del proyecto: hacer un `pg_dump` de los datos, remover el service
`Postgres` desde el dashboard y recrearlo cuando haga falta (`deploy/init-db.ps1` vuelve a
sembrar la base). Ojo: remover el service **con el volumen** borra los datos.

## Consideraciones

- **Datos compartidos**: las dos apps y todos los que descarguen la app ven la **misma** base en la
  nube (antes cada PC tenía su PostgreSQL local). Para una demo conviene que el agente use
  cuentas/agentes distintos.
- **Seguridad**: CORS configurable (`CORS_ORIGIN` vacío = no se manda ninguna cabecera) y
  passwords demo en el repo. Es aceptable para desarrollo/demo, no para producción
  (rotar `JWT_SECRET` y las cuentas demo, exige HTTPS ya activo).
- **Sin secretos en el repo**: `JWT_SECRET` y la password del Postgres viven solo en Railway.
