<?php
// Log estructurado JSON a error_log: requestId, método, ruta, nivel, mensaje.
// PII redactada: nunca loguea password/token/mensaje completo.
class Logger {
  public static string $requestId = '';

  public static function init(): void {
    try {
      self::$requestId = bin2hex(random_bytes(8));
    } catch (Throwable $e) {
      self::$requestId = uniqid('req_', true);
    }
  }

  public static function info(string $msg, array $ctx = []): void {
    self::write('INFO', $msg, $ctx);
  }

  public static function warn(string $msg, array $ctx = []): void {
    self::write('WARN', $msg, $ctx);
  }

  public static function error(string $msg, array $ctx = []): void {
    self::write('ERROR', $msg, $ctx);
  }

  private static function write(string $level, string $msg, array $ctx): void {
    $rec = [
      'ts' => gmdate('c'),
      'level' => $level,
      'req' => self::$requestId,
      'method' => $_SERVER['REQUEST_METHOD'] ?? '',
      'path' => parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH),
      'msg' => $msg,
    ] + $ctx;
    // Redacta secretos si alguien los pasa por error.
    foreach (['password', 'token', 'authorization'] as $k) {
      if (isset($rec[$k])) $rec[$k] = '[redacted]';
    }
    error_log(json_encode($rec, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
  }
}
