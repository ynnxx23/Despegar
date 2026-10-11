-- Despegar Grupo 8 — migración 06: seed demo grande (datos de arranque).
-- Para bases que ya tienen el schema v3/v4: agrega los usuarios, reservas,
-- incidentes y respuestas de demostración sin borrar nada.
-- Es idempotente: correrla dos veces no duplica filas.
--
-- Aplica db/seed_demo.sql (define la rutina) y la ejecuta.

\ir seed_demo.sql

CALL sembrar_demo();
