-- Migrate 02: prioridad nullable + triaje/SLA (P0).
-- Prioridad pasa a NULL hasta que un agente tria; cerrar a Resuelto exige prioridad.
BEGIN;

-- Quita default y NOT NULL de prioridad (idempotente con guards).
DO $$ BEGIN
  ALTER TABLE incidentes ALTER COLUMN prioridad DROP DEFAULT;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ALTER COLUMN prioridad DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Columnas de triaje/SLA (solo ADD si faltan).
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN triado_por INT NULL REFERENCES usuarios(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN triado_at TIMESTAMPTZ NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN prioridad_motivo TEXT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN sla_vence_at TIMESTAMPTZ NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN prioridad_sugerida VARCHAR(10) NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Backfill: los Abierto sin triar quedan con prioridad NULL.
UPDATE incidentes SET prioridad = NULL WHERE estado = 'Abierto';

COMMIT;
