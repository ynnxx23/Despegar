<?php
// Incidentes del viajero: ver míos, crear, ver uno propio, leer respuestas propias.
class IncidentesController {
  public static function mios(PDO $db, array $claims): void {
    $estado = $_GET['estado'] ?? null;
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) {
      Response::error('Estado inválido', 400);
    }
    $m = new Incidente($db);
    Response::json(['data' => $m->listByUser((int)$claims['sub'], $estado)], 200);
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
      if (!is_numeric($reservaId)) Response::error('reserva_id inválida', 400);
      $rid = (int)$reservaId;
      $r = new Reserva($db);
      if (!$r->belongsTo($rid, (int)$claims['sub'])) {
        Response::error('Reserva no encontrada', 404);
      }
    }

    $m = new Incidente($db);
    $id = $m->create((int)$claims['sub'], $rid, $tipo, $titulo, $descripcion);
    Response::json(['data' => $m->findById($id)], 201);
  }

  private static function propio(PDO $db, array $claims, int $id): array {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    if ((int)$inc['user_id'] !== (int)$claims['sub']) Response::error('Permiso denegado', 403);
    return $inc;
  }

  public static function ver(PDO $db, array $claims, int $id): void {
    Response::json(['data' => self::propio($db, $claims, $id)], 200);
  }

  public static function respuestas(PDO $db, array $claims, int $id): void {
    self::propio($db, $claims, $id);
    $r = new Respuesta($db);
    Response::json(['data' => $r->listByIncidente($id)], 200);
  }
}
