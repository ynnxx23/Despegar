# Puesta en marcha — Despegar Grupo 8

Guía única para **dejar el proyecto andando** (apps + API + base) desde cero, para **otra PC**
y para **cada vez que se prende el backend**. Complementa a `docs/railway.md` (detalle técnico
del deploy) y a `README.md` (referencia de la API).

- API en la nube: `https://api-production-88975.up.railway.app/api`
- Base de datos: PostgreSQL 18 (plugin de Railway) con volumen `postgres-volume`
- Apps: Expo SDK 57 (celular con Expo Go del mismo SDK)

## TL;DR — la rutina de cada demo

```powershell
# 1. Prender API + base en Railway (doble clic: start-railway.cmd)
powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1

# 2. (solo si cambió el schema de la base) aplicarlo con el túnel SSH abierto
powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 `
  -DatabaseUrl "postgresql://postgres:<PASS>@127.0.0.1:54320/railway"

# 3. Levantar las dos apps
start-viajero.cmd
start-agente.cmd

# 4. Al terminar la demo, apagar para no gastar el límite de uso
powershell -ExecutionPolicy Bypass -File deploy\railway-pause.ps1
```

O bien, sin tocar PowerShell: **`start-railway.cmd`** (enciende y verifica el health)
y **`stop-railway.cmd`** (apaga: 0 CPU / 0 RAM facturados). Los dos son doble clic
desde la raíz del repo y necesitan la CLI de Railway (`npm i -g @railway/cli`) con el
proyecto `despegar-api` vinculado (`railway link`).

Equivalente manual del paso 1 (lo que hace el script):

```powershell
railway service source connect --image ghcr.io/railwayapp-templates/postgres-ssl:18 --service Postgres
railway variable set --service api HEALTHCHECK_ENABLED=1 --skip-deploys
railway up --service api --detach
```

---

## 1. Requisitos por PC

| Componente | Versión | Para qué | Verificación |
|---|---|---|---|
| Node.js + npm | 20+ | correr Expo (las dos apps) | `node --version` |
| Expo Go | SDK 57 | abrir las apps en el celular | app oficial del celu |
| Railway CLI | 5.x | deploy / pausa de la API | `railway --version` |
| PowerShell | 5.1+ | scripts de `deploy\` | `powershell -Command $PSVersionTable.PSVersion` |
| Git | cualquiera | clonar el repo | `git --version` |
| PHP 8.5.12 + `pdo_pgsql` | 8.5.12 | **solo** si corrés el backend local (`C:\xampp\php\php.exe`) | `php -m \| findstr pdo_pgsql` |
| PostgreSQL | 15+ | **solo** si corrés la BD local | `psql --version` |
| Docker Desktop | opcional | `docker compose up --build` (API + BD local) | `docker --version` |

En Windows, PowerShell suele bloquear los `.ps1` (ExecutionPolicy). Dos salidas: ejecutar con
`powershell -ExecutionPolicy Bypass -File ...` (como hacen los scripts de este repo) o usar el
wrapper `.cmd` de la CLI (`railway.cmd`).

---

## 2. Primera vez en una PC nueva

### 2.1 Clonar el repo

```powershell
git clone <URL_DEL_REPO> Despegar
cd Despegar
```

### 2.2 Instalar la CLI de Railway

```powershell
npm install -g @railway/cli
railway --version          # en Windows: railway.cmd --version
```

### 2.3 Loguearse (la sesión dura ~1 h; si expira, `railway login` otra vez)

```powershell
railway login --browserless
```

Abre `https://railway.com/activate` con un código. También sirve `railway login` (abre el
navegador).

### 2.4 Vincular esta carpeta al proyecto que YA existe

**No crear un proyecto nuevo**: el proyecto `despegar-api` ya tiene la base, el volumen y el
dominio. Hay que vincularse a él.

```powershell
railway link
```

Elegí del listado el proyecto **`despegar-api`** (workspace *Yensel Exequiel Villalba's Projects*).
Verificá:

```powershell
railway status
```

Debe decir:

```
Project:       despegar-api
Project ID:    0f7765ef-7478-4619-9634-66810caf0c38
Environment:   production
Linked service: api
```

Si `railway link` no ofrece el proyecto, se puede forzar con el ID:

```powershell
railway link 0f7765ef-7478-4619-9634-66810caf0c38
```

### 2.5 Instalar las dependencias de las apps

Los `.cmd` lo hacen solos, pero si querés dejar todo listo de una:

```powershell
cd apps\viajero; npm install; cd ..\..
cd apps\agente;  npm install; cd ..\..
```

### 2.6 (Opcional) Secretos locales para correr el backend en la PC

```powershell
copy backend\.env.example backend\.env
```

Editá `backend/.env`: `DB_PASS` (tu rol local) y `JWT_SECRET` (32+ bytes random:
`openssl rand -hex 32`). Solo si vas a usar el backend local.

---

## 3. Qué hay configurado en Railway (una sola vez)

Estado actual del proyecto `despegar-api` (environment `production`, región `iad`):

| Servicio | Origen | Notas |
|---|---|---|
| `api` | `Dockerfile` de la raíz | PHP 8.2 CLI + `pdo_pgsql`, escucha `$PORT`, 8 workers, healthcheck con switch |
| `Postgres` | imagen `ghcr.io/railwayapp-templates/postgres-ssl:18` | plugin con volumen `postgres-volume` (500 MB) en `/var/lib/postgresql/data` |

Variables del servicio `api`:

| Variable | Valor | Nota |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al plugin) | red privada, sin salir a internet |
| `JWT_SECRET` | 64 hex aleatorios | **obligatoria**: si mide menos de 32 caracteres la API arranca con 500 |
| `HEALTHCHECK_ENABLED` | `0` pausado / `1` normal | la gestiona `deploy\railway-pause.ps1` / `railway-resume.ps1` |
| `PORT` | lo inyecta Railway | el `Dockerfile` escucha en `${PORT}` |
| `PHP_CLI_SERVER_WORKERS` | 8 | va en el `Dockerfile` |

Dominio público: `https://api-production-88975.up.railway.app/api` → también en
`deploy/api-url.txt` (las apps lo leen de ahí).

> El service `api` **no tiene source de GitHub conectado**: los deploys salen de `railway up`
> ejecutado en el repo local. Por eso `railway up` siempre se corre **desde la raíz del repo**.

Si algún día hay que armar el proyecto de cero (cuenta nueva o proyecto perdido):

```powershell
railway init --name despegar-api
railway add --database postgres
railway service source connect --image ghcr.io/railwayapp-templates/postgres-ssl:18 --service Postgres
railway add --service api --variables "JWT_SECRET=<64 hex>"
railway variable set --service api 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
railway up --service api --detach
railway domain --service api
```

Y después: crear el volumen `postgres-volume` (500 MB) montado en
`/var/lib/postgresql/data` del service `Postgres` (dashboard → Postgres → Volumes).

---

## 4. La base de datos: `deploy\init-db.ps1`

**Cuándo correrlo:** la **primera** vez que se crea la base, y cada vez que cambie el schema
(`db/schema.sql` o un `db/migrate_0*.sql` nuevo). **No** hace falta en cada demo.

El plugin Postgres no expone el puerto a internet: se entra por **túnel SSH**.

```powershell
# Terminal 1: deja el túnel escuchando en 127.0.0.1:54320
railway connect Postgres --tunnel-only --port 54320
```

El túnel imprime la URL con la password. Copiala y pasala al script:

```powershell
# Terminal 2
powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 `
  -DatabaseUrl "postgresql://postgres:<PASS>@127.0.0.1:54320/railway"
```

Password alternativa si no la tenés a mano:

```powershell
railway variable list --service Postgres --kv
```

Qué hace el script:

- Si la base **ya tiene tablas** → aplica solo `seeds.sql` + las migraciones `02/03/04/05/06`
  (idempotentes). Es el caso normal.
  - `migrate_05_admin_auditoria.sql`: rol `admin`, tabla `usuarios_auditoria`, índices y trigger.
  - `migrate_06_seed_demo_grande.sql`: los datos de demostración (12 usuarios, 10 reservas,
    14 incidentes y 7 respuestas). Ver `datos.md`.
- Si la base **está vacía** → aplica `schema.sql` + `seeds.sql`.
- Con `-Force` → re-aplica `schema.sql`, que **DROPea las tablas**: borra los datos.

> `db/schema.sql` es destructivo. Nunca lo apliques sobre la base de la demo sin `-Force`.

Datos que deja la base: `sembrar_demo()` crea los administradores `admin@despegar.com / Admin1234`
y `admin2@despegar.com / Admin5678`, los agentes `agente@despegar.com / Agente123` (y `maria@`,
`carlos@`, `lucia@`) y los viajeros `ana@test.com / Viaje1234` (y `bruno@`, `sofia@`, `diego@`,
`valeria@`, `tomas@`). La tabla completa está en `datos.md`.

---

## 5. La rutina de cada demo (prender todo)

Este es el bloque que se corre **cada vez que se va a mostrar el proyecto**:

```powershell
# 1) Levantar API + base en Railway (hace TODO lo de abajo)
powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1
```

`deploy\railway-resume.ps1` internamente:

1. `railway service source connect --image ghcr.io/railwayapp-templates/postgres-ssl:18 --service Postgres`
   → recrea el deployment de la base (mismo volumen, mismos datos, mismas variables).
2. `railway variable set --service api HEALTHCHECK_ENABLED=1 --skip-deploys`
   → reactiva el healthcheck.
3. `railway up --service api --detach`
   → sube el repo local, construye la imagen y levanta el container.
4. Espera a que `GET https://api-production-88975.up.railway.app/api/health` devuelva **200**.

Si preferís hacerlo a mano (mismos pasos, sin el script):

```powershell
railway service source connect --image ghcr.io/railwayapp-templates/postgres-ssl:18 --service Postgres
railway variable set --service api HEALTHCHECK_ENABLED=1 --skip-deploys
railway up --service api --detach
```

Si el schema de la base cambió en esta sesión, **después** del resume:

```powershell
# con el túnel abierto en otra terminal
powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 `
  -DatabaseUrl "postgresql://postgres:<PASS>@127.0.0.1:54320/railway"
```

### 5.1 Levantar las apps

Doble clic (o desde la terminal):

```powershell
start-viajero.cmd          # Expo en el puerto 8081  (usa deploy\api-url.txt -> Railway)
start-agente.cmd           # Expo en el puerto 8082  (usa deploy\api-url.txt -> Railway)
```

Variantes:

| Comando | API que usan las apps |
|---|---|
| `start-viajero.cmd` / `start-agente.cmd` | `deploy\api-url.txt` (Railway) si el archivo existe; si no, IP LAN de la PC |
| `start-viajero.cmd railway` | fuerza la URL de Railway |
| `start-viajero.cmd local` | fuerza `http://<IP-LAN>:8000/api` (backend local) |

Los `.cmd` escriben `apps\<app>\.env` con `EXPO_PUBLIC_API_URL`. Ojo: **esa URL queda
incrustada en el bundle de Expo**; si cambia, hay que **reiniciar Expo** (doble clic otra vez),
recargar la app en el celu no alcanza.

### 5.2 Verificar que todo ande

```powershell
# 1. API viva
curl.exe https://api-production-88975.up.railway.app/api/health      # {"ok":true,...}

# 2. Login contra la base real (prueba de punta a punta)
curl.exe -X POST https://api-production-88975.up.railway.app/api/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"ana@test.com\",\"password\":\"Viaje1234\"}'
```

> En Windows usá `curl.exe` (no `curl`): en PowerShell 5.1 `curl` es alias de `Invoke-WebRequest`
> y no acepta `-X`/`-d`.

Si el login devuelve `token` y `refresh_token`, la API y la base están talking.

---

## 6. Apagar el proyecto cuando no se usa (deja de consumir el límite)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\railway-pause.ps1
```

Qué hace:

- `HEALTHCHECK_ENABLED=0` → el healthcheck sale sin pegarle un request al server (así no hay
  tráfico saliente y el servicio puede dormir).
- `railway down` en `api` **y** `Postgres` → los containers se apagan: 0 CPU / 0 RAM facturados.

Qué **no** hace: los datos quedan intactos en el volumen `postgres-volume`. Para volver:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1
```

Auto-sleep (opcional, dashboard): *api → Settings → Deploy → Serverless*. Con el healthcheck
apagado, la API se duerme sola a los 5-10 min de inactividad y despierta con la primera request
(el primer request puede dar 502 por el cold start).

Red de seguridad (opcional): `railway.com/workspace/usage` → *Set Usage Limits* → **Compute
Usage → Hard limit** (mínimo $10). Al llegar al tope, Railway apaga todo solo.

---

## 7. Alternativa: correr todo local (sin Railway)

```powershell
copy backend\.env.example backend\.env     # ajustar DB_PASS + JWT_SECRET
docker compose up --build                  # API :8000 + PostgreSQL :5432
```

O sin Docker:

```powershell
psql -U despegar -d despegar -f db\schema.sql -f db\seeds.sql
php -S 0.0.0.0:8000 -t backend\public
start-viajero.cmd local
start-agente.cmd local
```

Con el backend local, el celular tiene que estar en la **misma Wi-Fi** y el firewall de Windows
tiene que permitir los puertos `8000`, `8081` y `8082` en red privada.

---

## 8. Troubleshooting

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `no se puede cargar el archivo ...railway.ps1` | ExecutionPolicy de PowerShell | usar `railway.cmd` o `powershell -ExecutionPolicy Bypass -File ...` |
| `No deployments found` al hacer `down` | el servicio ya estaba pausado | es idempotente, no pasa nada |
| `railway up` sube el repo entero / tarda | el `railway up` se corre fuera de la raíz | correrlo **desde la raíz del repo** (`.railwayignore` excluye `apps/`, `docs/`, `tests/`) |
| `Local port 54320 is already in use` | quedó un túnel SSH viejo | `Get-NetTCPConnection -LocalPort 54320 -State Listen` → matar el `ssh` o usar otro `--port` |
| `POST /api/login` → 500 `relation "refresh_tokens" does not exist` | falta una migración en la base | `deploy\init-db.ps1` (aplica `migrate_04_refresh_tokens.sql`) |
| `POST /api/login` → 404 recién después de un deploy | el edge todavía rutea al deployment viejo | esperar 10-15 s y reintentar |
| `relation "usuarios" does not exist` | base vacía | `deploy\init-db.ps1` sin `-Force` |
| La API responde 404 o no responde | está pausada | `deploy\railway-resume.ps1` |
| Postgres no llega a `SUCCESS` al reanudar | quedó con 0 réplicas configuradas | `railway scale --service Postgres iad=1` (el script ya lo hace como fallback) |
| La app no conecta | la URL quedó incrustada en el bundle viejo | reiniciar Expo (doble clic en el `.cmd`) |
| `railway status` muestra otro proyecto | quedó vinculado al equivocado | `railway unlink` y `railway link` → `despegar-api` |
| JWT 500 en todos los endpoints | `JWT_SECRET` corta o ausente | `railway variable set --service api "JWT_SECRET=<64 hex>"` y redeploy |

---

## 9. Checklist para otra PC

- [ ] Node 20+ y npm (`node --version`)
- [ ] Git clona el repo
- [ ] `npm install -g @railway/cli`
- [ ] `railway login --browserless`
- [ ] `railway link` → proyecto **`despegar-api`** (NO crear uno nuevo)
- [ ] `railway status` muestra `despegar-api` / `api`
- [ ] `deploy\api-url.txt` con la URL de la API
- [ ] `npm install` en `apps\viajero` y `apps\agente`
- [ ] `powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1` → API 200 en `/api/health`
- [ ] (solo si la base está vacía o cambió el schema) `deploy\init-db.ps1` por túnel SSH
- [ ] Doble clic en `start-viajero.cmd` y `start-agente.cmd` → escanear el QR en el celu
- [ ] Login de prueba `ana@test.com / Viaje1234` (viajero), `agente@despegar.com / Agente123`
      (agente) y `admin@despegar.com / Admin1234` (administrador). Todas en `datos.md`.
- [ ] Al terminar la demo: `powershell -ExecutionPolicy Bypass -File deploy\railway-pause.ps1`

---

## 10. Documentos relacionados

| Doc | Contenido |
|---|---|
| `docs/railway.md` | detalle del deploy: servicios, variables, migraciones, costo |
| `docs/api.md` | referencia de endpoints |
| `docs/app-viajero.md` / `docs/app-agente.md` | las dos apps |
| `README.md` | vista general, API, dev local |
| `DOC_PROYECTO.md` / `DOC_DESARROLLO.md` | especificación del proyecto |
