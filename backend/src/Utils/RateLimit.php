<?php
// Limitador de peticiones por clave (IP, email, etc.) con archivo y flock.
// El server embebido de PHP corre varios workers (PHP_CLI_SERVER_WORKERS),
// asi que un contador en memoria no serviria: cada proceso contaria aparte.
class RateLimit {
  /** @return array{ok:bool, restantes:int, reinicia_en:int} */
  public static function hit(string $clave, int $max, int $ventanaSegundos): array {
    $dir = self::dir();
    if ($dir === null) {
      // Sin filesystem escribible: se deja pasar (fail-open) y se avisa en el log.
      error_log('RateLimit: sin directorio writable, se omite el limite de ' . $clave);
      return ['ok' => true, 'restantes' => $max, 'reinicia_en' => 0];
    }
    $archivo = $dir . '/' . hash('sha256', $clave) . '.json';
    $ahora = time();

    $fh = @fopen($archivo, 'c+');
    if ($fh === false) {
      error_log('RateLimit: no se pudo abrir el archivo de cuota');
      return ['ok' => true, 'restantes' => $max, 'reinicia_en' => 0];
    }
    try {
      flock($fh, LOCK_EX);
      $contenido = stream_get_contents($fh);
      $estado = $contenido ? json_decode($contenido, true) : null;
      if (!is_array($estado) || !isset($estado['expira'], $estado['n'])) {
        $estado = ['n' => 0, 'expira' => $ahora + $ventanaSegundos];
      }
      if ($estado['expira'] <= $ahora) {
        $estado = ['n' => 0, 'expira' => $ahora + $ventanaSegundos];
      }
      $estado['n'] = (int)$estado['n'] + 1;
      $restantes = max(0, $max - (int)$estado['n']);
      $reinicia = max(0, (int)$estado['expira'] - $ahora);

      ftruncate($fh, 0);
      rewind($fh);
      fwrite($fh, json_encode($estado));
      fflush($fh);

      // Limpieza oportunista de cuotas viejas (no bloquea el flujo).
      if (random_int(1, 100) === 1) self::limpiar($dir, $ahora);

      return ['ok' => (int)$estado['n'] <= $max, 'restantes' => $restantes, 'reinicia_en' => $reinicia];
    } finally {
      flock($fh, LOCK_UN);
      fclose($fh);
    }
  }

  // Devuelve 429 si la cuota se paso. $mensaje va al cliente.
  public static function exigir(string $clave, int $max, int $ventanaSegundos, string $mensaje): void {
    $r = self::hit($clave, $max, $ventanaSegundos);
    if ($r['ok']) return;
    header('Retry-After: ' . max(1, $r['reinicia_en']));
    Response::error($mensaje, 429, ['reintenta_en_segundos' => $r['reinicia_en']]);
  }

  private static function dir(): ?string {
    $base = dirname(__DIR__, 2) . '/var/ratelimit';
    if (!is_dir($base)) {
      @mkdir($base, 0775, true);
    }
    if (is_dir($base) && is_writable($base)) return $base;
    $tmp = sys_get_temp_dir() . '/despegar-ratelimit';
    if (!is_dir($tmp)) @mkdir($tmp, 0775, true);
    if (is_dir($tmp) && is_writable($tmp)) return $tmp;
    return null;
  }

  private static function limpiar(string $dir, int $ahora): void {
    $archivos = @glob($dir . '/*.json');
    if (!$archivos) return;
    foreach ($archivos as $a) {
      $contenido = @file_get_contents($a);
      $estado = $contenido ? json_decode($contenido, true) : null;
      if (is_array($estado) && isset($estado['expira']) && (int)$estado['expira'] < $ahora - 3600) {
        @unlink($a);
      }
    }
  }
}
