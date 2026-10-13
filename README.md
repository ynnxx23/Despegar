# Despegar — Grupo 8 (Gestión de Incidentes Críticos)
Ecosistema con **2 apps móviles** (viajero + agente) sobre una API PHP + PostgreSQL.
Documentación: `DOC_PROYECTO.md` (general), `DOC_DESARROLLO.md` (técnica),
`docs/api.md` + `docs/openapi.json` v1.4.1 (contrato), `docs/app-viajero.md`, `docs/app-agente.md`, `docs/caso-uso.md` + `docs/caso-uso.drawio` (casos de uso).

## Estructura
- `backend/` PHP 8.2 POO + PDO pgsql (sin framework). Entrada: `backend/public/index.php` (~40 rutas). Runner: `backend/db_migrate.php`.
- `db/` schema + seeds + `migrate_02..07` (triaje, gestión, completa, fase4, sesiones/GDPR, equipo/reset).
- `apps/viajero/` App 1 Portal Ayuda al Viajero (Expo RN, 7 screens).
- `apps/agente/` App 2 Centro Resolución (Expo RN, 3 screens).
- `apps/shared/` theme EVA + api (+refresh) + auth + componentes + offline + avisos.
- `tests/` suites F2/F3/F7/F8/F9/F10/F11/F12/F13 (.ps1) + e2e Maestro + `mint_expired.php`.
- `.github/workflows/api.yml` CI: lint PHP + migraciones + health.

## Dev rápido (PostgreSQL local)
Requisito PHP: extensión `pdo_pgsql` activa (`extension=pdo_pgsql` en `php.ini`; XAMPP sirve).
1. Crear rol/BD una vez: `createdb -U postgres -O despegar despegar` (pass rol: `despegar_dev`).
2. Aplicar base: `psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql` y luego `php backend/db_migrate.php` (02→07, idempotente).
3. Copiar `backend/.env.example` a `backend/.env` y ajustar (JWT_SECRET ≥32).
4. `php -S 0.0.0.0:8000 -t backend/public backend/public/index.php` → `GET http://localhost:8000/api/health` (con router explícito para que rutas con extensión como `/api/openapi.json` también pasen por `index.php`).

Atajo Windows (doble clic): `start-backend.cmd`, `start-viajero.cmd`, `start-agente.cmd`.

Opción B con Docker (opcional): `docker compose up --build` → API `:8000`, PostgreSQL `:5432`.

## API (base `/api`, JSON, `Authorization: Bearer <jwt>`, contrato en `docs/openapi.json`)
| Método | Ruta | Rol | Uso |
|---|---|---|---|
| GET | `/health`, `/openapi.json` | — | Salud con DB / contrato |
| POST | `/register`, `/login` | público | Alta viajero / login (rate-limit) → `{user,token,refresh_token}` |
| POST | `/refresh`, `/logout` | público/auth | Rotación refresh / revoca una o todas |
| GET/DELETE | `/me` | auth | Sesión / borrado GDPR |
| POST | `/email/solicitar|verificar`, `/password/solicitar|restablecer` | auth/público | Verificación y recupero |
| GET | `/itinerario` | viajero | Sus reservas |
| GET/POST | `/incidentes/mios`, `/incidentes` | viajero | Propios paginados / crear (idempotente) |
| GET | `/incidentes/:id`(+`/respuestas`) | dueño/agente | Detalle e hilo (viajero: solo público) |
| POST | `/incidentes/:id/respuestas`, `/reabrir` | viajero | Réplica (reabre) / reabrir Resuelto |
| GET/POST | `/incidentes/:id/adjuntos`(+`:adj/ocr`) | dueño/agente | Subir base64 / OCR + autovínculo |
| GET | `/incidentes/:id/resumen` | dueño/agente | Resumen IA `?lang=es\|en\|pt` |
| GET | `/admin/incidentes`, `/mi-cola`, `/resumen` | agente | Cola (q/tipo/filtros/orden) / mi cola / conteos |
| GET/PUT | `/admin/incidentes/:id` | agente | Triaje (transición válida, Resuelto exige prioridad) |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | Hilo / responder (pública o interna) |
| POST/DELETE | `/admin/incidentes/:id/claim\|release\|derivar\|seguir` | agente | Gestión transaccional de casos |
| GET | `/admin/incidentes/:id/historial\|ia\|auditoria` | agente | Eventos+hash / score IA / verificación + `POST .../auditoria/resellar` (legacy) |
| POST | `/admin/incidentes/:id/copiloto`, `.../merge`, `/admin/incidentes/bulk` | agente | Copiloto / duplicado / masivo |
| GET/POST/PUT | `/admin/agentes`, `/admin/agentes/:id/estado` | agente | Equipo: listar, alta, activar/desactivar |
| GET/POST | `/admin/metricas(.csv)`, `/admin/sla/riesgo\|revisar` | agente | Dashboard y SLA predictivo |
| GET/POST | `/notificaciones...`, `/chatbot/borrador`, `/stt/transcribir`, `/stream` | auth | Avisos / asistente / voz / SSE |

Errores: `{error:{code,code_str,request_id}}`: 400 validación, 401 auth, 403 rol/ownership, 404, 409 conflicto, 429 rate-limit, 500 genérico.

## Tests
Requieren API en `:8000` con BD migrada:
`powershell -ExecutionPolicy Bypass -File tests/api_f2_auth.ps1` (auth/roles/SQLi) ·
`tests/api_f3_dominio.ps1` (itinerario/incidentes/cola/403) ·
`tests/api_f7_integracion.ps1` (JWT expirado→401 + loop viajero→agente→viajero) ·
`tests/api_f8_gestion.ps1` (sugerencia/SLA/claim/derivar/seguir/historial) ·
`tests/api_f9_fases.ps1` (idempotencia/réplica/internas/transiciones/bulk/merge/métricas/openapi) ·
`tests/api_f10_fase4.ps1` (IA/copiloto/resumen/notifs/chatbot/STT/riesgo/CSV/auditoría/adjunto/OCR) ·
`tests/api_f11_contrato.ps1` (formas + OpenAPI) ·
`tests/api_f12_sesiones_gdpr.ps1` (refresh/logout/GDPR/email) ·
`tests/api_f13_equipo_reset.ps1` (reset/equipo) ·
`tests/e2e/*.yaml` (Maestro móvil: `maestro test tests/e2e/viajero.yaml`).

## Apps (manual)
`cd apps/viajero && npm install && npx expo start --port 8081` (agente `--port 8082`), apuntando a `http://<tu-IP>:8000/api` vía `EXPO_PUBLIC_API_URL` en `apps/<app>/.env` (localhost no sirve desde el celular; emulador Android: `10.0.2.2`).
Checklist: login/logout/refresh, recupero, itinerario pull-refresh, crear offline+idempotente, réplica/reabrir, adjuntos+OCR, avisos, asistente, perfil GDPR; agente: buscador, panel, claim/derivar, copiloto, internas, bulk, métricas.

## Seguridad (verificado)
bcrypt cost 10-12 + salt · JWT HS256 `sub/rol/iat/exp/iss/jti` · refresh rotado 30d revocable · SecureStore · PDO prepared + `FOR UPDATE` · CHECKs · 401 genérico · 429 rate-limit · CORS allowlist + headers · errores sin traces/SQL · secretos en `.env` · GDPR borrado · cuentas desactivables.
