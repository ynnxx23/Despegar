<?php
// OCR: tesseract real si está instalado (OCR_ENABLED=1 + binario disponible),
// fallback heurístico (códigos en nombre/hilo). Nunca rompe el flujo.
class Ocr {
  public static function disponible(): bool {
    if (Config::get('OCR_ENABLED', '1') !== '1') return false;
    $bin = Config::get('TESSERACT_BIN', 'tesseract');
    $out = [];
    $code = 1;
    @exec(escapeshellarg($bin) . ' --version 2>&1', $out, $code);
    return $code === 0;
  }

  // Extrae texto de imagen/pdf (1ª página). Retorna '' si no disponible.
  public static function extraer(string $rutaAbs, string $mime): string {
    if (!self::disponible() || !is_file($rutaAbs)) return '';
    $bin = Config::get('TESSERACT_BIN', 'tesseract');
    $tmp = sys_get_temp_dir() . '/ocr_' . bin2hex(random_bytes(6));
    $cmd = escapeshellarg($bin) . ' ' . escapeshellarg($rutaAbs) . ' ' . escapeshellarg($tmp) . ' -l spa+eng 2>&1';
    $out = [];
    $code = 1;
    @exec($cmd . ' 2>&1', $out, $code);
    $txt = is_file($tmp . '.txt') ? @file_get_contents($tmp . '.txt') : '';
    @unlink($tmp . '.txt');
    if (!is_string($txt)) return '';
    $txt = trim(mb_substr($txt, 0, 2000));
    Logger::info('ocr', ['mime' => $mime, 'chars' => mb_strlen($txt)]);
    return $txt;
  }

  // Códigos de reserva en cualquier texto: 2-4 letras + 3-5 dígitos.
  public static function codigos(string $texto): array {
    $codigos = [];
    if (preg_match_all('/\b([A-Z]{2,4}\d{3,5})\b/', mb_strtoupper($texto, 'UTF-8'), $mm)) {
      $codigos = array_values(array_unique($mm[1]));
    }
    return $codigos;
  }
}
