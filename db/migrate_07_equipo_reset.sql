-- Migrate 07: reset password + equipo activo. Idempotente.
BEGIN;

DO $$ BEGIN
  ALTER TABLE usuarios ADD COLUMN reset_token VARCHAR(64) NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE usuarios ADD COLUMN reset_expira TIMESTAMPTZ NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE usuarios ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

INSERT INTO schema_migrations (version) VALUES ('07') ON CONFLICT DO NOTHING;
COMMIT;
