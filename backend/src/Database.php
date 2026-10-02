<?php
// PDO singleton con prepared statements (anti SQLi). PostgreSQL 15.
class Database {
  private static ?PDO $pdo = null;
  public static function pdo(): PDO {
    if (self::$pdo) return self::$pdo;
    $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s',
      Config::get('DB_HOST', '127.0.0.1'), Config::get('DB_PORT', '5432'), Config::get('DB_NAME', 'despegar'));
    self::$pdo = new PDO($dsn, Config::get('DB_USER', 'root'), Config::get('DB_PASS', ''), [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return self::$pdo;
  }
}
