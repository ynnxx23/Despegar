#!/bin/sh
# Pre-deploy de Railway: inicializa la BD solo si esta vacia (nunca borra datos).
# Con tablas existentes aplica seeds + migraciones idempotentes.
set -eu
cd /app/db
PSQL="psql $DATABASE_URL -v ON_ERROR_STOP=1 -q"
tables=$($PSQL -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
if [ "$tables" -eq 0 ]; then
  echo "[init-db] BD vacia: schema + seeds"
  $PSQL -f schema.sql
  $PSQL -f seeds.sql
else
  echo "[init-db] BD con tablas: seeds + migraciones"
  $PSQL -f seeds.sql
  for f in migrate_02_prioridad_nullable.sql migrate_03_gestion_casos.sql migrate_04_refresh_tokens.sql migrate_05_admin_auditoria.sql migrate_06_seed_demo_grande.sql; do
    $PSQL -f "$f"
  done
fi
echo "[init-db] OK"
