# Plan sistema gestión errores completo + identidad + orden

> NOTA (post-`copia`): documento histórico. Plan original ejecutado al 100 %.
> Estado actual: contrato OpenAPI v1.4.1 (incluye `POST /admin/incidentes/:id/auditoria/resellar`),
> diagrama `flujo-apps.drawio` reparado (XML válido) + diagrama texto en `docs/api.md` §1b.
> Fuente vigente: `DOC_PROYECTO.md`, `DOC_DESARROLLO.md`, `docs/api.md`.

> Post `git pull b79c007`. Ya existe: triage/SLA/claim/derivar/seguir/historial/mi-cola, 7 tipos, tests F8.

## 1. Identidad visual Despegar (investigación)

Fuente: rebrand Saffron + REF+ (marzo 2019), análisis Cuestiones Diseño + SEDICI UNLP.
- Antes: azul+rojo apagado CMYK, logo minúscula + ".com" otro color + avión + timbre hotel.
- Después: simplificación pregnante. Imagotipo D mayúscula con extensión opacidad + wordmark "despegar" minúscula bold geométrica. Secundaria geométrica con corte descendentes.
- Paleta brillante: violeta dominante + celeste verdoso + naranja + azul brillante.
- Tono: cercano, simple, español rioplatense. Tarjetas blancas, botones grandes.

### Auditoría app vs identidad
Cumple: violeta #4300D2 dominante, tarjetas blancas radius 12-16, touch 48, textos rioplatense, Badge color+texto.
No cumplía: faltaba celeste verdoso + azul brillante + naranja real Despegar, sin logo D/wordmark, accent #FF6B35 desviado, hex sueltos fuera theme, `999` mágico, sin `surfaceHighlight/dangerBg/warningBg`.

### Ajustes aplicados este turno
- `apps/shared/theme.js`: suma `brand{violet/teal/orange/blue, logo D+despegar}`, colores `secondary #00B5AD`, `info #1E8CFF`, `accent #FF6A00`, `surfaceHighlight/dangerBg/warningBg`, `radius.pill`.
- `apps/shared/components.js`: nuevos `DespegarLogo`, `Screen`, `Card`, `Chip`. `Badge` usa `radius.pill`.
- `apps/shared/constants.js` (nuevo): TIPOS/PRIO/ESTADOS/TABS/SORTS/SLA_HORAS + etiquetas únicas.
- `apps/viajero/App.js` + `apps/agente/App.js`: header con `DespegarLogo`.
- `docker-compose.yml`: fix paths `../db`→`./db`, `../backend`→`./backend`.
- Uso futuro: migrar screens a `Screen/Card/Chip/constants`, reemplazar `#EDE7FB/#FDECEC/#FEF3C7` por tokens, naranja solo CTA crítico, teal para info/ayuda, azul para links/lectura.

## 2. Orden carpetas / legibilidad

Estado: `shared/` plano, `screens/` gigantes agente (Cola 485, Detalle 620), duplicación Login/health/TIPOS/estilos/chips, helpers negocio en screens, versión triplicada.

Hecho: `constants.js` + primitivas UI + logo.
Pendiente (sin romper):
1. `shared/ui/` → `Screen,Card,Chip,RetryLink,StatusDot` (ya creados base, falta migrar screens).
2. `shared/hooks/useApiList.js` → `data/error/refreshing/onRefresh` para MisIncidentes/Itinerario/Cola.
3. `shared/AuthForm.js` unifica login viajero/agente. `shared/HealthDot.js + useHealth()`.
4. Dividir: `MisIncidentesScreen` → +`DetalleIncidenteScreen`; `DetalleGestion` → `AccionCard/TriajeRow/HiloList/HistorialList`; `Cola` → `colaUtils.js`.
5. Mover `detalleReserva/rutaReserva/haceTiempo/slaInfo` a `shared/format.js`.
6. Versión única desde `app.json`/`Constants.expoConfig`, borrar hardcode.
7. Estructura final:
```
apps/shared/{theme,constants,api,auth,format,components.py→ui/} + hooks/
apps/viajero/{App,screens/,components/} apps/agente/{App,screens/,components/}
backend/src/{Config,Database,Middleware/,Models/,Controllers/,Utils/}
db/{schema.sql,seeds.sql,migrate_*.sql} docs/{api,app-viajero,app-agente}
```

## 3. Plan desarrollo — brechas + mejoras

### Fase 1 Endurecer (1-2 sem) — mínimo prod
- CORS allowlist + headers (`nosniff,DENY,HSTS`), JWT_SECRET ya fail-fast ok.
- Rate-limit login + lockout (10/min/IP), request-id + log estructurado.
- Transacciones `FOR UPDATE` en claim/derivar/release (race actual).
- Fix `crear_respuesta()` no reabre `Resuelto` silencioso → evento `reabierto`.
- Runner migraciones + `schema_migrations`, regenerar `schema.sql`, FK dura `triado_por`, CHECK `accion` evento.
- Índices `sla_vence_at,asignado_a,tipo`, paginación `mios/respuestas/historial`, health con check DB.
- `Idempotency-Key` en POST incidentes.

### Fase 2 Cierre loop (2-3 sem)
- Réplica viajero + reabrir/cancelar, estados `PendienteViajero/Escalado/Duplicado/Cerrado`, transición validada.
- Comentarios internos agente vs públicos.
- Adjuntos v1 (5MB jpg/png/pdf, S3/ClamAV), notif email+WebPush base, bulk + merge duplicados, tags.
- OpenAPI + `/v1`, `GET reservas/:id`, UNIQUE `reservas.codigo`, CHECK `reservas.estado`.

### Fase 3 SLA/SLO serio
- SLA configurable por tipo/prioridad, calendario laboral, pausa en espera, warnings 50/80%, escalado auto.
- Dashboard MTTA/MTTR/vencidos/por-agente, export CSV, auditoría IP/UA/diff antes-después, export legal.

### Fase 4 Innovación (10 extras)
1. IA-triage tipo+sentimiento+urgencia (score+explica, reemplaza KEYWORDS_BUMP).
2. Copiloto agente RAG + tono, un click enviar.
3. Resumen hilo IA + traducción ES/EN/PT.
4. SLA predictivo breach 6h antes + sugerir reasignar.
5. Offline-first cola POST+fotos + sync idempotente.
6. Push multicanal FCM/email/WhatsApp (responder/claim/breach/resuelto).
7. OCR adjuntos → autovincula `reserva_id`.
8. Dashboards realtime WS/SSE + heatmap + CSAT + ranking.
9. Auditoría hash encadenado + timeline visual + PDF legal.
10. Voz STT + chatbot crea borrador, comandos voz agente.

Criterio listo: Fase1 verde = prod mínimo. Fases 2-4 iterativas. Tests: migrar `.ps1` a PHPUnit + CI + fuzz/carga/contrato schema + e2e móvil.

## 4. Estado de implementación (actual)

- Fase 1 ✓ (migrate_04, `db_migrate.php`, CORS allowlist, rate-limit, claim/derivar transaccional, fix Resuelto, índices, paginación, idempotencia). F9.
- Fase 2 ✓ (réplica/reabrir, 7 estados + transiciones, notas internas, adjuntos v1, bulk/merge, OpenAPI). F9.
- Fase 3 ✓ (SLA en tabla, dashboard+CSV, riesgo <6h, auditoría IP/UA). F9.
- Fase 4 ✓ (migrate_05: IA heurística triage/copiloto/resumen/traducción, offline queue, push multicanal log/email/FCM/WhatsApp, OCR tesseract+fallback, dashboards realtime SSE, hash encadenado, chatbot+STT Whisper). F10.
- Identidad ✓ (tokens EVA reales `#4300D2`, pill 24, header blanco, logo D).
- Sesiones/GDPR ✓ (migrate_06: refresh rotado, logout, borrado, email verify). F12.
- Equipo/reset ✓ (migrate_07: alta/desactivar, reset 1h). F13.
- Docs/diagramas ✓ actualizados. Contrato F11 + e2e Maestro + CI.
- Pendiente real: claves FCM/WhatsApp/Whisper/OpenAI, panel web, carga/seguridad externa.
