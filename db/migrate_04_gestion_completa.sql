-- Migrate 04: gestión completa Fase 1/2/3. Idempotente.
BEGIN;

-- 0. Tabla control migraciones.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(20) PRIMARY KEY,
  aplicado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Estados extendidos: PendienteViajero, Escalado, Duplicado, Cerrado.
DO $$ BEGIN
  ALTER TABLE incidentes DROP CONSTRAINT IF EXISTS incidentes_estado_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD CONSTRAINT incidentes_estado_check CHECK (estado IN (
    'Abierto', 'EnGestion', 'PendienteViajero', 'Escalado', 'Resuelto', 'Duplicado', 'Cerrado'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Prioridad CHECK explícito (nullable ya desde migrate_02).
DO $$ BEGIN
  ALTER TABLE incidentes DROP CONSTRAINT IF EXISTS incidentes_prioridad_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD CONSTRAINT incidentes_prioridad_check CHECK (prioridad IN ('Baja', 'Alta', 'Critica'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. FK dura triado_por si falta (migrate_02 ya la crea; esto cubre BD viejas).
DO $$ BEGIN
  ALTER TABLE incidentes ADD CONSTRAINT fk_incidentes_triado FOREIGN KEY (triado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Eventos: CHECK accion + columnas auditoría IP/UA.
DO $$ BEGIN
  ALTER TABLE incidente_eventos ADD CONSTRAINT incidente_eventos_accion_check CHECK (accion IN (
    'creado', 'claim', 'release', 'derivar', 'seguir', 'dejar_seguir', 'responder',
    'respuesta_viajero', 'estado', 'prioridad', 'triaje', 'resuelto', 'reabierto',
    'cancelado', 'bulk', 'merge', 'adjunto', 'escalado'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidente_eventos ADD COLUMN ip VARCHAR(45) NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidente_eventos ADD COLUMN user_agent TEXT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Respuestas: flag interna (agente) vs pública.
DO $$ BEGIN
  ALTER TABLE respuestas ADD COLUMN es_interna BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 6. Idempotencia POST incidentes.
CREATE TABLE IF NOT EXISTS incidente_idempotencia (
  key VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  incidente_id INT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Adjuntos v1 (base64, 5MB, jpg/png/pdf).
CREATE TABLE IF NOT EXISTS incidente_adjuntos (
  id SERIAL PRIMARY KEY,
  incidente_id INT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  autor_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(160) NOT NULL,
  mime VARCHAR(80) NOT NULL,
  bytes INT NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  ruta TEXT NOT NULL,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adjuntos_incidente ON incidente_adjuntos (incidente_id);

-- 8. Índices calientes SLA/asignación/tipo/búsqueda.
CREATE INDEX IF NOT EXISTS idx_incidentes_sla ON incidentes (sla_vence_at) WHERE estado <> 'Resuelto';
CREATE INDEX IF NOT EXISTS idx_incidentes_asignado ON incidentes (asignado_a) WHERE asignado_a IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidentes_tipo ON incidentes (tipo);
CREATE INDEX IF NOT EXISTS idx_incidentes_titulo_trgm ON incidentes (titulo);
CREATE INDEX IF NOT EXISTS idx_eventos_actor ON incidente_eventos (actor_id);

-- 9. Reservas: UNIQUE codigo + CHECK estado.
DO $$ BEGIN
  ALTER TABLE reservas ADD CONSTRAINT reservas_codigo_unique UNIQUE (codigo);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE reservas ADD CONSTRAINT reservas_estado_check CHECK (estado IN ('Confirmada', 'Cancelada', 'Completada', 'Reprogramada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. SLA política configurable por prioridad.
CREATE TABLE IF NOT EXISTS sla_politicas (
  prioridad VARCHAR(10) PRIMARY KEY CHECK (prioridad IN ('Baja', 'Alta', 'Critica')),
  horas INT NOT NULL CHECK (horas BETWEEN 1 AND 720),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO sla_politicas (prioridad, horas) VALUES ('Critica', 4), ('Alta', 24), ('Baja', 72)
ON CONFLICT (prioridad) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('04') ON CONFLICT DO NOTHING;
COMMIT;
