<?php
// PDO singleton con prepared statements (anti SQLi). PostgreSQL 15.
class Database {
  private static ?PDO $pdo = null;
  public static function pdo(): PDO {
    if (self::$pdo) return self::$pdo;
    [$host, $port, $name, $user, $pass] = self::target();
    $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $host, $port, $name);
    self::$pdo = new PDO($dsn, $user, $pass, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return self::$pdo;
  }

  // Local: DB_* del backend/.env. Railway/PaaS: DATABASE_URL del plugin Postgres.
  private static function target(): array {
    $host = Config::get('DB_HOST', '');
    if ($host !== '') {
      return [$host, Config::get('DB_PORT', '5432'), Config::get('DB_NAME', 'despegar'),
              Config::get('DB_USER', 'root'), Config::get('DB_PASS', '')];
    }
    $url = Config::get('DATABASE_URL', '');
    if ($url !== '') {
      $p = parse_url($url);
      if (!is_array($p) || !isset($p['host'])) {
        throw new RuntimeException('DATABASE_URL inválida o ausente');
      }
      return [
        $p['host'],
        isset($p['port']) ? (string)$p['port'] : '5432',
        ltrim(isset($p['path']) ? $p['path'] : '/despegar', '/'),
        isset($p['user']) ? rawurldecode($p['user']) : 'root',
        isset($p['pass']) ? rawurldecode($p['pass']) : '',
      ];
    }
    return ['127.0.0.1', '5432', 'despegar', 'root', ''];
  }
}
