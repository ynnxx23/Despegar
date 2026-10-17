<?php
// IA heurística sin dependencias externas (Fase 4a).
// Clasificador tipo+sentimiento+urgencia con score 0-1 y explicación.
// Interfaz lista para reemplazar por modelo real (mismo contrato).
class IaHeuristica {
  private const PESO_TIPO = [
    'Fraude' => 0.85, 'Vuelo_cancelado' => 0.65, 'Hotel_sin_reserva' => 0.6,
    'Equipaje' => 0.55, 'Cobro_indebido' => 0.6, 'Vuelo_retrasado' => 0.3, 'Otro' => 0.25,
  ];
  private const KEYWORDS = [
    'urgente' => 0.15, 'varad' => 0.2, 'hoy' => 0.1, 'ahora' => 0.12, 'estafa' => 0.15,
    'menor' => 0.15, 'salud' => 0.18, 'hospital' => 0.18, 'embarazada' => 0.18,
    'discapacidad' => 0.15, 'cancelado' => 0.08, 'reembolso' => 0.05, 'noche' => 0.05,
    'aeropuerto' => 0.05, 'estaf' => 0.12, 'cobro' => 0.05, 'duplicado' => 0.08,
  ];

  // Score urgencia 0-1 + nivel + explicación. Puro y testeable.
  public static function score(string $tipo, string $titulo, string $descripcion): array {
    $base = self::PESO_TIPO[$tipo] ?? 0.25;
    $texto = mb_strtolower($titulo . ' ' . $descripcion, 'UTF-8');
    $hits = [];
    $sum = 0.0;
    foreach (self::KEYWORDS as $kw => $peso) {
      if (mb_strpos($texto, $kw) !== false) {
        $hits[] = $kw;
        $sum += $peso;
      }
    }
    // Urgencia tipográfica: mayúsculas y exclamaciones (máx +0.1).
    $mays = preg_match_all('/[A-ZÁÉÍÓÚÑ]{4,}/u', $titulo . ' ' . $descripcion);
    $excl = substr_count($titulo . ' ' . $descripcion, '!');
    $tipografica = min(0.1, $mays * 0.02 + $excl * 0.03);
    $score = min(1.0, round($base + min(0.35, $sum) + $tipografica, 2));
    $nivel = $score >= 0.75 ? 'Critica' : ($score >= 0.45 ? 'Alta' : 'Baja');
    $explica = "Base tipo {$tipo} ({$base})";
    if ($hits) $explica .= ' + palabras: ' . implode(', ', array_slice($hits, 0, 5));
    if ($tipografica > 0) $explica .= ' + énfasis tipográfico';
    $explica .= " = {$score} ({$nivel})";
    return ['score' => $score, 'nivel' => $nivel, 'explica' => $explica, 'hits' => $hits];
  }

  // Copiloto: plantilla por tipo + datos del caso + tono. Un click enviar/editar (no envía solo).
  public static function sugerirRespuesta(string $tipo, string $titulo, ?string $nombreViajero, string $tono = 'cercano'): array {
    $plantillas = [
      'Vuelo_cancelado' => 'Te conseguimos reprogramación o reembolso. Ya contactamos a la aerolínea con tu N° de vuelo.',
      'Vuelo_retrasado' => 'Revisamos tu conexión y compensaciones con la aerolínea.',
      'Hotel_sin_reserva' => 'Contactamos al hotel para reubicarte sin costo adicional.',
      'Equipaje' => 'Abrimos el reclamo de equipaje con la aerolínea y lo seguimos por vos.',
      'Cobro_indebido' => 'Bloqueamos el cobro duplicado con el proveedor y gestionamos el reembolso.',
      'Fraude' => 'Protegimos tu cuenta y bloqueamos el cobro. No compartas claves ni CBU por este medio.',
      'Otro' => 'Ya estamos trabajando en tu caso con el equipo correspondiente.',
    ];
    $cuerpo = $plantillas[$tipo] ?? $plantillas['Otro'];
    $saludo = $nombreViajero ? "Hola {$nombreViajero}, " : 'Hola, ';
    $cierre = $tono === 'formal'
      ? ' Quedamos a disposición. Saludos, equipo Despegar.'
      : ' Te avisamos cada novedad por acá. ¡Gracias por avisarnos!';
    $texto = $saludo . "sobre \"{$titulo}\": {$cuerpo}{$cierre}";
    if (mb_strlen($texto) > 2000) $texto = mb_substr($texto, 0, 2000);
    return ['texto' => $texto, 'tono' => $tono, 'fuente' => 'plantilla:' . $tipo];
  }

  // Resumen extractivo: primera + más larga + última (máx 3 viñetas).
  public static function resumir(array $mensajes): array {
    $msgs = array_values(array_filter(array_map('trim', $mensajes)));
    if (!$msgs) return ['puntos' => [], 'n' => 0];
    $puntos = [];
    $puntos[] = $msgs[0];
    if (count($msgs) > 2) {
      $larga = $msgs[0];
      foreach ($msgs as $m) {
        if (mb_strlen($m) > mb_strlen($larga)) $larga = $m;
      }
      if ($larga !== $msgs[0] && $larga !== end($msgs)) $puntos[] = $larga;
    }
    if (count($msgs) > 1) $puntos[] = end($msgs);
    $puntos = array_slice(array_values(array_unique($puntos)), 0, 3);
    return ['puntos' => $puntos, 'n' => count($msgs)];
  }

  // Traducción básica honesta: mapa de frases frecuentes ES->EN/PT, resto original.
  public static function traducir(string $texto, string $lang): string {
    $lang = strtolower($lang);
    if (!in_array($lang, ['en', 'pt'], true)) return $texto;
    $mapEn = [
      'Vuelo cancelado' => 'Cancelled flight', 'Vuelo retrasado' => 'Delayed flight',
      'Hotel sin reserva' => 'Hotel without reservation', 'reembolso' => 'refund',
      'reprogramación' => 'rebooking', 'Gracias' => 'Thank you', 'Hola' => 'Hi',
      'resuelto' => 'resolved', 'reabierto' => 'reopened',
    ];
    $mapPt = [
      'Vuelo cancelado' => 'Voo cancelado', 'Vuelo retrasado' => 'Voo atrasado',
      'Hotel sin reserva' => 'Hotel sem reserva', 'reembolso' => 'reembolso',
      'reprogramación' => 'remarcação', 'Gracias' => 'Obrigado', 'Hola' => 'Olá',
      'resuelto' => 'resolvido', 'reabierto' => 'reaberto',
    ];
    $map = $lang === 'en' ? $mapEn : $mapPt;
    return strtr($texto, $map);
  }
}
