-- Migrate 03: gestion de casos (tipos, asignacion, eventos, seguidores).
-- Idempotente: guards DO $$ + IF NOT EXISTS. Requiere migrate_02 aplicada.
BEGIN;

-- 1. CHECK de tipo: 7 valores. El viejo es implicito (schema.sql sin nombre -> incidentes_tipo_check).
DO $$ BEGIN
  ALTER TABLE incidentes DROP CONSTRAINT IF EXISTS incidentes_tipo_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE incidentes ADD CONSTRAINT incidentes_tipo_check CHECK (tipo IN (
    'Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva',
    'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Asignado (ADD si falta).
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN asignado_a INT NULL REFERENCES usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Tabla de eventos (auditoria de gestion).
CREATE TABLE IF NOT EXISTS incidente_eventos (
  id SERIAL PRIMARY KEY,
  incidente_id INT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  actor_id INT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  accion VARCHAR(30) NOT NULL,
  detalle TEXT NULL,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_incidente ON incidente_eventos (incidente_id, creado_at);

-- 4. Tabla de seguidores (agentes suscritos).
CREATE TABLE IF NOT EXISTS incidente_seguidores (
  incidente_id INT NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  agente_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (incidente_id, agente_id)
);
CREATE INDEX IF NOT EXISTS idx_seguidores_agente ON incidente_seguidores (agente_id);

COMMIT;
