<?php
// Admin (agente): cola global ordenada + triaje/SLA + responder + gestion de casos.
class AdminController {
  public static function cola(PDO $db, array $claims): void {
    $estado = $_GET['estado'] ?? null;
    $prioridad = $_GET['prioridad'] ?? null;
    $orden = strtolower($_GET['orden'] ?? 'urgencia');
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if (!in_array($orden, ['asc', 'desc', 'urgencia'], true)) Response::error('Orden inválido (asc|desc|urgencia)', 400);
    $limit = min(max((int)($_GET['limit'] ?? 20), 1), 50);
    $page = max((int)($_GET['page'] ?? 1), 1);

    $m = new Incidente($db);
    $data = $m->listAll($estado, $prioridad, $orden, $limit, ($page - 1) * $limit, (int)($claims['sub'] ?? 0) ?: null);
    $data = array_map([Incidente::class, 'toAgent'], $data);
    Response::json(['data' => $data, 'total' => $m->countAll($estado, $prioridad), 'page' => $page, 'limit' => $limit], 200);
  }

  // Mi cola: 'mios' (reclamados por mi), 'siguiendo' (los que sigo y no son mios) o
  // sin vista (union: asignados + seguidos). No Resueltos salvo ?estado=Resuelto.
  public static function miCola(PDO $db, array $claims): void {
    $estado = $_GET['estado'] ?? null;
    $prioridad = $_GET['prioridad'] ?? null;
    $orden = strtolower($_GET['orden'] ?? 'urgencia');
    $vista = isset($_GET['vista']) ? strtolower(trim((string)$_GET['vista'])) : null;
    if ($vista === '') $vista = null;
    if ($vista !== null && !in_array($vista, ['mios', 'siguiendo'], true)) {
      Response::error('Vista inválida (mios|siguiendo)', 400);
    }
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if (!in_array($orden, ['asc', 'desc', 'urgencia'], true)) Response::error('Orden inválido (asc|desc|urgencia)', 400);
    $limit = min(max((int)($_GET['limit'] ?? 20), 1), 50);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $yo = (int)($claims['sub'] ?? 0);

    $m = new Incidente($db);
    $data = $m->miCola($yo, $estado, $prioridad, $orden, $limit, ($page - 1) * $limit, $vista);
    $data = array_map([Incidente::class, 'toAgent'], $data);
    Response::json([
      'data' => $data,
      'total' => $m->countMiCola($yo, $estado, $prioridad, $vista),
      'page' => $page,
      'limit' => $limit,
      'vista' => $vista,
    ], 200);
  }

  public static function ver(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    $st = $db->prepare('SELECT nombre, email FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([(int)$inc['user_id']]);
    $u = $st->fetch();
    $usuario = $u ? ['nombre' => $u['nombre'], 'email' => $u['email']] : null;
    $reserva = null;
    if ($inc['reserva_id'] !== null) {
      $st = $db->prepare('SELECT id, codigo, tipo, origen, destino, hotel FROM reservas WHERE id = ? LIMIT 1');
      $st->execute([(int)$inc['reserva_id']]);
      $r = $st->fetch();
      if ($r) {
        $r['id'] = (int)$r['id'];
        $reserva = $r;
      }
    }
    $yo = (int)($claims['sub'] ?? 0);
    $asignado = $g->asignado($id);
    Response::json(['data' => [
      'incidente' => Incidente::toAgent($inc),
      'usuario' => $usuario,
      'reserva' => $reserva,
      'asignado' => $asignado,
      'seguidores' => $g->seguidores($id),
      'siguiendo' => $g->siguiendo($id, $yo),
      'mi_asignado' => $asignado !== null && (int)$asignado['id'] === $yo,
    ]], 200);
  }

  public static function actualizar(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    $actual = $m->findById($id);
    if (!$actual) Response::error('Incidente no encontrado', 404);
    $prioridad = $body['prioridad'] ?? null;
    $estado = $body['estado'] ?? null;
    if ($prioridad === null && $estado === null) Response::error('Nada para actualizar (prioridad y/o estado)', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    // Prioridad obligatoria antes de Resuelto (sin triar no se puede cerrar).
    $efectiva = $prioridad ?? ($actual['prioridad'] ?? null);
    if ($estado === 'Resuelto' && $efectiva === null) {
      Response::error('Prioridad requerida antes de resolver', 400);
    }
    $actor = (int)($claims['sub'] ?? 0) ?: null;
    $m->update($id, $prioridad, $estado, (int)($claims['sub'] ?? 0) ?: null);
    // Eventos: prioridad/triaje y estado/resuelto/reabierto.
    if ($prioridad !== null && $prioridad !== ($actual['prioridad'] ?? null)) {
      $g->registrarEvento($id, $actor, 'prioridad', $prioridad);
      $g->registrarEvento($id, $actor, 'triaje', $prioridad);
    }
    if ($estado !== null && $estado !== ($actual['estado'] ?? null)) {
      if ($estado === 'Resuelto') {
        $g->registrarEvento($id, $actor, 'resuelto', $estado);
      } elseif (($actual['estado'] ?? null) === 'Resuelto') {
        $g->registrarEvento($id, $actor, 'reabierto', $estado);
      } else {
        $g->registrarEvento($id, $actor, 'estado', $estado);
      }
    }
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  public static function responder(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
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
    $g->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'responder', null);
    Response::json(['data' => ['id' => $rid, 'incidente_id' => $id, 'mensaje' => $mensaje]], 201);
  }

  public static function resumen(PDO $db, array $claims): void {
    $rows = $db->query('SELECT * FROM resumen_cola()')->fetchAll();
    $sinTriar = (int)$db->query("SELECT COUNT(*) FROM incidentes WHERE prioridad IS NULL")->fetchColumn();
    $vencidos = 0;
    $mios = 0;
    try {
      $vencidos = (int)$db->query(
        "SELECT COUNT(*) FROM incidentes WHERE sla_vence_at IS NOT NULL AND sla_vence_at < NOW() AND estado <> 'Resuelto'"
      )->fetchColumn();
    } catch (Throwable $e) { $vencidos = 0; }
    try {
      $yo = (int)($claims['sub'] ?? 0);
      $st = $db->prepare("SELECT COUNT(*) FROM incidentes WHERE asignado_a = ? AND estado <> 'Resuelto'");
      $st->execute([$yo]);
      $mios = (int)$st->fetchColumn();
    } catch (Throwable $e) { $mios = 0; }
    Response::json(['data' => $rows, 'sin_triar' => $sinTriar, 'vencidos' => $vencidos, 'mios' => $mios], 200);
  }

  public static function respuestas(PDO $db, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $r = new Respuesta($db);
    Response::json(['data' => $r->listByIncidente($id)], 200);
  }

  // Toma el caso: asigna al actor (+ pasa a EnGestion si estaba Abierto).
  public static function claim(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    $yo = (int)($claims['sub'] ?? 0);
    $asignado = $inc['asignado_a'] ?? null;
    if ($asignado !== null && (int)$asignado !== $yo) {
      Response::error('Caso ya asignado a otro agente', 409);
    }
    if ($asignado !== null && (int)$asignado === $yo) {
      Response::json(['data' => Incidente::toAgent($inc)], 200);
    }
    $st = $db->prepare('UPDATE incidentes SET asignado_a = ? WHERE id = ?');
    $st->execute([$yo, $id]);
    if (($inc['estado'] ?? null) === 'Abierto') {
      $st = $db->prepare("UPDATE incidentes SET estado = 'EnGestion' WHERE id = ?");
      $st->execute([$id]);
    }
    $g->registrarEvento($id, $yo ?: null, 'claim', null);
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  // Libera el caso: asignado_a = NULL.
  public static function release(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    $st = $db->prepare('UPDATE incidentes SET asignado_a = NULL WHERE id = ?');
    $st->execute([$id]);
    $g->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'release', null);
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  // Deriva a otro agente (rol agente) con motivo opcional.
  public static function derivar(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    $destino = $body['agente_id'] ?? null;
    $destino = filter_var($destino, FILTER_VALIDATE_INT);
    if ($destino === false || $destino <= 0) Response::error('agente_id inválido', 400);
    $st = $db->prepare('SELECT id, rol FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([$destino]);
    $u = $st->fetch();
    if (!$u || ($u['rol'] ?? '') !== 'agente') Response::error('Agente no encontrado', 404);
    $actual = $inc['asignado_a'] ?? null;
    if ($actual !== null && (int)$actual === (int)$destino) {
      Response::error('El caso ya está asignado a ese agente', 400);
    }
    $motivo = isset($body['motivo']) ? trim((string)$body['motivo']) : null;
    if ($motivo === '') $motivo = null;
    $st = $db->prepare('UPDATE incidentes SET asignado_a = ? WHERE id = ?');
    $st->execute([(int)$destino, $id]);
    $g->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'derivar', $motivo);
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  // Seguir el caso (idempotente). Cualquier agente puede seguir un caso, tenga o no el caso.
  public static function seguir(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $yo = (int)($claims['sub'] ?? 0);
    $st = $db->prepare('INSERT INTO incidente_seguidores (incidente_id, agente_id) VALUES (?, ?) ON CONFLICT DO NOTHING');
    $st->execute([$id, $yo]);
    $g->registrarEvento($id, $yo ?: null, 'seguir', null);
    Response::json(['data' => [
      'incidente_id' => $id,
      'siguiendo' => true,
      'seguidores' => $g->seguidores($id),
      'asignado' => $g->asignado($id),
    ]], 200);
  }

  // Dejar de seguir (idempotente).
  public static function dejarSeguir(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $yo = (int)($claims['sub'] ?? 0);
    $st = $db->prepare('DELETE FROM incidente_seguidores WHERE incidente_id = ? AND agente_id = ?');
    $st->execute([$id, $yo]);
    $g->registrarEvento($id, $yo ?: null, 'dejar_seguir', null);
    Response::json(['data' => [
      'incidente_id' => $id,
      'siguiendo' => false,
      'seguidores' => $g->seguidores($id),
      'asignado' => $g->asignado($id),
    ]], 200);
  }

  // Historial interno con actor_nombre (para agente).
  public static function historial(PDO $db, int $id): void {
    $m = new Incidente($db);
    $g = new GestionCaso($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    Response::json(['data' => $g->historial($id)], 200);
  }

  // Lista de agentes (id, nombre, email).
  public static function agentes(PDO $db): void {
    $rows = $db->query("SELECT id, nombre, email FROM usuarios WHERE rol = 'agente' ORDER BY nombre ASC")->fetchAll();
    $rows = array_map(function (array $r): array {
      return ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'email' => $r['email']];
    }, $rows);
    Response::json(['data' => $rows], 200);
  }
}
