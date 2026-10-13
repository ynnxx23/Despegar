-- Migrate 05: Fase 4 innovación. Idempotente.
BEGIN;

-- 1. Base de conocimiento (copiloto RAG heurístico + FAQ por tipo).
CREATE TABLE IF NOT EXISTS base_conocimiento (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL,
  pregunta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  tags TEXT NULL,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO base_conocimiento (tipo, pregunta, respuesta, tags) VALUES
('Vuelo_cancelado', 'Vuelo cancelado, ¿qué hago?', 'Te reprogramamos o gestionamos el reembolso. Decinos N° de vuelo, aeropuerto y qué te ofreció la aerolínea.', 'reprogramacion,reembolso'),
('Vuelo_retrasado', 'Vuelo retrasado, ¿qué hago?', 'Revisamos tu conexión y compensaciones. Decinos N° de vuelo, horas de demora y aeropuerto.', 'conexion,compensacion'),
('Hotel_sin_reserva', 'Hotel sin reserva, ¿qué hago?', 'Contactamos al hotel y te reubicamos. Decinos hotel, ciudad, fecha de check-in y código de reserva.', 'reubicacion'),
('Equipaje', 'Equipaje perdido, ¿qué hago?', 'Abrimos el reclamo con la aerolínea. Describí la valija, N° de reclamo y último lugar visto.', 'reclamo'),
('Cobro_indebido', 'Cobro indebido, ¿qué hago?', 'Bloqueamos el cobro duplicado con el proveedor. Indicá monto, fecha y últimos 4 dígitos (nunca el número completo).', 'reembolso'),
('Fraude', 'Fraude, ¿qué hago?', 'Protegemos tu cuenta y bloqueamos el cobro. Describí fecha, monto y canal de contacto, sin claves ni CBU completos.', 'seguridad'),
('Otro', 'Otro problema, ¿qué hago?', 'Lo revisamos con el equipo. Contanos con detalle qué pasó, fecha y código de reserva si tenés.', 'general')
ON CONFLICT DO NOTHING;

-- 2. Notificaciones in-app (push real vía FCM/email queda stub log).
CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  incidente_id INT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL,
  texto TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notificaciones (user_id, leida, creado_at DESC);

-- 3. Auditoría hash encadenado (inmutable verificable).
DO $$ BEGIN
  ALTER TABLE incidente_eventos ADD COLUMN hash_prev VARCHAR(64) NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidente_eventos ADD COLUMN hash VARCHAR(64) NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. IA heurística: score + explicación persistidos.
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN ia_score NUMERIC(3,2) NULL CHECK (ia_score IS NULL OR (ia_score >= 0 AND ia_score <= 1));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidentes ADD COLUMN ia_explica TEXT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. OCR heurístico en adjuntos.
DO $$ BEGIN
  ALTER TABLE incidente_adjuntos ADD COLUMN ocr_texto TEXT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE incidente_adjuntos ADD COLUMN reserva_detectada INT NULL REFERENCES reservas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

INSERT INTO schema_migrations (version) VALUES ('05') ON CONFLICT DO NOTHING;
COMMIT;
