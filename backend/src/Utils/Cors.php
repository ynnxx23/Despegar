<?php
// CORS configurable desde el entorno (CORS_ORIGIN).
class Cors {
  public static function apply(): void {
    $configurado = trim(Config::get('CORS_ORIGIN', ''));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($configurado === '*') {
      if (strtolower(Config::get('APP_ENV', 'development')) === 'production') {
        error_log('CORS_ORIGIN="*" con APP_ENV=production: revisar configuracion.');
      }
      header('Access-Control-Allow-Origin: *');
    } elseif ($configurado !== '' && $origin !== '' && self::permitido($origin, $configurado)) {
      header('Access-Control-Allow-Origin: ' . $origin);
      header('Vary: Origin');
    }

    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  }

  private static function permitido(string $origin, string $lista): bool {
    foreach (explode(',', $lista) as $permitido) {
      if (trim($permitido) === $origin) return true;
    }
    return false;
  }
}
