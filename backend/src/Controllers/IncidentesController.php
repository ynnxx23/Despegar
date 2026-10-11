<?php
// Incidentes del viajero: ver mios, crear, ver uno propio, leer respuestas propias.
class IncidentesController {
  public static function mios(PDO $db, array $claims, array $params, array $body, array $query): void {
    $estado = isset($query['estado']) ? trim((string)$query['estado']) : null;
    if ($estado === '') $estado = null;
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) {
      Response::error('Estado inválido', 400);
    }
    $limit = min(max((int)($query['limit'] ?? 50), 1), 100);
    $page = max((int)($query['page'] ?? 1), 1);
    $m = new Incidente($db);
    $rows = $m->listByUser((int)$claims['sub'], $estado, $limit, ($page - 1) * $limit);
    Response::json([
      'data' => array_map([Incidente::class, 'toPublic'], $rows),
      'total' => $m->countByUser((int)$claims['sub'], $estado),
      'page' => $page,
      'limit' => $limit,
    ], 200);
  }

  public static function crear(PDO $db, array $claims, array $params, array $body): void {
    $tipo = (string)($body['tipo'] ?? '');
    $titulo = trim((string)($body['titulo'] ?? ''));
    $descripcion = trim((string)($body['descripcion'] ?? ''));
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
    $g = new GestionCaso($db);
    $id = $m->create((int)$claims['sub'], $rid, $tipo, $titulo, $descripcion);
    $g->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'creado', null);
    // Contrato: el viajero nunca ve prioridad real (se ignora si el cliente la envia).
    $row = Incidente::toPublic($m->findById($id));
    Response::json(['data' => $row], 201);
  }

  private static function propio(PDO $db, array $claims, int $id): array {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    if ((int)$inc['user_id'] !== (int)$claims['sub']) Response::error('Permiso denegado', 403);
    return $inc;
  }

  // Detalle viajero: incidente (sin prioridad) + atendido_por + historial publico.
  public static function ver(PDO $db, array $claims, array $params, array $body, array $query): void {
    $id = (int)($params['id'] ?? 0);
    if ($id <= 0) Response::error('Incidente inválido', 400);
    $inc = self::propio($db, $claims, $id);
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    $data = Incidente::toPublic($inc);
    try {
      $data['atendido_por'] = $g->asignadoNombre($id);
    } catch (Throwable $e) {
      $data['atendido_por'] = null;
    }
    try {
      $data['historial'] = $g->historialPublico($id);
    } catch (Throwable $e) {
      $data['historial'] = [];
    }
    Response::json(['data' => $data], 200);
  }

  public static function respuestas(PDO $db, array $claims, array $params): void {
    $id = (int)($params['id'] ?? 0);
    if ($id <= 0) Response::error('Incidente inválido', 400);
    self::propio($db, $claims, $id);
    $r = new Respuesta($db);
    Response::json(['data' => $r->listByIncidente($id)], 200);
  }
}
