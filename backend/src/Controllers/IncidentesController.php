<?php
// Incidentes del viajero: ver mios, crear, ver uno propio, leer respuestas propias.
class IncidentesController {
  public static function mios(PDO $db, array $claims): void {
    $estado = $_GET['estado'] ?? null;
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) {
      Response::error('Estado inválido', 400);
    }
    $q = isset($_GET['q']) ? trim((string)$_GET['q']) : null;
    if ($q === '') $q = null;
    $limit = min(max((int)($_GET['limit'] ?? 50), 1), 50);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $m = new Incidente($db);
    $rows = $m->listByUser((int)$claims['sub'], $estado, $limit, ($page - 1) * $limit, $q);
    Response::json(['data' => array_map([Incidente::class, 'toPublic'], $rows), 'total' => $m->countByUser((int)$claims['sub'], $estado, $q), 'page' => $page, 'limit' => $limit], 200);
  }

  public static function crear(PDO $db, array $claims, array $body): void {
    $tipo = $body['tipo'] ?? '';
    $titulo = trim($body['titulo'] ?? '');
    $descripcion = trim($body['descripcion'] ?? '');
    $reservaId = $body['reserva_id'] ?? null;

    if (!in_array($tipo, Incidente::TIPOS, true)) Response::error('Tipo inválido', 400);
    $lt = mb_strlen($titulo);
    if ($lt < 5 || $lt > 120) Response::error('Título inválido (5 a 120 caracteres)', 400);
    $ld = mb_strlen($descripcion);
    if ($ld < 10 || $ld > 2000) Response::error('Descripción inválida (10 a 2000 caracteres)', 400);

    $rid = null;
    if ($reservaId !== null && $reservaId !== '') {
      $rid = filter_var($reservaId, FILTER_VALIDATE_INT);
      if ($rid === false || $rid <= 0) Response::error('reserva_id inválida', 400);
      $r = new Reserva($db);
      if (!$r->belongsTo($rid, (int)$claims['sub'])) {
        Response::error('Reserva no encontrada', 404);
      }
    }

    $m = new Incidente($db);
    $idemKey = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? ($body['idempotencia_key'] ?? null);
    if (is_string($idemKey)) $idemKey = trim($idemKey);
    if ($idemKey === '') $idemKey = null;
    if ($idemKey !== null && (strlen($idemKey) < 8 || strlen($idemKey) > 64)) {
      Response::error('Idempotency-Key inválida (8 a 64 caracteres)', 400);
    }
    $esReintento = false;
    if ($idemKey !== null) {
      try {
        $st = $db->prepare('SELECT incidente_id FROM incidente_idempotencia WHERE key = ? AND user_id = ? LIMIT 1');
        $st->execute([$idemKey, (int)$claims['sub']]);
        $prev = $st->fetchColumn();
        if ($prev !== false && $prev !== null) $esReintento = true;
      } catch (PDOException $e) { /* pre-migrate_04 */ }
    }
    $id = $m->create((int)$claims['sub'], $rid, $tipo, $titulo, $descripcion, $idemKey);
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'creado', null);
    // Contrato: el viajero nunca ve prioridad real (se ignora si el cliente la envia).
    $row = Incidente::toPublic($m->findById($id));
    $row['reintento'] = $esReintento;
    Response::json(['data' => $row], $esReintento ? 200 : 201);
  }

  private static function propio(PDO $db, array $claims, int $id): array {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    if ((int)$inc['user_id'] !== (int)$claims['sub']) Response::error('Permiso denegado', 403);
    return $inc;
  }

  // Detalle viajero: incidente (sin prioridad) + atendido_por + historial publico.
  public static function ver(PDO $db, array $claims, int $id): void {
    $inc = self::propio($db, $claims, $id);
    $m = new Incidente($db);
    $data = Incidente::toPublic($inc);
    try {
      $data['atendido_por'] = $m->asignadoNombre($id);
    } catch (Throwable $e) {
      $data['atendido_por'] = null;
    }
    try {
      $data['historial'] = $m->historialPublico($id);
    } catch (Throwable $e) {
      $data['historial'] = [];
    }
    Response::json(['data' => $data], 200);
  }

  public static function respuestas(PDO $db, array $claims, int $id): void {
    self::propio($db, $claims, $id);
    $limit = min(max((int)($_GET['limit'] ?? 100), 1), 200);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $r = new Respuesta($db);
    // Viajero nunca ve notas internas.
    $data = $r->listByIncidente($id, true, $limit, ($page - 1) * $limit);
    Response::json(['data' => $data, 'page' => $page, 'limit' => $limit], 200);
  }

  // Réplica viajero: agrega info al hilo. Si estaba Resuelto/Cerrado -> reabre.
  public static function responderViajero(PDO $db, array $claims, int $id, array $body): void {
    $inc = self::propio($db, $claims, $id);
    if (in_array($inc['estado'] ?? '', ['Cerrado', 'Duplicado'], true)) {
      Response::error('Caso cerrado, creá un nuevo reporte', 400);
    }
    $mensaje = trim($body['mensaje'] ?? '');
    $lm = mb_strlen($mensaje);
    if ($lm < 2 || $lm > 2000) Response::error('Mensaje inválido (2 a 2000 caracteres)', 400);
    $r = new Respuesta($db);
    try {
      $res = $r->responderConReapertura($id, (int)$claims['sub'], 'viajero', $mensaje, false);
    } catch (Throwable $e) {
      Logger::error('responder_viajero_fail');
      Response::error('Error interno del servidor', 500);
    }
    if (!$res['ok']) Response::error('Incidente no encontrado', 404);
    $m = new Incidente($db);
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'respuesta_viajero', null);
    if (!empty($res['reabierto'])) {
      $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'reabierto', 'EnGestion');
    }
    if (class_exists('Notificacion')) {
      Notificacion::avisarCaso($db, $id, 'respuesta_viajero', 'El viajero agregó info al caso #' . $id, (int)($claims['sub'] ?? 0));
    }
    Response::json(['data' => ['id' => $res['id'], 'incidente_id' => $id, 'reabierto' => !empty($res['reabierto'])]], 201);
  }

  // Reabrir caso resuelto (viajero).
  public static function reabrir(PDO $db, array $claims, int $id): void {
    $inc = self::propio($db, $claims, $id);
    if (($inc['estado'] ?? '') !== 'Resuelto') Response::error('Solo se puede reabrir un caso Resuelto', 400);
    $m = new Incidente($db);
    $m->update($id, null, 'EnGestion', null);
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'reabierto', 'EnGestion');
    Response::json(['data' => Incidente::toPublic($m->findById($id))], 200);
  }
}
