<?php
// STT: Whisper real si STT_PROVIDER=whisper + OPENAI_API_KEY, si no stub honesto.
class Stt {
  public static function transcribir(string $audioBin, string $ext = 'm4a'): array {
    $prov = Config::get('STT_PROVIDER', '');
    if ($prov !== 'whisper' || Config::get('OPENAI_API_KEY', '') === '') {
      Logger::info('stt_stub', ['provider' => $prov ?: 'none']);
      return ['texto' => '', 'stub' => true];
    }
    if (!function_exists('curl_init')) {
      Logger::warn('stt_sin_curl');
      return ['texto' => '', 'stub' => true];
    }
    $tmp = sys_get_temp_dir() . '/stt_' . bin2hex(random_bytes(6)) . '.' . $ext;
    @file_put_contents($tmp, $audioBin, LOCK_EX);
    try {
      $ch = curl_init('https://api.openai.com/v1/audio/transcriptions');
      curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . Config::get('OPENAI_API_KEY', '')],
        CURLOPT_POSTFIELDS => [
          'file' => new CURLFile($tmp, 'audio/' . $ext, 'audio.' . $ext),
          'model' => Config::get('WHISPER_MODEL', 'whisper-1'),
          'language' => 'es',
        ],
      ]);
      $raw = curl_exec($ch);
      $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);
      if ($code < 200 || $code >= 300 || !is_string($raw)) {
        Logger::warn('stt_http', ['code' => $code]);
        return ['texto' => '', 'stub' => true];
      }
      $dec = json_decode($raw, true);
      $texto = trim((string)($dec['text'] ?? ''));
      Logger::info('stt_ok', ['chars' => mb_strlen($texto)]);
      return ['texto' => mb_substr($texto, 0, 2000), 'stub' => false];
    } finally {
      @unlink($tmp);
    }
  }
}
