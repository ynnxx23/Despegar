# 07 — Despliegue y operación

## 1. Panorama

```
Repositorio (GitHub, rama main)
   │
   ├──► CI (GitHub Actions) en cada push: PostgreSQL + API + tests
   │
   ├──► Railway (deploy manual con `railway up`):
   │      ├── servicio "api"      → imagen Docker (php:8.2-cli + pdo_pgsql)
   │      └── servicio "Postgres" → plugin con volumen postgres-volume (500 MB)
   │                                (red privada entre servicios)
   │
   └──► EAS Build (nube de Expo) → APK Android por proyecto
```

---

## 2. Railway

### Servicios

| Servicio | Qué es | Puerto | Coste |
|---|---|---|---|
| `api` | Contenedor con el `Dockerfile` de la raíz | `$PORT` (inyectado) | CPU/RAM mientras corre |
| `Postgres` | Imagen del plugin (`postgres-ssl:18`) + volumen | 5432 (privado) | ~USD 5–20/mes según uso |

La API **no** está en GitHub Actions: el deploy se hace desde la PC con la CLI
(`railway up`), porque el proyecto tiene el servicio `api` sin source conectado a
GitHub. Por eso los scripts se ejecutan **desde la raíz del repo** (el CLI sube la
carpeta respetando `.railwayignore`).

### Variables de entorno del servicio `api`

| Variable | Valor | Notas |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al plugin: red privada, no sale a internet |
| `JWT_SECRET` | 64 hex aleatorios | **Obligatoria**: con menos de 32 caracteres la API arranca con 500 |
| `HEALTHCHECK_ENABLED` | `1` / `0` | `0` = el healthcheck sale sin pegarle un request (permite dormir el servicio) |
| `PORT` | inyectado por Railway | El `Dockerfile` escucha en `${PORT}` |
| `PHP_CLI_SERVER_WORKERS` | 8 (en el `Dockerfile`) | Varios workers del server embebido |

### Volumen

El Postgres usa el volumen `postgres-volume` (500 MB). **Pausar el servicio no borra
los datos**: `railway down` apaga el contenedor y el volumen sigue ahí. Reanudar
recrea el deployment desde la imagen del plugin y los datos vuelven.

### Prender / apagar (doble clic)

| Script | Qué hace |
|---|---|
| `start-railway.cmd` | Verifica la CLI y el vínculo del proyecto → levanta Postgres (espera `SUCCESS`) → `HEALTHCHECK_ENABLED=1` → `railway up` → espera el health → muestra la URL |
| `stop-railway.cmd` | `HEALTHCHECK_ENABLED=0` → `railway down` en `api` y en `Postgres` → 0 CPU / 0 RAM facturados |

Equivalentes en PowerShell: `deploy\railway-resume.ps1` y `deploy\railway-pause.ps1`.

> **Por qué apagar:** el proyecto es de demostración. Con el servicio corriendo se
> factura CPU/RAM todo el mes. Los scripts dejan el proyecto en 0 costo fuera de la
> demo, sin perder datos.

### Aplicar cambios de esquema

```powershell
# 1. Con el proyecto prendido, abrir el túnel (otra terminal)
railway connect Postgres --tunnel-only --port 54320
#    imprime: postgresql://postgres:<PASS>@127.0.0.1:54320/railway

# 2. Aplicar seeds + migraciones (idempotentes)
powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 `
  -DatabaseUrl "postgresql://postgres:<PASS>@127.0.0.1:54320/railway"
```

`init-db.ps1` detecta si la base tiene tablas:
- **no tiene** → aplica `schema.sql` + `seeds.sql` (base nueva).
- **tiene** → aplica `seeds.sql` + las migraciones `02/03/04/05/06` (upgrade).
- con `-Force` → re-aplica `schema.sql` (**destructivo**: borra las tablas).

---

## 3. Docker

### `Dockerfile` (imagen de producción)

```dockerfile
FROM php:8.2-cli                      # sin Apache: el server embebido alcanza
RUN apt-get install -y libpq-dev && docker-php-ext-install pdo_pgsql
WORKDIR /app
COPY backend/ /app/                   # solo el backend (el .dockerignore filtra el resto)
ENV PORT=8000
ENV PHP_CLI_SERVER_WORKERS=8
HEALTHCHECK …                          # se puede desactivar con HEALTHCHECK_ENABLED=0
CMD ["sh","-c","php -S 0.0.0.0:${PORT:-8000} -t /app/public"]
```

- Imagen mínima: **runtime + `pdo_pgsql`**, sin Composer, sin vendor.
- `.dockerignore` excluye `.git`, `apps/`, `docs/`, `tests/`, `deploy/`, `*.docx`,
  `*.md`, `db/`, `backend/.env` → el contexto de build es chico.
- `.railwayignore` (lo que sube el CLI) excluye además `docker-compose.yml` y
  `start-*.cmd`.

### `docker-compose.yml` (stack local completo)

```bash
docker compose up --build
# API      → http://localhost:8000/api/health
# Postgres → localhost:5432
```

- El servicio `api` **usa el `Dockerfile` de la raíz** (`build: .`): el mismo código
  que corre en Railway.
- `depends_on: postgres (service_healthy)`: la API espera a que la base esté sana.
- En `docker-entrypoint-initdb.d` se montan `db/schema.sql`, `db/seeds.sql` y
  `db/seed_demo.sql` (el schema lo incluye con `\ir`, y psql resuelve esa ruta
  relativa al propio script → tiene que estar en el mismo directorio).
- **Ojo:** los scripts de init solo corren la **primera** vez (cuando el volumen
  `pgdata` está vacío). Para recrear: `docker compose down -v && docker compose up --build`.
- Si tu PostgreSQL local ya usa el 5432, cambiá el mapeo de puertos o paralo.

---

## 4. CI (`.github/workflows/ci.yml`)

Dispara en cada push y en cada PR. Pasos:

1. `actions/checkout`
2. `shivammathur/setup-php` 8.2 con `extensions: pdo_pgsql`
3. `actions/setup-node` 20
4. `php -l` sobre **todos** los `.php` de `backend/`
5. `psql -f db/schema.sql` y `-f db/seeds.sql` contra el Postgres del servicio
6. Se escribe `backend/.env` de prueba (JWT_SECRET hex de 64, valores fijos)
7. Se levanta la API en background (`php -S 127.0.0.1:8000 -t backend/public`)
8. Se espera el health check (30 intentos)
9. `node --test tests/api.test.mjs` (16 checks)
10. `node --test tests/api_client_refresh.test.mjs` (4 checks)
11. Si algo falla, se sube `api.log` y `backend/var/ratelimit` como artefacto

**Sin secrets**: los valores de prueba son fijos y públicos a propósito. La idea es
que cualquiera pueda forkear el repo y tenga CI verde sin configurar nada.

---

## 5. EAS Build (distribución móvil)

| Aspecto | Detalle |
|---|---|
| Cuentas | `@ynnxx23/despegar-viajero`, `@ynnxx23/despegar-agente` |
| Perfiles | `development` (dev client), `preview` (APK manual), `production` (AAB) |
| URL de la API | Fijada en `eas.json` por perfil → Railway (nunca localhost) |
| Instalación | QR del build → "orígenes desconocidos" → instalar |
| Actualización | El APK nuevo se instala encima; conserva la sesión |

El proyecto de EAS guarda las credenciales de firma: los builds futuros se firman con
la misma clave, así que las actualizaciones funcionan sin desinstalar.

---

## 6. Entorno local (para desarrollo)

```bash
# 1. Base de datos (PostgreSQL local)
createuser -U postgres -d despegar -P
createdb -U postgres -O despegar despegar
psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql

# 2. Secretos
cp backend/.env.example backend/.env      # ajustar DB_PASS y JWT_SECRET (32+ bytes)

# 3. API
php -S 0.0.0.0:8000 -t backend/public    # 0.0.0.0 para que la llegue el celu por LAN

# 4. Apps
start-viajero.cmd                        # o: start-viajero.cmd local (IP LAN)
start-agente.cmd
```

En `.env` conviene subir las cuotas si vas a correr las suites de tests repetidas
(registran usuarios): `REGISTER_RATE_LIMIT=500`.

---

## 7. Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `POST /api/login` → 500 `relation "refresh_tokens" does not exist` | falta una migración | `deploy\init-db.ps1` (aplica `migrate_04`) |
| `relation "usuarios" does not exist` | base vacía | `deploy\init-db.ps1` sin `-Force` |
| 404 recién después de un deploy | el edge todavía rutea al deployment viejo | esperar 10-15 s y reintentar |
| La API responde 404 o no responde | está pausada | `start-railway.cmd` |
| JWT 500 en todos los endpoints | `JWT_SECRET` corta o ausente | `railway variable set --service api "JWT_SECRET=<64 hex>"` y redesplegar |
| 429 al loguearse | cuota por IP o por cuenta | esperar un minuto; el `Retry-After` dice cuándo |
| Postgres no llega a `SUCCESS` al reanudar | quedó con 0 réplicas | `railway scale --service Postgres iad=1` (el script ya lo intenta) |
| "Conectando…" infinito en la app | la URL quedó vieja en el bundle | reiniciar Expo (o recompilar el APK) |
| La app instalada no conecta | la API está pausada | `start-railway.cmd` |
| `Local port 54320 is already in use` | quedó un túnel SSH viejo | matar el proceso `ssh` o usar otro puerto |

---

## 8. Copias de seguridad

- **Volumen de Railway**: es la única fuente de datos de producción. `railway down`
  no lo borra, pero un "delete project" sí.
- **Respaldo manual**:
  ```bash
  pg_dump "$DATABASE_URL" > respaldo_$(date +%F).sql
  ```
- **Restaurar**: `psql "$DATABASE_URL" -f respaldo.sql`
- **Regenerar los datos de demo**: `deploy\init-db.ps1` (idempotente) o
  `psql -f db/migrate_06_seed_demo_grande.sql`.
