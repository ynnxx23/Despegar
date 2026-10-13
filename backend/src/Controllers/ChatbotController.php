<?php
// Chatbot + STT stub (Fase 4d). Reglas locales, sin proveedor externo.
// STT real: setear STT_PROVIDER (ej. whisper) e implementar envío en transcribir().
class ChatbotController {
  private const TIPOS_KW = [
    'Vuelo_cancelado' => ['cancel', 'cancelado', 'cancelaron'],
    'Vuelo_retrasado' => ['retras', 'demora', 'atras'],
    'Hotel_sin_reserva' => ['hotel', 'check-in', 'habitacion'],
    'Equipaje' => ['valija', 'equipaje', 'bolso', 'maleta'],
    'Cobro_indebido' => ['cobro', 'cobraron', 'duplicado', 'tarjeta', 'monto'],
    'Fraude' => ['fraude', 'estafa', 'estafaron', 'clonaron', 'phishing'],
  ];

  public static function borrador(PDO $db, array $claims, array $body): void {
    $texto = trim($body['texto'] ?? '');
    if (mb_strlen($texto) < 4) Response::error('Contanos un poco más (mín. 4 caracteres)', 400);
    $low = mb_strtolower($texto, 'UTF-8');
    $tipo = 'Otro';
    $best = 0;
    foreach (self::TIPOS_KW as $t => $kws) {
      $hits = 0;
      foreach ($kws as $kw) {
        if (mb_strpos($low, $kw) !== false) $hits++;
      }
      if ($hits > $best) {
        $best = $hits;
        $tipo = $t;
      }
    }
    // Código de reserva: patrón 2-4 letras + 3-5 dígitos (ej. AR1234, HTL889).
    $codigo = null;
    if (preg_match('/\b([A-Z]{2,4}\d{3,5})\b/', mb_strtoupper($texto, 'UTF-8'), $mm)) {
      $codigo = $mm[1];
    }
    $reservaId = null;
    if ($codigo) {
      $st = $db->prepare('SELECT id FROM reservas WHERE codigo = ? AND user_id = ? LIMIT 1');
      $st->execute([$codigo, (int)$claims['sub']]);
      $rid = $st->fetchColumn();
      if ($rid !== false) $reservaId = (int)$rid;
    }
    $palabras = preg_split('/\s+/', $texto, -1, PREG_SPLIT_NO_EMPTY);
    $titulo = mb_substr($texto, 0, 60);
    if (count($palabras) < 2) $titulo = "Consulta sobre {$tipo}";
    $faltantes = [];
    if (mb_strlen($titulo) < 5) $faltantes[] = 'título (mín. 5 caracteres)';
    if (mb_strlen($texto) < 10) $faltantes[] = 'descripción (mín. 10 caracteres)';
    if ($tipo === 'Otro' && $best === 0) $faltantes[] = 'tipo (elegí Vuelo/Hotel/Equipaje/Cobro/Fraude)';
    if (!$reservaId) $faltantes[] = 'reserva (opcional: indicá tu código, ej. AR1234)';
    Response::json(['data' => [
      'tipo_sugerido' => $tipo,
      'titulo_sugerido' => mb_substr($titulo, 0, 120),
      'descripcion_sugerida' => mb_substr($texto, 0, 2000),
      'reserva_id' => $reservaId,
      'codigo_detectado' => $codigo,
      'faltantes' => $faltantes,
      'listo' => count(array_filter($faltantes, fn($f) => !str_starts_with($f, 'reserva'))) === 0,
    ]], 200);
  }

  public static function transcribir(array $body): void {
    $b64 = $body['audio_base64'] ?? '';
    if (!is_string($b64) || $b64 === '') Response::error('audio_base64 requerido', 400);
    if (strlen($b64) > 7 * 1024 * 1024) Response::error('Audio muy grande (máx ~5MB)', 400);
    $bin = base64_decode($b64, true);
    if ($bin === false) Response::error('Base64 inválido', 400);
    $ext = preg_replace('/[^a-z0-9]/', '', strtolower((string)($body['formato'] ?? 'm4a')));
    if ($ext === '') $ext = 'm4a';
    if (!class_exists('Stt')) {
      Response::json(['data' => ['texto' => '', 'nota' => 'STT no configurado.']], 200);
    }
    $res = Stt::transcribir($bin, substr($ext, 0, 8));
    if ($res['stub']) {
      $prov = Config::get('STT_PROVIDER', '');
      Response::json(['data' => [
        'texto' => '',
        'nota' => $prov === ''
          ? 'STT no configurado: definí STT_PROVIDER=whisper + OPENAI_API_KEY para transcribir voz.'
          : 'No se pudo transcribir: grabá el borrador por texto.',
      ]], 200);
    }
    Response::json(['data' => ['texto' => $res['texto']]], 200);
  }
}
