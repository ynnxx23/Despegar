<?php
// Admin (agente): cola global ordenada + triaje/SLA + responder + gestion de casos.
class AdminController {
  public static function cola(PDO $db): void {
    $estado = $_GET['estado'] ?? null;
    $prioridad = $_GET['prioridad'] ?? null;
    $tipo = $_GET['tipo'] ?? null;
    $q = isset($_GET['q']) ? trim((string)$_GET['q']) : null;
    if ($q === '') $q = null;
    $orden = strtolower($_GET['orden'] ?? 'urgencia');
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if ($tipo !== null && !in_array($tipo, Incidente::TIPOS, true)) Response::error('Tipo inválido', 400);
    if (!in_array($orden, ['asc', 'desc', 'urgencia'], true)) Response::error('Orden inválido (asc|desc|urgencia)', 400);
    $limit = min(max((int)($_GET['limit'] ?? 20), 1), 50);
    $page = max((int)($_GET['page'] ?? 1), 1);

    $m = new Incidente($db);
    $data = $m->listAll($estado, $prioridad, $orden, $limit, ($page - 1) * $limit, $q, $tipo);
    $data = array_map([Incidente::class, 'toAgent'], $data);
    Response::json(['data' => $data, 'total' => $m->countAll($estado, $prioridad, $q, $tipo), 'page' => $page, 'limit' => $limit], 200);
  }

  // Mi cola: asignados a mi o seguidos por mi (no Resueltos salvo ?estado=Resuelto).
  public static function miCola(PDO $db, array $claims): void {
    $estado = $_GET['estado'] ?? null;
    $prioridad = $_GET['prioridad'] ?? null;
    $orden = strtolower($_GET['orden'] ?? 'urgencia');
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if (!in_array($orden, ['asc', 'desc', 'urgencia'], true)) Response::error('Orden inválido (asc|desc|urgencia)', 400);
    $limit = min(max((int)($_GET['limit'] ?? 20), 1), 50);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $yo = (int)($claims['sub'] ?? 0);

    $m = new Incidente($db);
    $data = $m->miCola($yo, $estado, $prioridad, $orden, $limit, ($page - 1) * $limit);
    $data = array_map([Incidente::class, 'toAgent'], $data);
    Response::json(['data' => $data, 'total' => $m->countMiCola($yo, $estado, $prioridad), 'page' => $page, 'limit' => $limit], 200);
  }

  public static function ver(PDO $db, int $id): void {
    $m = new Incidente($db);
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
    Response::json(['data' => ['incidente' => Incidente::toAgent($inc), 'usuario' => $usuario, 'reserva' => $reserva]], 200);
  }

  public static function actualizar(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    $actual = $m->findById($id);
    if (!$actual) Response::error('Incidente no encontrado', 404);
    $prioridad = $body['prioridad'] ?? null;
    $estado = $body['estado'] ?? null;
    if ($prioridad === null && $estado === null) Response::error('Nada para actualizar (prioridad y/o estado)', 400);
    if ($prioridad !== null && !in_array($prioridad, Incidente::PRIORIDADES, true)) Response::error('Prioridad inválida', 400);
    if ($estado !== null && !in_array($estado, Incidente::ESTADOS, true)) Response::error('Estado inválido', 400);
    // Prioridad obligatoria antes de Resuelto (sin triar no se puede cerrar).
    $efectiva = $prioridad ?? ($actual['prioridad'] ?? null);
    if (in_array($estado, ['Resuelto', 'Cerrado'], true) && $efectiva === null) {
      Response::error('Prioridad requerida antes de resolver', 400);
    }
    // Transición válida (evita saltos ilegales tipo Cerrado->Abierto).
    if ($estado !== null && $estado !== ($actual['estado'] ?? null)) {
      if (!Incidente::transicionValida((string)($actual['estado'] ?? 'Abierto'), $estado)) {
        Response::error('Transición de estado inválida', 400, ['details' => ['desde' => $actual['estado'] ?? null, 'hacia' => $estado]]);
      }
    }
    $actor = (int)($claims['sub'] ?? 0) ?: null;
    $m->update($id, $prioridad, $estado, (int)($claims['sub'] ?? 0) ?: null);
    // Eventos: prioridad/triaje y estado/resuelto/reabierto.
    if ($prioridad !== null && $prioridad !== ($actual['prioridad'] ?? null)) {
      $m->registrarEvento($id, $actor, 'prioridad', $prioridad);
      $m->registrarEvento($id, $actor, 'triaje', $prioridad);
    }
    if ($estado !== null && $estado !== ($actual['estado'] ?? null)) {
      if (in_array($estado, ['Resuelto', 'Cerrado'], true)) {
        $m->registrarEvento($id, $actor, 'resuelto', $estado);
      } elseif (($actual['estado'] ?? null) === 'Resuelto') {
        $m->registrarEvento($id, $actor, 'reabierto', $estado);
      } elseif ($estado === 'Escalado') {
        $m->registrarEvento($id, $actor, 'escalado', $estado);
      } else {
        $m->registrarEvento($id, $actor, 'estado', $estado);
      }
    }
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  public static function responder(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $mensaje = trim($body['mensaje'] ?? '');
    $lm = mb_strlen($mensaje);
    if ($lm < 2 || $lm > 2000) Response::error('Mensaje inválido (2 a 2000 caracteres)', 400);
    $interna = !empty($body['interna']);
    $r = new Respuesta($db);
    try {
      if ($interna) {
        $res = $r->responderConReapertura($id, (int)$claims['sub'], 'agente', $mensaje, true);
        if (!$res['ok']) Response::error('Incidente no encontrado', 404);
        $rid = $res['id'];
      } else {
        $rid = $r->responderAtomico($id, (int)$claims['sub'], $mensaje);
      }
    } catch (Throwable $e) {
      error_log('responder: ' . $e->getMessage());
      Response::error('Error interno del servidor', 500);
    }
    if ($rid === false) Response::error('Incidente no encontrado', 404);
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'responder', $interna ? 'interna' : null);
    if (!$interna && class_exists('Notificacion')) {
      Notificacion::avisarCaso($db, $id, 'respuesta', 'Soporte respondió tu caso #' . $id, (int)($claims['sub'] ?? 0));
    }
    Response::json(['data' => ['id' => $rid, 'incidente_id' => $id, 'mensaje' => $mensaje, 'interna' => $interna]], 201);
  }

  public static function resumen(PDO $db, array $claims): void {
    $rows = $db->query('SELECT * FROM resumen_cola()')->fetchAll();
    $sinTriar = (int)$db->query("SELECT COUNT(*) FROM incidentes WHERE prioridad IS NULL")->fetchColumn();
    $vencidos = 0;
    $mios = 0;
    try {
      $vencidos = (int)$db->query(
        "SELECT COUNT(*) FROM incidentes WHERE sla_vence_at IS NOT NULL AND sla_vence_at < NOW() AND estado NOT IN ('Resuelto','Cerrado','Duplicado')"
      )->fetchColumn();
    } catch (Throwable $e) { $vencidos = 0; }
    try {
      $yo = (int)($claims['sub'] ?? 0);
      $st = $db->prepare("SELECT COUNT(*) FROM incidentes WHERE asignado_a = ? AND estado NOT IN ('Resuelto','Cerrado','Duplicado')");
      $st->execute([$yo]);
      $mios = (int)$st->fetchColumn();
    } catch (Throwable $e) { $mios = 0; }
    Response::json(['data' => $rows, 'sin_triar' => $sinTriar, 'vencidos' => $vencidos, 'mios' => $mios], 200);
  }

  public static function respuestas(PDO $db, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $limit = min(max((int)($_GET['limit'] ?? 100), 1), 200);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $r = new Respuesta($db);
    $data = $r->listByIncidente($id, false, $limit, ($page - 1) * $limit);
    Response::json(['data' => $data, 'page' => $page, 'limit' => $limit], 200);
  }

  // Toma el caso con transacción + FOR UPDATE (evita doble claim concurrente).
  public static function claim(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $yo = (int)($claims['sub'] ?? 0);
    try {
      $db->beginTransaction();
      $st = $db->prepare('SELECT * FROM incidentes WHERE id = ? FOR UPDATE');
      $st->execute([$id]);
      $inc = $st->fetch();
      if (!$inc) {
        $db->rollBack();
        Response::error('Incidente no encontrado', 404);
      }
      $inc = Incidente::toAgent($inc);
      $asignado = $inc['asignado_a'] ?? null;
      if ($asignado !== null && (int)$asignado !== $yo) {
        $db->rollBack();
        Response::error('Caso ya asignado a otro agente', 409);
      }
      if ($asignado !== null && (int)$asignado === $yo) {
        $db->commit();
        Response::json(['data' => $inc], 200);
      }
      $st = $db->prepare('UPDATE incidentes SET asignado_a = ? WHERE id = ?');
      $st->execute([$yo, $id]);
      if (($inc['estado'] ?? null) === 'Abierto') {
        $st = $db->prepare("UPDATE incidentes SET estado = 'EnGestion' WHERE id = ?");
        $st->execute([$id]);
      }
      $db->commit();
    } catch (Throwable $e) {
      if ($db->inTransaction()) $db->rollBack();
      if ($e instanceof PDOException) {
        Logger::error('claim_fail');
      }
      // Si ya se respondió (exit), no llega aquí. Re-lanza solo errores reales.
      if (!headers_sent()) {
        Response::error('Error interno del servidor', 500);
      }
      return;
    }
    $m->registrarEvento($id, $yo ?: null, 'claim', null);
    if (class_exists('Notificacion')) {
      Notificacion::avisarCaso($db, $id, 'claim', 'Un agente tomó tu caso #' . $id, $yo);
    }
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  // Libera el caso: asignado_a = NULL.
  public static function release(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    $st = $db->prepare('UPDATE incidentes SET asignado_a = NULL WHERE id = ?');
    $st->execute([$id]);
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'release', null);
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  // Deriva a otro agente con transacción + FOR UPDATE.
  public static function derivar(PDO $db, array $claims, int $id, array $body): void {
    $destino = $body['agente_id'] ?? null;
    $destino = filter_var($destino, FILTER_VALIDATE_INT);
    if ($destino === false || $destino <= 0) Response::error('agente_id inválido', 400);
    $st = $db->prepare('SELECT id, rol FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([$destino]);
    $u = $st->fetch();
    if (!$u || ($u['rol'] ?? '') !== 'agente') Response::error('Agente no encontrado', 404);
    $m = new Incidente($db);
    try {
      $db->beginTransaction();
      $st = $db->prepare('SELECT * FROM incidentes WHERE id = ? FOR UPDATE');
      $st->execute([$id]);
      $inc = $st->fetch();
      if (!$inc) {
        $db->rollBack();
        Response::error('Incidente no encontrado', 404);
      }
      $inc = Incidente::toAgent($inc);
      $actual = $inc['asignado_a'] ?? null;
      if ($actual !== null && (int)$actual === (int)$destino) {
        $db->rollBack();
        Response::error('El caso ya está asignado a ese agente', 400);
      }
      $motivo = isset($body['motivo']) ? trim((string)$body['motivo']) : null;
      if ($motivo === '') $motivo = null;
      $st = $db->prepare('UPDATE incidentes SET asignado_a = ? WHERE id = ?');
      $st->execute([(int)$destino, $id]);
      $db->commit();
    } catch (Throwable $e) {
      if ($db->inTransaction()) $db->rollBack();
      if (!headers_sent()) Response::error('Error interno del servidor', 500);
      return;
    }
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'derivar', $motivo ?? null);
    if (class_exists('Notificacion')) {
      Notificacion::avisarCaso($db, $id, 'derivar', 'Tu caso #' . $id . ' pasó a otro agente', (int)($claims['sub'] ?? 0));
    }
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  // Seguir el caso (idempotente).
  public static function seguir(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $yo = (int)($claims['sub'] ?? 0);
    $st = $db->prepare('INSERT INTO incidente_seguidores (incidente_id, agente_id) VALUES (?, ?) ON CONFLICT DO NOTHING');
    $st->execute([$id, $yo]);
    $m->registrarEvento($id, $yo ?: null, 'seguir', null);
    Response::json(['data' => ['incidente_id' => $id, 'siguiendo' => true]], 200);
  }

  // Dejar de seguir (idempotente).
  public static function dejarSeguir(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $yo = (int)($claims['sub'] ?? 0);
    $st = $db->prepare('DELETE FROM incidente_seguidores WHERE incidente_id = ? AND agente_id = ?');
    $st->execute([$id, $yo]);
    $m->registrarEvento($id, $yo ?: null, 'dejar_seguir', null);
    Response::json(['data' => ['incidente_id' => $id, 'siguiendo' => false]], 200);
  }

  // Historial interno con actor_nombre (para agente). Paginado.
  public static function historial(PDO $db, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    $limit = min(max((int)($_GET['limit'] ?? 100), 1), 200);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $all = $m->historial($id);
    $slice = array_slice($all, ($page - 1) * $limit, $limit);
    Response::json(['data' => $slice, 'total' => count($all), 'page' => $page, 'limit' => $limit], 200);
  }

  // Lista de agentes (id, nombre, email).
  public static function agentes(PDO $db): void {
    try {
      $rows = $db->query("SELECT id, nombre, email, activo FROM usuarios WHERE rol = 'agente' ORDER BY nombre ASC")->fetchAll();
    } catch (PDOException $e) {
      $rows = $db->query("SELECT id, nombre, email FROM usuarios WHERE rol = 'agente' ORDER BY nombre ASC")->fetchAll();
    }
    $rows = array_map(function (array $r): array {
      $o = ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'email' => $r['email']];
      if (array_key_exists('activo', $r)) $o['activo'] = (bool)$r['activo'];
      return $o;
    }, $rows);
    Response::json(['data' => $rows], 200);
  }

  // Alta de agente por el equipo (rol fijo agente, password 8-72).
  public static function agenteCrear(PDO $db, array $claims, array $body): void {
    $nombre = trim($body['nombre'] ?? '');
    $email = strtolower(trim($body['email'] ?? ''));
    $password = $body['password'] ?? '';
    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100) Response::error('Nombre inválido (2 a 100 caracteres)', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) Response::error('Email inválido', 400);
    if (!is_string($password) || strlen($password) < 8 || strlen($password) > 72) Response::error('Password inválida (8 a 72 caracteres)', 400);
    $u = new Usuario($db);
    if ($u->findByEmail($email)) Response::error('El email ya está registrado', 409);
    try {
      $id = $u->create($nombre, $email, Usuario::hashPassword($password), 'agente');
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '23505') Response::error('El email ya está registrado', 409);
      throw $e;
    }
    $safe = $u->findById($id);
    Logger::info('alta_agente', ['nuevo' => $id, 'por' => (int)($claims['sub'] ?? 0)]);
    Response::json(['data' => Usuario::toSafe($safe)], 201);
  }

  // Activar/desactivar agente. No permite auto-desactivarse ni borrar.
  public static function agenteEstado(PDO $db, array $claims, int $id, array $body): void {
    if ($id === (int)($claims['sub'] ?? 0)) Response::error('No podés desactivar tu propia cuenta', 400);
    $u = new Usuario($db);
    $row = $u->findById($id);
    if (!$row || ($row['rol'] ?? '') !== 'agente') Response::error('Agente no encontrado', 404);
    $activo = $body['activo'] ?? null;
    if (!is_bool($activo)) Response::error('activo (true/false) requerido', 400);
    try {
      $st = $db->prepare('UPDATE usuarios SET activo = ? WHERE id = ?');
      $st->execute([$activo ? 't' : 'f', $id]);
      if (!$activo) {
        $db->prepare('UPDATE refresh_tokens SET revocado = TRUE WHERE user_id = ?')->execute([$id]);
      }
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42703') Response::error('Gestión no disponible (falta migrate_07)', 500);
      throw $e;
    }
    Response::json(['data' => ['id' => $id, 'activo' => $activo]], 200);
  }

  // Bulk: asignar/cerrar/priorizar N casos. Body {ids:[int], accion, prioridad?, estado?, agente_id?}.
  public static function bulk(PDO $db, array $claims, array $body): void {
    $ids = $body['ids'] ?? [];
    if (!is_array($ids) || count($ids) === 0 || count($ids) > 50) Response::error('ids inválidos (1 a 50)', 400);
    $ids = array_values(array_unique(array_map('intval', $ids)));
    foreach ($ids as $i) {
      if ($i <= 0) Response::error('ids inválidos', 400);
    }
    $accion = $body['accion'] ?? '';
    if (!in_array($accion, ['asignar', 'cerrar', 'priorizar', 'estado'], true)) Response::error('Acción inválida', 400);
    $m = new Incidente($db);
    $yo = (int)($claims['sub'] ?? 0) ?: null;
    $ok = 0;
    $errores = [];
    foreach ($ids as $id) {
      $inc = $m->findById($id);
      if (!$inc) {
        $errores[] = ['id' => $id, 'error' => 'no encontrado'];
        continue;
      }
      try {
        if ($accion === 'asignar') {
          $dest = isset($body['agente_id']) ? (int)$body['agente_id'] : (int)($claims['sub'] ?? 0);
          $st = $db->prepare('SELECT rol FROM usuarios WHERE id = ? LIMIT 1');
          $st->execute([$dest]);
          $u = $st->fetch();
          if (!$u || ($u['rol'] ?? '') !== 'agente') {
            $errores[] = ['id' => $id, 'error' => 'agente inválido'];
            continue;
          }
          $st = $db->prepare('UPDATE incidentes SET asignado_a = ? WHERE id = ?');
          $st->execute([$dest, $id]);
        } elseif ($accion === 'priorizar') {
          $p = $body['prioridad'] ?? null;
          if (!in_array($p, Incidente::PRIORIDADES, true)) {
            $errores[] = ['id' => $id, 'error' => 'prioridad inválida'];
            continue;
          }
          $m->update($id, $p, null, $yo);
        } else {
          $est = $accion === 'cerrar' ? 'Resuelto' : ($body['estado'] ?? null);
          if (!in_array($est, Incidente::ESTADOS, true)) {
            $errores[] = ['id' => $id, 'error' => 'estado inválido'];
            continue;
          }
          if (!Incidente::transicionValida((string)$inc['estado'], $est)) {
            $errores[] = ['id' => $id, 'error' => 'transición inválida'];
            continue;
          }
          if (in_array($est, ['Resuelto', 'Cerrado'], true) && ($inc['prioridad'] ?? null) === null && empty($body['prioridad'])) {
            $errores[] = ['id' => $id, 'error' => 'requiere prioridad'];
            continue;
          }
          $m->update($id, $body['prioridad'] ?? null, $est, $yo);
        }
        $m->registrarEvento($id, $yo, 'bulk', $accion);
        $ok++;
      } catch (Throwable $e) {
        $errores[] = ['id' => $id, 'error' => 'interno'];
      }
    }
    Response::json(['data' => ['ok' => $ok, 'errores' => $errores, 'total' => count($ids)]], 200);
  }

  // Merge duplicados: marca origen como Duplicado apuntando al destino.
  public static function merge(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    $origen = $m->findById($id);
    if (!$origen) Response::error('Incidente no encontrado', 404);
    $destId = filter_var($body['duplicado_de'] ?? null, FILTER_VALIDATE_INT);
    if ($destId === false || $destId <= 0 || (int)$destId === $id) Response::error('duplicado_de inválido', 400);
    $dest = $m->findById((int)$destId);
    if (!$dest) Response::error('Destino no encontrado', 404);
    if (!Incidente::transicionValida((string)$origen['estado'], 'Duplicado')) {
      Response::error('Transición de estado inválida', 400);
    }
    $m->update($id, null, 'Duplicado', null);
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'merge', 'duplicado de #' . (int)$destId);
    Response::json(['data' => Incidente::toAgent($m->findById($id))], 200);
  }

  // Métricas Fase 3: vencidos, sin triar, por estado/prioridad, por agente, MTTR horas.
  public static function metricas(PDO $db): void {
    $m = new Incidente($db);
    $porEstado = [];
    try {
      $rows = $db->query('SELECT estado, COUNT(*) c FROM incidentes GROUP BY estado')->fetchAll();
      foreach ($rows as $r) $porEstado[$r['estado']] = (int)$r['c'];
    } catch (Throwable $e) { $porEstado = []; }
    $vencidos = 0;
    $sinTriar = 0;
    try {
      $vencidos = (int)$db->query("SELECT COUNT(*) FROM incidentes WHERE sla_vence_at IS NOT NULL AND sla_vence_at < NOW() AND estado NOT IN ('Resuelto','Cerrado','Duplicado')")->fetchColumn();
      $sinTriar = (int)$db->query('SELECT COUNT(*) FROM incidentes WHERE prioridad IS NULL')->fetchColumn();
    } catch (Throwable $e) { /* pre-migrate */ }
    $porAgente = [];
    try {
      $rows = $db->query("SELECT u.nombre, COUNT(i.id) c FROM incidentes i JOIN usuarios u ON u.id = i.asignado_a WHERE i.estado NOT IN ('Resuelto','Cerrado','Duplicado') GROUP BY u.nombre ORDER BY c DESC LIMIT 10")->fetchAll();
      foreach ($rows as $r) $porAgente[] = ['agente' => $r['nombre'], 'activos' => (int)$r['c']];
    } catch (Throwable $e) { $porAgente = []; }
    $mttrHoras = null;
    try {
      $v = $db->query("SELECT AVG(EXTRACT(EPOCH FROM (actualizado_at - creado_at))/3600) FROM incidentes WHERE estado IN ('Resuelto','Cerrado')")->fetchColumn();
      $mttrHoras = $v === null ? null : round((float)$v, 1);
    } catch (Throwable $e) { $mttrHoras = null; }
    Response::json(['data' => ['por_estado' => $porEstado, 'vencidos' => $vencidos, 'sin_triar' => $sinTriar, 'por_agente' => $porAgente, 'mttr_horas' => $mttrHoras]], 200);
  }

  // CSV export dashboard.
  public static function metricasCsv(PDO $db): void {
    $porEstado = [];
    try {
      $rows = $db->query('SELECT estado, COUNT(*) c FROM incidentes GROUP BY estado ORDER BY estado')->fetchAll();
      foreach ($rows as $r) $porEstado[] = [$r['estado'], (int)$r['c']];
    } catch (Throwable $e) { $porEstado = []; }
    http_response_code(200);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="metricas.csv"');
    echo "estado,total\n";
    foreach ($porEstado as [$est, $c]) {
      echo '"' . str_replace('"', '""', (string)$est) . '",' . $c . "\n";
    }
    exit;
  }

  // SLA predictivo: vencen en <6h + sugerencia de reasignar al agente más libre.
  public static function slaRiesgo(PDO $db): void {
    try {
      $rows = $db->query(
        "SELECT i.id, i.titulo, i.tipo, i.prioridad, i.estado, i.sla_vence_at, u.nombre AS asignado" .
        " FROM incidentes i LEFT JOIN usuarios u ON u.id = i.asignado_a" .
        " WHERE i.sla_vence_at IS NOT NULL AND i.sla_vence_at < NOW() + INTERVAL '6 hours'" .
        " AND i.estado NOT IN ('Resuelto','Cerrado','Duplicado')" .
        " ORDER BY i.sla_vence_at ASC LIMIT 50"
      )->fetchAll();
    } catch (Throwable $e) {
      Response::json(['data' => []], 200);
    }
    $libre = null;
    try {
      $r = $db->query(
        "SELECT u.id, u.nombre, COUNT(i.id) c FROM usuarios u" .
        " LEFT JOIN incidentes i ON i.asignado_a = u.id AND i.estado NOT IN ('Resuelto','Cerrado','Duplicado')" .
        " WHERE u.rol = 'agente' GROUP BY u.id, u.nombre ORDER BY c ASC LIMIT 1"
      )->fetch();
      if ($r) $libre = ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'activos' => (int)$r['c']];
    } catch (Throwable $e) { $libre = null; }
    $rows = array_map(function (array $x): array {
      $x['id'] = (int)$x['id'];
      return $x;
    }, $rows);
    Response::json(['data' => $rows, 'sugerencia_reasignar' => $libre], 200);
  }

  // Revisa vencidos y notifica asignados (disparo manual, sin cron).
  public static function slaRevisar(PDO $db, array $claims): void {
    $m = new Incidente($db);
    $avisados = 0;
    try {
      $rows = $db->query(
        "SELECT id, asignado_a FROM incidentes WHERE sla_vence_at IS NOT NULL AND sla_vence_at < NOW()" .
        " AND estado NOT IN ('Resuelto','Cerrado','Duplicado') LIMIT 100"
      )->fetchAll();
      foreach ($rows as $r) {
        $m->registrarEvento((int)$r['id'], (int)($claims['sub'] ?? 0) ?: null, 'estado', 'SLA vencido');
        if (class_exists('Notificacion')) {
          Notificacion::avisarCaso($db, (int)$r['id'], 'sla', 'Tu caso #' . $r['id'] . ' superó el tiempo de respuesta', null);
          $avisados++;
        }
      }
    } catch (Throwable $e) {
      Response::error('Error interno del servidor', 500);
    }
    Response::json(['data' => ['revisados' => count($rows ?? []), 'avisados' => $avisados]], 200);
  }

  // Verifica cadena hash de un incidente.
  public static function auditoriaVerificar(PDO $db, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    if (!class_exists('AuditoriaHash')) Response::error('Auditoría no disponible', 404);
    Response::json(['data' => AuditoriaHash::verificar($db, $id) + ['incidente_id' => $id]], 200);
  }

  // Re-sella cadena (backfill). Solo agente.
  public static function auditoriaResellar(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    if (!$m->findById($id)) Response::error('Incidente no encontrado', 404);
    if (!class_exists('AuditoriaHash')) Response::error('Auditoría no disponible', 404);
    $n = AuditoriaHash::resellar($db, $id);
    Logger::info('auditoria_resellar', ['inc' => $id, 'eventos' => $n]);
    Response::json(['data' => ['incidente_id' => $id, 'resellados' => $n]], 200);
  }
}
