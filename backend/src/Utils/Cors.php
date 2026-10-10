<?php
// CORS configurable desde el entorno.
//   CORS_ORIGIN vacio  -> sin cabeceras CORS (solo apps nativas y mismo origen).
//   CORS_ORIGIN "*"   -> cualquier origen (solo desarrollo).
//   CORS_ORIGIN "https://a.com,https://b.com" -> allowlist.
class Cors {
  public static function apply(): void {
    $configurado = trim(Config::get('CORS_ORIGIN', ''));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($configurado === '*') {
      if (strtolower(Config::get('APP_ENV', 'development')) === 'production') {
        error_log('CORS_ORIGIN="*" con APP_ENV=production: revisa la configuracion.');
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
