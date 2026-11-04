# Documentación privada del proyecto — Despegar Grupo 8

> **Carpeta NO versionada.** Está en `.git/info/exclude`, así que no entra al repo ni
> se sube a GitHub. Es material de trabajo para exponer el proyecto: podeś editarla,
>ampliarla o borrarla sin romper nada.
>
> Reconstruirla en otra PC: cloná el repo y creá la carpeta `yensel/` (o cambiá el
> nombre en `.git/info/exclude`).

## Qué hay acá

| Archivo | Para qué lo usás | Cuándo lo mirás |
|---|---|---|
| [`01-guion-de-exposicion.md`](01-guion-de-exposicion.md) | Guion de la exposición: qué mostrar, en qué orden, con qué frases, y las preguntas que seguro van a hacer | **Antes y durante la defensa** |
| [`02-arquitectura.md`](02-arquitectura.md) | Stack tecnológico, estructura del repo, flujo de una request, decisiones de arquitectura | Cuando pregunten "¿cómo está hecho?" |
| [`03-backend.md`](03-backend.md) | Router, middleware, controllers, models, JWT, refresh tokens, roles, cuotas, seguridad | Cuando pregunten por el backend / JWT / middleware |
| [`04-base-de-datos.md`](04-base-de-datos.md) | Schema v4 completo: tablas, columnas, índices, triggers, funciones, migraciones, seed | Cuando pregunten por el modelo de datos |
| [`05-apps.md`](05-apps.md) | Las dos apps Expo: capa compartida, sesión, pantallas, accesibilidad, build EAS | Cuando pregunten por el móvil |
| [`06-api.md`](06-api.md) | Referencia completa de endpoints, cuerpos, errores y códigos HTTP | Para consultar durante la demo |
| [`07-despliegue-y-operacion.md`](07-despliegue-y-operacion.md) | Railway, Docker, CI, scripts, costos, cómo prender/apagar la API | Cuando pregunten "¿cómo lo desplegaron?" |
| [`08-testing.md`](08-testing.md) | Qué tests existen, qué cubre cada uno, cómo correrlos, checklist manual | Cuando pregunten "¿cómo lo probaron?" |
| [`09-decisiones-y-limitaciones.md`](09-decisiones-y-limitaciones.md) | Decisiones técnicas con su porqué, límites conocidos y trabajo futuro | Para responder "¿qué mejoraría?" |

## Datos rápidos

- **Nombre:** Despegar — Gestión de Incidentes Críticos (Grupo 8)
- **Alcance:** 2 apps móviles (Expo/React Native) + 1 API REST (PHP 8.2 sin framework) + 1 base PostgreSQL
- **Roles:** `viajero` (cliente), `agente` (soporte), `admin` (administra usuarios y agentes)
- **API en producción:** `https://api-production-88975.up.railway.app/api`
- **Repositorio:** `github.com/ynnxx23/Despegar` (rama `main`)
- **Cuentas de prueba:** `datos.md` (en la raíz del repo) — 2 admins, 4 agentes, 6 viajeros
- **Tests:** 58 checks en PowerShell + 16 en Node (API) + 4 en Node (cliente móvil) → **78 automatizados**
- **CI:** GitHub Actions (PostgreSQL + PHP + Node) en cada push
- **APK Android:** builds de EAS en los proyectos `@ynnxx23/despegar-viajero` y `@ynnxx23/despegar-agente`

## Cómo usar esta carpeta

1. Leé `01-guion-de-exposicion.md` y adaptalo a tu tiempo de exposición.
2. Tené a mano `06-api.md` (referencia de endpoints) y `datos.md` (credenciales de
   prueba: 2 admins, 4 agentes y 6 viajeros).
3. Para repasar lo técnico: `03-backend.md` (autenticación y autorización) y
   `04-base-de-datos.md` (modelo de datos y decisiones de integridad).
4. **No subas esta carpeta al repo.** Si en algún momento querés versionar parte de
   esto, copiala a `docs/` y hacé `git add -f`.
