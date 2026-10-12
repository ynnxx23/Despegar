<?php
// Notificaciones del usuario autenticado (viajero o agente).
class NotificacionesController {
  public static function mias(PDO $db, array $claims): void {
    $limit = min(max((int)($_GET['limit'] ?? 20), 1), 50);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $solo = isset($_GET['no_leidas']) && in_array(strtolower((string)$_GET['no_leidas']), ['1', 'true', 'si'], true);
    $data = Notificacion::listar($db, (int)$claims['sub'], $limit, ($page - 1) * $limit, $solo);
    Response::json(['data' => $data, 'no_leidas' => Notificacion::contarNoLeidas($db, (int)$claims['sub']), 'page' => $page, 'limit' => $limit], 200);
  }

  public static function contar(PDO $db, array $claims): void {
    Response::json(['data' => ['no_leidas' => Notificacion::contarNoLeidas($db, (int)$claims['sub'])]], 200);
  }

  public static function leer(PDO $db, array $claims, int $id): void {
    $st = $db->prepare('UPDATE notificaciones SET leida = TRUE WHERE id = ? AND user_id = ?');
    try {
      $st->execute([$id, (int)$claims['sub']]);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') Response::error('No disponible', 404);
      throw $e;
    }
    if ($st->rowCount() === 0) Response::error('Notificación no encontrada', 404);
    Response::json(['data' => ['id' => $id, 'leida' => true]], 200);
  }

  public static function leerTodas(PDO $db, array $claims): void {
    try {
      $st = $db->prepare('UPDATE notificaciones SET leida = TRUE WHERE user_id = ? AND leida = FALSE');
      $st->execute([(int)$claims['sub']]);
      Response::json(['data' => ['leidas' => $st->rowCount()]], 200);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') Response::json(['data' => ['leidas' => 0]], 200);
      throw $e;
    }
  }
}
