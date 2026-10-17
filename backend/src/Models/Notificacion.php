<?php
// Notificaciones in-app (Fase 4b). Push FCM/email/WhatsApp quedan como stub con log
// (requieren claves proveedor). La app hace polling cada 30s.
class Notificacion {
  public static function crear(PDO $db, int $userId, ?int $incidenteId, string $tipo, string $texto): void {
    try {
      $st = $db->prepare('INSERT INTO notificaciones (user_id, incidente_id, tipo, texto) VALUES (?, ?, ?, ?)');
      $st->execute([$userId, $incidenteId, $tipo, $texto]);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') return; // pre-migrate_05
      throw $e;
    }
    // Stub multicanal: deja traza para conectar proveedor real.
    Logger::info('notif', ['user' => $userId, 'tipo' => $tipo, 'inc' => $incidenteId]);
    // Push real por canales configurados (log por defecto, nunca rompe).
    try {
      if (class_exists('Push')) {
        $email = null;
        try {
          $st = $db->prepare('SELECT email FROM usuarios WHERE id = ? LIMIT 1');
          $st->execute([$userId]);
          $email = $st->fetchColumn() ?: null;
        } catch (Throwable $e) { $email = null; }
        Push::enviar($userId, is_string($email) ? $email : null, $tipo, $texto, $incidenteId);
      }
    } catch (Throwable $e) { /* push opcional */ }
  }

  // Avisa al dueño + asignado + seguidores de un incidente.
  public static function avisarCaso(PDO $db, int $incidenteId, string $tipo, string $texto, ?int $excepto = null): void {
    try {
      $st = $db->prepare('SELECT user_id, asignado_a FROM incidentes WHERE id = ? LIMIT 1');
      $st->execute([$incidenteId]);
      $inc = $st->fetch();
      if (!$inc) return;
      $destinos = [];
      if (!empty($inc['user_id'])) $destinos[] = (int)$inc['user_id'];
      if (!empty($inc['asignado_a'])) $destinos[] = (int)$inc['asignado_a'];
      try {
        $st = $db->prepare('SELECT agente_id FROM incidente_seguidores WHERE incidente_id = ?');
        $st->execute([$incidenteId]);
        foreach ($st->fetchAll() as $s) $destinos[] = (int)$s['agente_id'];
      } catch (PDOException $e) { /* pre-migrate_03 */ }
      foreach (array_unique($destinos) as $uid) {
        if ($excepto !== null && $uid === $excepto) continue;
        self::crear($db, $uid, $incidenteId, $tipo, $texto);
      }
    } catch (Throwable $e) { /* notificar nunca rompe flujo */ }
  }

  public static function listar(PDO $db, int $userId, int $limit, int $offset, bool $soloNoLeidas): array {
    $sql = 'SELECT id, incidente_id, tipo, texto, leida, creado_at FROM notificaciones WHERE user_id = ?';
    $params = [$userId];
    if ($soloNoLeidas) $sql .= ' AND leida = FALSE';
    $sql .= ' ORDER BY creado_at DESC, id DESC LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;
    try {
      $st = $db->prepare($sql);
      $st->execute($params);
      return array_map(function (array $r): array {
        $r['id'] = (int)$r['id'];
        $r['incidente_id'] = $r['incidente_id'] === null ? null : (int)$r['incidente_id'];
        // PG devuelve boolean como 't'/'f': normalizar (casilla 'f' es truthy en PHP).
        $r['leida'] = !in_array($r['leida'], [false, 0, '0', 'f', 'F', 'false', null], true);
        return $r;
      }, $st->fetchAll());
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') return [];
      throw $e;
    }
  }

  public static function contarNoLeidas(PDO $db, int $userId): int {
    try {
      $st = $db->prepare('SELECT COUNT(*) FROM notificaciones WHERE user_id = ? AND leida = FALSE');
      $st->execute([$userId]);
      return (int)$st->fetchColumn();
    } catch (PDOException $e) {
      return 0;
    }
  }
}
