<?php
// RateLimit file-based sin dependencias: 10 intentos/min por IP+endpoint.
// Uso: RateLimit::check('login', $ip, 10, 60) -> true permite, false bloquea (llama Response 429).
class RateLimit {
  private static function dir(): string {
    $d = sys_get_temp_dir() . '/despegar_ratelimit';
    if (!is_dir($d)) @mkdir($d, 0770, true);
    return $d;
  }

  public static function hit(string $key, int $max, int $windowSec): bool {
    $file = self::dir() . '/' . preg_replace('/[^a-z0-9_\-]/i', '_', $key) . '.json';
    $now = time();
    $hits = [];
    if (file_exists($file)) {
      $raw = @file_get_contents($file);
      $hits = json_decode($raw ?: '[]', true);
      if (!is_array($hits)) $hits = [];
    }
    $hits = array_values(array_filter($hits, fn($t) => ($now - (int)$t) < $windowSec));
    if (count($hits) >= $max) {
      @file_put_contents($file, json_encode($hits), LOCK_EX);
      return false;
    }
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    return true;
  }

  public static function checkLogin(string $ip): void {
    $max = (int)Config::get('LOGIN_RATELIMIT', '10');
    if ($max < 1) $max = 10;
    if (!self::hit('login_' . $ip, $max, 60)) {
      Response::error('Demasiados intentos. Probá en un minuto.', 429, ['code' => 'RATE_LIMITED']);
    }
  }

  // Rate-limit global escritura: 120 req/min por IP (defensa básica anti-abuso).
  public static function checkGlobal(string $ip): void {
    $max = (int)Config::get('API_RATELIMIT', '120');
    if ($max < 1) return;
    if (!self::hit('api_' . $ip, $max, 60)) {
      Response::error('Demasiados pedidos. Probá en un minuto.', 429, ['code' => 'RATE_LIMITED']);
    }
  }
}
