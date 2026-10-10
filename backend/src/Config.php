<?php
// Lee backend/.env (por clave=valor, sin librerías externas).
class Config {
  private static array $vars = [];
  public static function load(string $path): void {
    if (!file_exists($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
      $line = trim($line);
      if ($line === '' || $line[0] === '#' || $line[0] === ';') continue;
      [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
      self::$vars[trim($k)] = trim($v);
    }
  }
  public static function get(string $key, string $def = ''): string {
    return $_ENV[$key] ?? getenv($key) ?: (self::$vars[$key] ?? $def);
  }
}
