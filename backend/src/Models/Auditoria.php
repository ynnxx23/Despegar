<?php
// Historial de cambios de usuarios (tabla usuarios_auditoria).
// Cada accion de un admin queda registrada con el actor, el campo afectado
// y los valores anterior/nuevo.
class Auditoria {
  public static function registrar(
    PDO $db,
    ?int $usuarioId,
    ?int $actorId,
    string $accion,
    ?string $campo = null,
    ?string $valorAnterior = null,
    ?string $valorNuevo = null,
    ?string $detalle = null
  ): void {
    $st = $db->prepare(
      'INSERT INTO usuarios_auditoria (usuario_id, actor_id, accion, campo, valor_anterior, valor_nuevo, detalle)
       VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
      $usuarioId,
      $actorId,
      $accion,
      $campo,
      $valorAnterior,
      $valorNuevo,
      $detalle,
    ]);
  }

  // Historial de un usuario concreto (mas reciente primero).
  public static function porUsuario(PDO $db, int $usuarioId, int $limite = 50): array {
    $st = $db->prepare(
      'SELECT a.id, a.usuario_id, a.actor_id, a.accion, a.campo, a.valor_anterior, a.valor_nuevo,
              a.detalle, a.creado_at, u.nombre AS usuario_nombre, u.email AS usuario_email,
              ac.nombre AS actor_nombre, ac.email AS actor_email
       FROM usuarios_auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN usuarios ac ON ac.id = a.actor_id
       WHERE a.usuario_id = ?
       ORDER BY a.creado_at DESC, a.id DESC
       LIMIT ?'
    );
    $st->execute([$usuarioId, max(1, min($limite, 200))]);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  // Feed global de cambios (opcionalmente filtrado por usuario).
  public static function feed(PDO $db, ?int $usuarioId = null, int $limite = 100): array {
    $sql =
      'SELECT a.id, a.usuario_id, a.actor_id, a.accion, a.campo, a.valor_anterior, a.valor_nuevo,
              a.detalle, a.creado_at, u.nombre AS usuario_nombre, u.email AS usuario_email,
              ac.nombre AS actor_nombre, ac.email AS actor_email
       FROM usuarios_auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN usuarios ac ON ac.id = a.actor_id';
    $params = [];
    if ($usuarioId !== null && $usuarioId > 0) {
      $sql .= ' WHERE a.usuario_id = ?';
      $params[] = $usuarioId;
    }
    $sql .= ' ORDER BY a.creado_at DESC, a.id DESC LIMIT ?';
    $params[] = max(1, min($limite, 200));
    $st = $db->prepare($sql);
    $st->execute($params);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  private static function norm(array $r): array {
    $r['id'] = (int)$r['id'];
    $r['usuario_id'] = $r['usuario_id'] === null ? null : (int)$r['usuario_id'];
    $r['actor_id'] = $r['actor_id'] === null ? null : (int)$r['actor_id'];
    return $r;
  }
}
