<?php
// Adjuntos v1: JSON base64 {nombre, mime, data_base64}. Máx 5MB, jpg/png/pdf.
// Guarda archivo en backend/uploads (gitignored) + metadata en incidente_adjuntos.
class AdjuntosController {
  private const MAX_BYTES = 5242880;
  private const MIMES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];

  private static function puedeVer(PDO $db, array $claims, int $incidenteId): array {
    $st = $db->prepare('SELECT * FROM incidentes WHERE id = ? LIMIT 1');
    $st->execute([$incidenteId]);
    $inc = $st->fetch();
    if (!$inc) Response::error('Incidente no encontrado', 404);
    if (($claims['rol'] ?? '') === 'viajero' && (int)$inc['user_id'] !== (int)($claims['sub'] ?? 0)) {
      Response::error('Permiso denegado', 403);
    }
    return $inc;
  }

  public static function listar(PDO $db, array $claims, int $incidenteId): void {
    self::puedeVer($db, $claims, $incidenteId);
    try {
      $st = $db->prepare('SELECT id, nombre, mime, bytes, creado_at FROM incidente_adjuntos WHERE incidente_id = ? ORDER BY creado_at ASC LIMIT 50');
      $st->execute([$incidenteId]);
      $rows = $st->fetchAll();
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') {
        Response::json(['data' => []], 200);
      }
      throw $e;
    }
    $rows = array_map(function (array $r): array {
      $r['id'] = (int)$r['id'];
      $r['bytes'] = (int)$r['bytes'];
      return $r;
    }, $rows);
    Response::json(['data' => $rows], 200);
  }

  public static function subir(PDO $db, array $claims, int $incidenteId, array $body): void {
    $inc = self::puedeVer($db, $claims, $incidenteId);
    if (in_array($inc['estado'] ?? '', ['Cerrado', 'Duplicado'], true)) {
      Response::error('Caso cerrado, no admite adjuntos', 400);
    }
    $nombre = trim($body['nombre'] ?? '');
    $mime = trim($body['mime'] ?? '');
    $b64 = $body['data_base64'] ?? '';
    if ($nombre === '' || strlen($nombre) > 160) Response::error('Nombre inválido', 400);
    if (!isset(self::MIMES[$mime])) Response::error('MIME inválido (jpg, png, pdf)', 400);
    if (!is_string($b64) || $b64 === '') Response::error('Archivo requerido', 400);
    $bin = base64_decode($b64, true);
    if ($bin === false) Response::error('Base64 inválido', 400);
    if (strlen($bin) > self::MAX_BYTES) Response::error('Archivo muy grande (máx 5MB)', 400);
    $dir = __DIR__ . '/../../uploads';
    if (!is_dir($dir)) @mkdir($dir, 0770, true);
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $nombre);
    $fname = $incidenteId . '_' . bin2hex(random_bytes(8)) . '.' . self::MIMES[$mime];
    $path = $dir . '/' . $fname;
    if (@file_put_contents($path, $bin, LOCK_EX) === false) {
      Response::error('Error interno del servidor', 500);
    }
    try {
      $st = $db->prepare('INSERT INTO incidente_adjuntos (incidente_id, autor_id, nombre, mime, bytes, ruta) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
      $st->execute([$incidenteId, (int)$claims['sub'], $safe, $mime, strlen($bin), $fname]);
      $aid = (int)$st->fetchColumn();
    } catch (PDOException $e) {
      @unlink($path);
      if (($e->errorInfo[0] ?? '') === '42P01') Response::error('Adjuntos no habilitados (falta migrate_04)', 500);
      throw $e;
    }
    $m = new Incidente($db);
    $m->registrarEvento($incidenteId, (int)($claims['sub'] ?? 0) ?: null, 'adjunto', $safe);
    Response::json(['data' => ['id' => $aid, 'incidente_id' => $incidenteId, 'nombre' => $safe, 'mime' => $mime]], 201);
  }

  // OCR heurístico: busca código de reserva en nombre + hilo, autovincula si falta.
  public static function ocr(PDO $db, array $claims, int $incidenteId, int $adjuntoId): void {
    $st = $db->prepare('SELECT * FROM incidentes WHERE id = ? LIMIT 1');
    $st->execute([$incidenteId]);
    $inc = $st->fetch();
    if (!$inc) Response::error('Incidente no encontrado', 404);
    if (($claims['rol'] ?? '') === 'viajero' && (int)$inc['user_id'] !== (int)($claims['sub'] ?? 0)) {
      Response::error('Permiso denegado', 403);
    }
    try {
      $st = $db->prepare('SELECT * FROM incidente_adjuntos WHERE id = ? AND incidente_id = ? LIMIT 1');
      $st->execute([$adjuntoId, $incidenteId]);
      $adj = $st->fetch();
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') Response::error('Adjuntos no habilitados (falta migrate_04)', 500);
      throw $e;
    }
    if (!$adj) Response::error('Adjunto no encontrado', 404);
    // Texto real vía tesseract (si instalado) + heurístico nombre/hilo.
    $rutaAbs = __DIR__ . '/../../uploads/' . basename((string)$adj['ruta']);
    $textoOcr = class_exists('Ocr') ? Ocr::extraer($rutaAbs, (string)$adj['mime']) : '';
    $corpus = mb_strtoupper((string)$adj['nombre'] . ' ' . (string)$inc['titulo'] . ' ' . (string)$inc['descripcion'] . ' ' . $textoOcr, 'UTF-8');
    $codigos = class_exists('Ocr') ? Ocr::codigos($corpus) : [];
    if (!$codigos && preg_match_all('/\b([A-Z]{2,4}\d{3,5})\b/', $corpus, $mm)) {
      $codigos = array_values(array_unique($mm[1]));
    }
    $vinculada = null;
    foreach ($codigos as $cod) {
      $st = $db->prepare('SELECT id FROM reservas WHERE codigo = ? AND user_id = ? LIMIT 1');
      $st->execute([$cod, (int)$inc['user_id']]);
      $rid = $st->fetchColumn();
      if ($rid !== false && $rid !== null) {
        $vinculada = (int)$rid;
        break;
      }
    }
    $ocrTexto = $codigos ? ('códigos detectados: ' . implode(', ', $codigos)) : 'sin códigos detectados';
    if ($textoOcr !== '') {
      $ocrTexto .= ' | ocr: ' . mb_substr($textoOcr, 0, 200);
    }
    try {
      if ($vinculada !== null && empty($inc['reserva_id'])) {
        $st = $db->prepare('UPDATE incidentes SET reserva_id = ? WHERE id = ?');
        $st->execute([$vinculada, $incidenteId]);
      }
      $st = $db->prepare('UPDATE incidente_adjuntos SET ocr_texto = ?, reserva_detectada = ? WHERE id = ?');
      $st->execute([$ocrTexto, $vinculada, $adjuntoId]);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') !== '42703') throw $e;
    }
    $m = new Incidente($db);
    $m->registrarEvento($incidenteId, (int)($claims['sub'] ?? 0) ?: null, 'adjunto', 'ocr:' . $ocrTexto);
    Response::json(['data' => ['adjunto_id' => $adjuntoId, 'ocr' => $ocrTexto, 'reserva_id' => $vinculada]], 200);
  }
}
