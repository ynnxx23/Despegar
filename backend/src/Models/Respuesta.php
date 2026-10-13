<?php
// Respuesta: hilo 1:N por incidente (agente responde, viajero dueño lee).
class Respuesta {
  private PDO $db;
  public function __construct(PDO $db) { $this->db = $db; }

  public function listByIncidente(int $incidenteId, bool $soloPublicas = false, int $limit = 100, int $offset = 0): array {
    $sql =
      'SELECT r.id, r.mensaje, r.creado_at, u.nombre AS autor, u.rol AS autor_rol ' .
      'FROM respuestas r JOIN usuarios u ON u.id = r.autor_id ' .
      'WHERE r.incidente_id = ?';
    $params = [$incidenteId];
    if ($soloPublicas) {
      // Si columna aún no existe (pre-migrate_04), devuelve todo sin romper.
      try {
        $sql .= ' AND (r.es_interna IS NULL OR r.es_interna = FALSE)';
      } catch (Throwable $e) { /* noop */ }
    }
    $sql .= ' ORDER BY r.creado_at ASC LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;
    try {
      $st = $this->db->prepare($sql);
      $st->execute($params);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42703') {
        $st = $this->db->prepare(
          'SELECT r.id, r.mensaje, r.creado_at, u.nombre AS autor, u.rol AS autor_rol ' .
          'FROM respuestas r JOIN usuarios u ON u.id = r.autor_id ' .
          'WHERE r.incidente_id = ? ORDER BY r.creado_at ASC LIMIT ? OFFSET ?'
        );
        $st->execute([$incidenteId, $limit, $offset]);
      } else {
        throw $e;
      }
    }
    return array_map(function (array $r): array {
      $r['id'] = (int)$r['id']; // PG devuelve enteros como string
      return $r;
    }, $st->fetchAll());
  }

  // Inserta respuesta + marca EnGestion en UNA transacción vía función crear_respuesta().
  // Mapea P0002 (carrera: incidente borrado entre check e insert) a false para 404.
  // No toca Resuelto/Cerrado: si estado final, solo inserta sin cambiar estado (fix Fase 1).
  public function responderAtomico(int $incidenteId, int $autorId, string $mensaje): int|false {
    try {
      $st = $this->db->prepare('SELECT estado FROM incidentes WHERE id = ? LIMIT 1');
      $st->execute([$incidenteId]);
      $estado = $st->fetchColumn();
      if ($estado === false) return false;
      if (in_array($estado, ['Resuelto', 'Cerrado', 'Duplicado'], true)) {
        $st = $this->db->prepare('INSERT INTO respuestas (incidente_id, autor_id, mensaje) VALUES (?, ?, ?) RETURNING id');
        try {
          $st->execute([$incidenteId, $autorId, $mensaje]);
        } catch (PDOException $e) {
          if (($e->errorInfo[0] ?? '') === '42703') {
            $st = $this->db->prepare('INSERT INTO respuestas (incidente_id, autor_id, mensaje) VALUES (?, ?, ?) RETURNING id');
            $st->execute([$incidenteId, $autorId, $mensaje]);
          } else {
            throw $e;
          }
        }
        return (int)$st->fetchColumn();
      }
      $st = $this->db->prepare('SELECT crear_respuesta(?, ?, ?)');
      $st->execute([$incidenteId, $autorId, $mensaje]);
      return (int)$st->fetchColumn();
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === 'P0002') return false;
      throw $e;
    }
  }

  // Inserta respuesta viajero/agente. Si es viajero y caso Resuelto/Cerrado -> reabre a EnGestion + evento.
  // $interna solo válida para agente; viajero siempre pública.
  public function responderConReapertura(int $incidenteId, int $autorId, string $rol, string $mensaje, bool $interna = false): array {
    $this->db->beginTransaction();
    try {
      $st = $this->db->prepare('SELECT estado FROM incidentes WHERE id = ? FOR UPDATE');
      $st->execute([$incidenteId]);
      $estado = $st->fetchColumn();
      if ($estado === false) {
        $this->db->rollBack();
        return ['ok' => false];
      }
      $esInterna = ($rol === 'agente' && $interna);
      try {
        $st = $this->db->prepare('INSERT INTO respuestas (incidente_id, autor_id, mensaje, es_interna) VALUES (?, ?, ?, ?) RETURNING id');
        $st->execute([$incidenteId, $autorId, $mensaje, $esInterna ? 't' : 'f']);
        $rid = (int)$st->fetchColumn();
      } catch (PDOException $e) {
        if (($e->errorInfo[0] ?? '') === '42703') {
          $st = $this->db->prepare('INSERT INTO respuestas (incidente_id, autor_id, mensaje) VALUES (?, ?, ?) RETURNING id');
          $st->execute([$incidenteId, $autorId, $mensaje]);
          $rid = (int)$st->fetchColumn();
        } else {
          throw $e;
        }
      }
      $reabierto = false;
      if ($rol === 'viajero' && in_array($estado, ['Resuelto', 'Cerrado', 'Duplicado'], true)) {
        $st = $this->db->prepare("UPDATE incidentes SET estado = 'EnGestion' WHERE id = ?");
        $st->execute([$incidenteId]);
        $reabierto = true;
      } elseif ($rol === 'agente' && !$esInterna && $estado === 'Abierto') {
        $st = $this->db->prepare("UPDATE incidentes SET estado = 'EnGestion' WHERE id = ?");
        $st->execute([$incidenteId]);
      }
      $this->db->commit();
      return ['ok' => true, 'id' => $rid, 'reabierto' => $reabierto];
    } catch (Throwable $e) {
      if ($this->db->inTransaction()) $this->db->rollBack();
      throw $e;
    }
  }
}
