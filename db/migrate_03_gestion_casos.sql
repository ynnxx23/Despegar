-- Migrate 03 (solo bases v2): gestion de casos (tipos, asignacion, eventos, seguidores).
-- En una base instalada con el schema v3 actual esta migracion es no-op.
-- Idempotente: guards DO $$ + IF NOT EXISTS. Requiere migrate_02 aplicada.
BEGIN;

DO $$
BEGIN
  -- La columna asignado_a junto con las tablas de gestion marcan el schema v3.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'incidentes' AND column_name = 'asignado_a') THEN
    RAISE NOTICE 'migrate_03: la base ya esta en v3, no se aplica.';
    RETURN;
  END IF;

  -- 1. CHECK de tipo: 7 valores. El viejo es implicito (schema.sql sin nombre -> incidentes_tipo_check).
  ALTER TABLE incidentes DROP CONSTRAINT IF EXISTS incidentes_tipo_check;

  ALTER TABLE incidentes ADD CONSTRAINT incidentes_tipo_check CHECK (tipo IN (
    'Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva',
    'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro'
  ));

  -- 2. Asignado (ADD si falta).
  ALTER TABLE incidentes ADD COLUMN asignado_a INT NULL REFERENCES usuarios(id) ON DELETE SET NULL;

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
    creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (incidente_id, agente_id)
  );
  CREATE INDEX IF NOT EXISTS idx_seguidores_agente ON incidente_seguidores (agente_id);
END $$;

COMMIT;
