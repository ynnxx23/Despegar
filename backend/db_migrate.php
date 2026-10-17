<?php
// Runner migraciones: aplica db/migrate_*.sql en orden, registra en schema_migrations.
// Uso: php backend/db_migrate.php (requiere backend/.env). Idempotente.
require_once __DIR__ . '/src/Config.php';
require_once __DIR__ . '/src/Database.php';

Config::load(__DIR__ . '/.env');

try {
  $db = Database::pdo();
} catch (Throwable $e) {
  fwrite(STDERR, 'DB connect: ' . $e->getMessage() . PHP_EOL);
  exit(1);
}

$db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(20) PRIMARY KEY, aplicado_at TIMESTAMPTZ NOT NULL DEFAULT now())');

$files = glob(__DIR__ . '/../db/migrate_*.sql');
sort($files);
$ok = 0;
foreach ($files as $f) {
  $base = basename($f, '.sql'); // migrate_02_... -> version "02"
  if (!preg_match('/^migrate_(\d+)_/', $base, $mm)) {
    echo "SKIP {$base} (nombre no esperado)" . PHP_EOL;
    continue;
  }
  $ver = $mm[1];
  $st = $db->prepare('SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1');
  $st->execute([$ver]);
  if ($st->fetchColumn()) {
    echo "SKIP {$base} (ya aplicada)" . PHP_EOL;
    continue;
  }
  $sql = file_get_contents($f);
  try {
    $db->exec($sql);
  } catch (Throwable $e) {
    // Migraciones 02-05 son idempotentes con guards; si falla a mitad, se reporta.
    fwrite(STDERR, "FAIL {$base}: " . $e->getMessage() . PHP_EOL);
    exit(1);
  }
  // migrate_04/05 se auto-registran; asegura registro para 02/03 también.
  $st = $db->prepare('INSERT INTO schema_migrations (version) VALUES (?) ON CONFLICT DO NOTHING');
  $st->execute([$ver]);
  echo "OK {$base}" . PHP_EOL;
  $ok++;
}
echo "Listo: {$ok} migraciones aplicadas." . PHP_EOL;
