<?php
// Admin (agente): cola global ordenada por fecha + PUT prioridad/estado + responder.
class AdminController {
  public static function cola(PDO $db): void {
    $estado = $_GET['estado'] ?? null;
    $prioridad = $_GET['prioridad'] ?? null;
    $orden = strtolower($_GET['orden'] ?? 'asc');
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if (!in_array($orden, ['asc', 'desc'], true)) Response::error('Orden inválido (asc|desc)', 400);
    $limit = min(max((int)($_GET['limit'] ?? 20), 1), 50);
    $page = max((int)($_GET['page'] ?? 1), 1);

    $m = new Incidente($db);
    $data = $m->listAll($estado, $prioridad, $orden, $limit, ($page - 1) * $limit);
    Response::json(['data' => $data, 'total' => $m->countAll($estado, $prioridad), 'page' => $page, 'limit' => $limit], 200);
  }

  public static function ver(PDO $db, int $id): void {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    Response::json(['data' => $inc], 200);
  }

  public static function actualizar(PDO $db, int $id, array $body): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $prioridad = $body['prioridad'] ?? null;
    $estado = $body['estado'] ?? null;
    if ($prioridad === null && $estado === null) Response::error('Nada para actualizar (prioridad y/o estado)', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    $m->update($id, $prioridad, $estado);
    Response::json(['data' => $m->findById($id)], 200);
  }

  public static function responder(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $mensaje = trim($body['mensaje'] ?? '');
    $lm = mb_strlen($mensaje);
    if ($lm < 2 || $lm > 2000) Response::error('Mensaje inválido (2 a 2000 caracteres)', 400);
    $r = new Respuesta($db);
    try {
      $rid = $r->responderAtomico($id, (int)$claims['sub'], $mensaje);
    } catch (Throwable $e) {
      error_log('responder: ' . $e->getMessage());
      Response::error('Error interno del servidor', 500);
    }
    if ($rid === false) Response::error('Incidente no encontrado', 404);
    Response::json(['data' => ['id' => $rid, 'incidente_id' => $id, 'mensaje' => $mensaje]], 201);
  }

  public static function resumen(PDO $db): void {
    $rows = $db->query('SELECT * FROM resumen_cola()')->fetchAll();
    Response::json(['data' => $rows], 200);
  }

  public static function respuestas(PDO $db, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $r = new Respuesta($db);
    Response::json(['data' => $r->listByIncidente($id)], 200);
  }
}
