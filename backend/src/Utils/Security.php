<?php
// Cabeceras de seguridad de la API.
class Security {
  public static function applyHeaders(): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Cross-Origin-Resource-Policy: same-site');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    if (self::esHttps()) {
      header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
  }

  public static function esHttps(): bool {
    $https = $_SERVER['HTTPS'] ?? '';
    if ($https !== '' && strtolower((string)$https) !== 'off') return true;
    if (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') return true;
    if (($_SERVER['SERVER_PORT'] ?? '') === '443') return true;
    return false;
  }
}
