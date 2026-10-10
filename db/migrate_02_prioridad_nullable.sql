-- Migrate 02 (solo bases v2): prioridad nullable + triaje/SLA.
-- En una base instalada con el schema v3 actual esta migracion es no-op.
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

-- La FK de triado_por sigue al usuario (NO ACTION) en v2: se realinea a SET NULL.
DO $$ BEGIN
  ALTER TABLE incidentes DROP CONSTRAINT IF EXISTS incidentes_triado_por_fkey;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD CONSTRAINT incidentes_triado_por_fkey
    FOREIGN KEY (triado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Backfill: los Abierto sin triar quedan con prioridad NULL.
-- Solo en v2: en v3 la columna ya nace NULL y no hay nada que limpiar.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'incidentes' AND column_name = 'prioridad_sugerida') THEN
    RAISE NOTICE 'migrate_02: la base ya esta en v3, se omite el backfill.';
  ELSE
    UPDATE incidentes SET prioridad = NULL WHERE estado = 'Abierto';
  END IF;
END $$;

COMMIT;
