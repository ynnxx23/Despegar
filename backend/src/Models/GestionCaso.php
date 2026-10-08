<?php
// Gestion del caso: agente asignado, seguidores, eventos e historial.
// Vive aparte de Incidente porque responde a "quien lo atiende y quien lo mira",
// no al estado del incidente en si.
class GestionCaso {
  private PDO $db;
  public function __construct(PDO $db) { $this->db = $db; }

  // Agente que reclamo el caso, o null si esta sin asignar.
  public function asignado(int $id): ?array {
    $st = $this->db->prepare(
      'SELECT u.id, u.nombre, u.email FROM incidentes i JOIN usuarios u ON u.id = i.asignado_a WHERE i.id = ? LIMIT 1'
    );
    $st->execute([$id]);
    $a = $st->fetch();
    if (!$a) return null;
    return ['id' => (int)$a['id'], 'nombre' => (string)$a['nombre'], 'email' => (string)$a['email']];
  }

  // Nombre del agente asignado (para el atendido_por que ve el viajero).
  public function asignadoNombre(int $id): ?string {
    $st = $this->db->prepare(
      'SELECT u.nombre FROM incidentes i JOIN usuarios u ON u.id = i.asignado_a WHERE i.id = ? LIMIT 1'
    );
    $st->execute([$id]);
    $n = $st->fetchColumn();
    return $n === false || $n === null ? null : (string)$n;
  }

  // Agentes que siguen el caso: puede seguirlo cualquiera, tenga o no el caso.
  public function seguidores(int $id): array {
    $st = $this->db->prepare(
      'SELECT u.id, u.nombre, u.email FROM incidente_seguidores s'
      . ' JOIN usuarios u ON u.id = s.agente_id WHERE s.incidente_id = ? ORDER BY u.nombre'
    );
    $st->execute([$id]);
    return array_map(function (array $r): array {
      return ['id' => (int)$r['id'], 'nombre' => (string)$r['nombre'], 'email' => (string)$r['email']];
    }, $st->fetchAll());
  }

  public function siguiendo(int $id, int $agenteId): bool {
    if ($agenteId <= 0) return false;
    $st = $this->db->prepare('SELECT 1 FROM incidente_seguidores WHERE incidente_id = ? AND agente_id = ? LIMIT 1');
    $st->execute([$id, $agenteId]);
    return (bool)$st->fetchColumn();
  }

  // Registra un evento de gestion (el actor puede ser null).
  public function registrarEvento(int $incidenteId, ?int $actorId, string $accion, ?string $detalle = null): void {
    try {
      $st = $this->db->prepare(
        'INSERT INTO incidente_eventos (incidente_id, actor_id, accion, detalle) VALUES (?, ?, ?, ?)'
      );
      $st->execute([$incidenteId, $actorId, $accion, $detalle]);
    } catch (PDOException $e) {
      // Si migrate_03 aun no se aplico, no rompe el flujo principal.
      if (($e->errorInfo[0] ?? '') === '42P01') return;
      throw $e;
    }
  }

  // Historial interno con nombre del actor (para el agente).
  public function historial(int $incidenteId): array {
    $st = $this->db->prepare(
      'SELECT e.id, e.accion, e.detalle, e.creado_at, e.actor_id, u.nombre AS actor_nombre'
      . ' FROM incidente_eventos e LEFT JOIN usuarios u ON u.id = e.actor_id'
      . ' WHERE e.incidente_id = ? ORDER BY e.creado_at ASC, e.id ASC'
    );
    $st->execute([$incidenteId]);
    return array_map(function (array $r): array {
      $r['id'] = (int)$r['id'];
      $r['actor_id'] = $r['actor_id'] === null ? null : (int)$r['actor_id'];
      return $r;
    }, $st->fetchAll());
  }

  // Historial publico del viajero: solo claim, respuesta, estado, resuelto y reabierto.
  public function historialPublico(int $incidenteId): array {
    $out = [];
    foreach ($this->historial($incidenteId) as $e) {
      $nombre = $e['actor_nombre'] ?? 'El equipo';
      switch ($e['accion']) {
        case 'claim':
          $out[] = ['texto' => $nombre . ' tomó tu caso', 'creado_at' => $e['creado_at']];
          break;
        case 'responder':
          $out[] = ['texto' => 'El equipo respondió', 'creado_at' => $e['creado_at']];
          break;
        case 'estado':
          $out[] = ['texto' => 'Tu caso pasó a ' . ($e['detalle'] ?: 'EnGestion'), 'creado_at' => $e['creado_at']];
          break;
        case 'resuelto':
          $out[] = ['texto' => $nombre . ' marcó tu caso como resuelto', 'creado_at' => $e['creado_at']];
          break;
        case 'reabierto':
          $out[] = ['texto' => 'Tu caso fue reabierto', 'creado_at' => $e['creado_at']];
          break;
      }
    }
    return $out;
  }
}
