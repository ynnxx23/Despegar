<?php
// Incidente: dominio Grupo 8. Prioridad Baja/Alta/Critica, estado Abierto/EnGestion/Resuelto.
class Incidente {
  public const TIPOS = ['Vuelo_cancelado', 'Hotel_sin_reserva', 'Fraude', 'Otro'];
  public const PRIORIDADES = ['Baja', 'Alta', 'Critica'];
  public const ESTADOS = ['Abierto', 'EnGestion', 'Resuelto'];

  private PDO $db;
  public function __construct(PDO $db) { $this->db = $db; }

  // PG devuelve enteros como string: normalizar para contrato JSON estable (id numéricos).
  private static function norm(array $row): array {
    $row['id'] = (int)$row['id'];
    $row['user_id'] = (int)$row['user_id'];
    $row['reserva_id'] = $row['reserva_id'] === null ? null : (int)$row['reserva_id'];
    if (array_key_exists('triado_por', $row)) {
      $row['triado_por'] = $row['triado_por'] === null ? null : (int)$row['triado_por'];
    }
    return $row;
  }

  // Proyeccion viajero: NUNCA expone prioridad ni campos de triaje/SLA.
  public static function toPublic(array $row): array {
    $r = self::norm($row);
    unset($r['prioridad'], $r['prioridad_sugerida'], $r['prioridad_motivo']);
    unset($r['triado_por'], $r['triado_at'], $r['sla_vence_at']);
    return $r;
  }

  // Proyeccion agente: fila completa (con prioridad y triaje).
  public static function toAgent(array $row): array {
    return self::norm($row);
  }

  public function create(int $userId, ?int $reservaId, string $tipo, string $titulo, string $descripcion): int {
    $st = $this->db->prepare(
      'INSERT INTO incidentes (user_id, reserva_id, tipo, titulo, descripcion) VALUES (?, ?, ?, ?, ?)'
    );
    $st->execute([$userId, $reservaId, $tipo, $titulo, $descripcion]);
    return (int)$this->db->lastInsertId();
  }

  public function findById(int $id): ?array {
    $st = $this->db->prepare('SELECT * FROM incidentes WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $row = $st->fetch();
    return $row ? self::norm($row) : null;
  }

  public function listByUser(int $userId, ?string $estado = null): array {
    $sql = 'SELECT * FROM incidentes WHERE user_id = ?';
    $params = [$userId];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    $sql .= ' ORDER BY creado_at DESC';
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  public function listAll(?string $estado, ?string $prioridad, string $orden, int $limit, int $offset): array {
    $sql = 'SELECT * FROM incidentes WHERE 1=1';
    $params = [];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    if ($prioridad !== null) { $sql .= ' AND prioridad = ?'; $params[] = $prioridad; }
    $sql .= $orden === 'desc' ? ' ORDER BY creado_at DESC' : ' ORDER BY creado_at ASC';
    $sql .= ' LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  public function countAll(?string $estado, ?string $prioridad): int {
    $sql = 'SELECT COUNT(*) FROM incidentes WHERE 1=1';
    $params = [];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    if ($prioridad !== null) { $sql .= ' AND prioridad = ?'; $params[] = $prioridad; }
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }

  public function update(int $id, ?string $prioridad, ?string $estado, ?int $triadoPor = null): void {
    $sets = [];
    $params = [];
    if ($prioridad !== null) {
      $sets[] = 'prioridad = ?';
      $params[] = $prioridad;
      if ($triadoPor !== null) {
        $sets[] = 'triado_por = ?';
        $params[] = $triadoPor;
        $sets[] = 'triado_at = CURRENT_TIMESTAMP';
      }
    }
    if ($estado !== null) { $sets[] = 'estado = ?'; $params[] = $estado; }
    if (!$sets) return;
    $params[] = $id;
    try {
      $st = $this->db->prepare('UPDATE incidentes SET ' . implode(', ', $sets) . ' WHERE id = ?');
      $st->execute($params);
    } catch (PDOException $e) {
      // Compatibilidad si migrate_02 aun no se aplico (sin triado_por/triado_at): reintenta sin triaje.
      if ($prioridad !== null && $triadoPor !== null && ($e->errorInfo[0] ?? '') === '42703') {
        $sets = ['prioridad = ?'];
        $params = [$prioridad];
        if ($estado !== null) { $sets[] = 'estado = ?'; $params[] = $estado; }
        $params[] = $id;
        $st = $this->db->prepare('UPDATE incidentes SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $st->execute($params);
        return;
      }
      throw $e;
    }
  }
}
