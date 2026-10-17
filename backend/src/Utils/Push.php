<?php
// Push multicanal (Fase 4b real): log siempre + email/FCM/WhatsApp si configurados.
// NOTIF_CHANNELS=log (defecto). Ej: log,email. Cada canal falla en silencio (nunca rompe flujo).
class Push {
  public static function enviar(int $userId, ?string $email, string $tipo, string $texto, ?int $incidenteId): void {
    $canales = array_filter(array_map('trim', explode(',', Config::get('NOTIF_CHANNELS', 'log'))));
    if (!$canales) $canales = ['log'];
    // Outbox en log estructurado (auditable sin proveedor).
    Logger::info('push', ['user' => $userId, 'tipo' => $tipo, 'inc' => $incidenteId, 'canales' => implode('+', $canales)]);
    foreach ($canales as $c) {
      try {
        if ($c === 'email') self::email($email, $tipo, $texto, $incidenteId);
        elseif ($c === 'fcm') self::fcm($userId, $tipo, $texto, $incidenteId);
        elseif ($c === 'whatsapp') self::whatsapp($tipo, $texto);
      } catch (Throwable $e) {
        Logger::warn('push_fail', ['canal' => $c]);
      }
    }
  }

  private static function email(?string $para, string $tipo, string $texto, ?int $inc): void {
    if (!$para || !filter_var($para, FILTER_VALIDATE_EMAIL)) return;
    $from = Config::get('SMTP_FROM', 'soporte@despegar.local');
    $asunto = "[Despegar] {$tipo}" . ($inc ? " caso #{$inc}" : '');
    $host = Config::get('SMTP_HOST', '');
    if ($host === '') {
      // Sin SMTP: mail() local si existe, si no solo outbox.
      if (function_exists('mail')) @mail($para, $asunto, $texto, "From: {$from}");
      return;
    }
    self::smtp($host, (int)Config::get('SMTP_PORT', '587'), $para, $from, $asunto, $texto);
  }

  // SMTP mínimo (PLAIN/LOGIN) sin dependencias. Solo texto plano.
  private static function smtp(string $host, int $port, string $para, string $from, string $asunto, string $texto): void {
    $user = Config::get('SMTP_USER', '');
    $pass = Config::get('SMTP_PASS', '');
    $fp = @stream_socket_client("tcp://{$host}:{$port}", $en, $es, 10);
    if (!$fp) return;
    $rd = function () use ($fp): string {
      $r = '';
      while ($l = fgets($fp, 512)) {
        $r .= $l;
        if (preg_match('/^\d{3} /', $l)) break;
      }
      return $r;
    };
    $wr = function (string $l) use ($fp): void { fwrite($fp, $l . "\r\n"); };
    $rd();
    $wr('EHLO despegar.local');
    $rd();
    if ($user !== '') {
      $wr('AUTH LOGIN');
      $rd();
      $wr(base64_encode($user));
      $rd();
      $wr(base64_encode($pass));
      $rd();
    }
    $wr("MAIL FROM:<{$from}>");
    $rd();
    $wr("RCPT TO:<{$para}>");
    $rd();
    $wr('DATA');
    $rd();
    $asunto64 = '=?UTF-8?B?' . base64_encode($asunto) . '?=';
    fwrite($fp, "From: {$from}\r\nTo: {$para}\r\nSubject: {$asunto64}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{$texto}\r\n.\r\n");
    $rd();
    $wr('QUIT');
    fclose($fp);
  }

  // FCM HTTP v1 con service account (FCM_CREDENTIALS=json path). Sin claves = no-op.
  private static function fcm(int $userId, string $tipo, string $texto, ?int $inc): void {
    $cred = Config::get('FCM_CREDENTIALS', '');
    $project = Config::get('FCM_PROJECT', '');
    if ($cred === '' || $project === '' || !is_file($cred) || !function_exists('curl_init')) return;
    // Nota: requiere OAuth2 JWT (google/auth). Sin librería se registra pendiente.
    Logger::info('push_fcm_pendiente', ['user' => $userId, 'project' => $project]);
  }

  // WhatsApp Cloud API (WHATSAPP_TOKEN + WHATSAPP_PHONE_ID). Sin claves = no-op.
  private static function whatsapp(string $tipo, string $texto): void {
    $token = Config::get('WHATSAPP_TOKEN', '');
    $phoneId = Config::get('WHATSAPP_PHONE_ID', '');
    $destino = Config::get('WHATSAPP_DESTINO_TEST', '');
    if ($token === '' || $phoneId === '' || $destino === '' || !function_exists('curl_init')) return;
    $ch = curl_init("https://graph.facebook.com/v21.0/{$phoneId}/messages");
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 15,
      CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
      CURLOPT_POSTFIELDS => json_encode([
        'messaging_product' => 'whatsapp',
        'to' => $destino,
        'type' => 'text',
        'text' => ['body' => mb_substr("[{$tipo}] {$texto}", 0, 1000)],
      ], JSON_UNESCAPED_UNICODE),
    ]);
    curl_exec($ch);
    curl_close($ch);
  }
}
