-- Migrate 06: sesiones refresh + GDPR/verificación email. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expira_at TIMESTAMPTZ NOT NULL,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revocado BOOLEAN NOT NULL DEFAULT FALSE,
  ip VARCHAR(45) NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens (user_id, revocado);

DO $$ BEGIN
  ALTER TABLE usuarios ADD COLUMN email_verificado BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE usuarios ADD COLUMN email_token VARCHAR(64) NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE usuarios ADD COLUMN borrado_at TIMESTAMPTZ NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

INSERT INTO schema_migrations (version) VALUES ('06') ON CONFLICT DO NOTHING;
COMMIT;
