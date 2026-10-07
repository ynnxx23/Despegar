<?php
// Incidente: dominio Grupo 8. Prioridad Baja/Alta/Critica, estado Abierto/EnGestion/Resuelto.
// Gestion de casos: sugerencia de prioridad, SLA, asignado, eventos y seguidores.
class Incidente {
  public const TIPOS = [
    'Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva',
    'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro',
  ];
  public const PRIORIDADES = ['Baja', 'Alta', 'Critica'];
  public const ESTADOS = ['Abierto', 'EnGestion', 'Resuelto'];
  // Horas de primera respuesta por prioridad (SLA).
  public const SLA_HORAS = ['Critica' => 4, 'Alta' => 24, 'Baja' => 72];
  // Palabras que suben un nivel la sugerencia (maximo Critica).
  public const KEYWORDS_BUMP = [
    'urgente', 'varad', 'hoy', 'ahora', 'estafa',
    'menor', 'salud', 'hospital', 'embarazada', 'discapacidad',
  ];

  private PDO $db;
  public function __construct(PDO $db) { $this->db = $db; }

  // Sugerencia pura: base por tipo + bump +1 si hay keyword en titulo/descripcion.
  // Retorna [sugerida, motivo]. Motivo: 'Sugerida por tipo X' (+ ' palabras: ...' si hubo bump).
  public static function sugerirPrioridad(string $tipo, string $titulo, string $descripcion): array {
    $base = [
      'Fraude' => 'Critica',
      'Vuelo_cancelado' => 'Alta',
      'Hotel_sin_reserva' => 'Alta',
      'Equipaje' => 'Alta',
      'Cobro_indebido' => 'Alta',
      'Vuelo_retrasado' => 'Baja',
      'Otro' => 'Baja',
    ];
    $sugerida = $base[$tipo] ?? 'Baja';
    $texto = mb_strtolower($titulo . ' ' . $descripcion, 'UTF-8');
    $hits = [];
    foreach (self::KEYWORDS_BUMP as $kw) {
      if (mb_strpos($texto, mb_strtolower($kw, 'UTF-8')) !== false) $hits[] = $kw;
    }
    $motivo = 'Sugerida por tipo ' . $tipo;
    if ($hits) {
      $orden = ['Baja' => 0, 'Alta' => 1, 'Critica' => 2];
      $nivel = min(($orden[$sugerida] ?? 0) + 1, 2);
      $sugerida = array_search($nivel, $orden, true);
      $motivo .= ' palabras: ' . implode(', ', $hits);
    }
    return [$sugerida, $motivo];
  }

  // PG devuelve enteros como string: normalizar para contrato JSON estable (id numericos).
  private static function norm(array $row): array {
    $row['id'] = (int)$row['id'];
    $row['user_id'] = (int)$row['user_id'];
    $row['reserva_id'] = $row['reserva_id'] === null ? null : (int)$row['reserva_id'];
    if (array_key_exists('triado_por', $row)) {
      $row['triado_por'] = $row['triado_por'] === null ? null : (int)$row['triado_por'];
    }
    if (array_key_exists('asignado_a', $row)) {
      $row['asignado_a'] = $row['asignado_a'] === null ? null : (int)$row['asignado_a'];
    }
    return $row;
  }

  // Proyeccion viajero: NUNCA expone prioridad real ni triaje/SLA/asignado crudo.
  // Conserva prioridad_sugerida + motivo para que el viajero vea la sugerencia.
  public static function toPublic(array $row): array {
    $r = self::norm($row);
    unset($r['prioridad'], $r['triado_por'], $r['triado_at'], $r['sla_vence_at']);
    unset($r['asignado_a']);
    return $r;
  }

  // Proyeccion agente: fila completa (con prioridad, sugerencia, triaje y SLA).
  public static function toAgent(array $row): array {
    return self::norm($row);
  }

  public function create(int $userId, ?int $reservaId, string $tipo, string $titulo, string $descripcion): int {
    [$sugerida, $motivo] = self::sugerirPrioridad($tipo, $titulo, $descripcion);
    try {
      $st = $this->db->prepare(
        'INSERT INTO incidentes (user_id, reserva_id, tipo, titulo, descripcion, prioridad_sugerida, prioridad_motivo) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      $st->execute([$userId, $reservaId, $tipo, $titulo, $descripcion, $sugerida, $motivo]);
    } catch (PDOException $e) {
      // Compatibilidad si migrate_02 aun no se aplico: inserta sin sugerencia.
      if (($e->errorInfo[0] ?? '') === '42703') {
        $st = $this->db->prepare(
          'INSERT INTO incidentes (user_id, reserva_id, tipo, titulo, descripcion) VALUES (?, ?, ?, ?, ?)'
        );
        $st->execute([$userId, $reservaId, $tipo, $titulo, $descripcion]);
        $id = (int)$this->db->lastInsertId();
        return $id;
      }
      throw $e;
    }
    return (int)$this->db->lastInsertId();
  }

  public function findById(int $id): ?array {
    $st = $this->db->prepare('SELECT * FROM incidentes WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $row = $st->fetch();
    return $row ? self::norm($row) : null;
  }

  // Nombre del agente asignado (para atendido_por del viajero).
  public function asignadoNombre(int $id): ?string {
    $st = $this->db->prepare(
      'SELECT u.nombre FROM incidentes i JOIN usuarios u ON u.id = i.asignado_a WHERE i.id = ? LIMIT 1'
    );
    $st->execute([$id]);
    $n = $st->fetchColumn();
    return $n === false || $n === null ? null : (string)$n;
  }

  // Orden urgencia: vencidos SLA primero, luego sin triar, luego Critica/Alta/Baja, luego creado ASC.
  private static function ordenUrgencia(): string {
    return " ORDER BY" .
      " CASE WHEN sla_vence_at IS NOT NULL AND sla_vence_at < NOW() AND estado <> 'Resuelto' THEN 0 ELSE 1 END ASC," .
      " CASE WHEN prioridad IS NULL THEN 0 ELSE 1 END ASC," .
      " CASE prioridad WHEN 'Critica' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Baja' THEN 2 ELSE 3 END ASC," .
      " sla_vence_at ASC NULLS LAST," .
      " creado_at ASC";
  }

  public function listAll(?string $estado, ?string $prioridad, string $orden, int $limit, int $offset): array {
    $sql = 'SELECT * FROM incidentes WHERE 1=1';
    $params = [];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    if ($prioridad !== null) { $sql .= ' AND prioridad = ?'; $params[] = $prioridad; }
    if ($orden === 'urgencia') {
      $sql .= self::ordenUrgencia();
    } else {
      $sql .= $orden === 'desc' ? ' ORDER BY creado_at DESC' : ' ORDER BY creado_at ASC';
    }
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

  // Mi cola: asignados a mi o seguidos por mi, no Resueltos salvo filtro explicito.
  public function miCola(int $agenteId, ?string $estado, ?string $prioridad, string $orden, int $limit, int $offset): array {
    $sql = 'SELECT i.* FROM incidentes i' .
      ' WHERE (i.asignado_a = ? OR EXISTS (SELECT 1 FROM incidente_seguidores s WHERE s.incidente_id = i.id AND s.agente_id = ?))';
    $params = [$agenteId, $agenteId];
    if ($estado !== null) {
      $sql .= ' AND i.estado = ?';
      $params[] = $estado;
    } else {
      $sql .= " AND i.estado <> 'Resuelto'";
    }
    if ($prioridad !== null) { $sql .= ' AND i.prioridad = ?'; $params[] = $prioridad; }
    if ($orden === 'urgencia') {
      $sql .= " ORDER BY" .
        " CASE WHEN i.sla_vence_at IS NOT NULL AND i.sla_vence_at < NOW() AND i.estado <> 'Resuelto' THEN 0 ELSE 1 END ASC," .
        " CASE WHEN i.prioridad IS NULL THEN 0 ELSE 1 END ASC," .
        " CASE i.prioridad WHEN 'Critica' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Baja' THEN 2 ELSE 3 END ASC," .
        " i.sla_vence_at ASC NULLS LAST," .
        " i.creado_at ASC";
    } else {
      $sql .= $orden === 'desc' ? ' ORDER BY i.creado_at DESC' : ' ORDER BY i.creado_at ASC';
    }
    $sql .= ' LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  public function countMiCola(int $agenteId, ?string $estado, ?string $prioridad): int {
    $sql = 'SELECT COUNT(*) FROM incidentes i' .
      ' WHERE (i.asignado_a = ? OR EXISTS (SELECT 1 FROM incidente_seguidores s WHERE s.incidente_id = i.id AND s.agente_id = ?))';
    $params = [$agenteId, $agenteId];
    if ($estado !== null) {
      $sql .= ' AND i.estado = ?';
      $params[] = $estado;
    } else {
      $sql .= " AND i.estado <> 'Resuelto'";
    }
    if ($prioridad !== null) { $sql .= ' AND i.prioridad = ?'; $params[] = $prioridad; }
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }

  // Registra un evento de gestion (actor puede ser null).
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

  // Historial interno con nombre de actor (para agente).
  public function historial(int $incidenteId): array {
    $st = $this->db->prepare(
      'SELECT e.id, e.accion, e.detalle, e.creado_at, e.actor_id, u.nombre AS actor_nombre' .
      ' FROM incidente_eventos e LEFT JOIN usuarios u ON u.id = e.actor_id' .
      ' WHERE e.incidente_id = ? ORDER BY e.creado_at ASC, e.id ASC'
    );
    $st->execute([$incidenteId]);
    return array_map(function (array $r): array {
      $r['id'] = (int)$r['id'];
      $r['actor_id'] = $r['actor_id'] === null ? null : (int)$r['actor_id'];
      return $r;
    }, $st->fetchAll());
  }

  // Historial publico para el viajero: solo claim/responder/estado/resuelto/reabierto.
  public function historialPublico(int $incidenteId): array {
    $rows = $this->historial($incidenteId);
    $out = [];
    foreach ($rows as $e) {
      $nombre = $e['actor_nombre'] ?? 'El equipo';
      switch ($e['accion']) {
        case 'claim':
          $out[] = ['texto' => $nombre . ' tomó tu caso', 'creado_at' => $e['creado_at']];
          break;
        case 'responder':
          $out[] = ['texto' => 'El equipo respondió', 'creado_at' => $e['creado_at']];
          break;
        case 'estado':
          $est = $e['detalle'] ?: 'EnGestion';
          $out[] = ['texto' => 'Tu caso pasó a ' . $est, 'creado_at' => $e['creado_at']];
          break;
        case 'resuelto':
          $out[] = ['texto' => $nombre . ' marcó tu caso como resuelto', 'creado_at' => $e['creado_at']];
          break;
        case 'reabierto':
          $out[] = ['texto' => 'Tu caso fue reabierto', 'creado_at' => $e['creado_at']];
          break;
        default:
          break;
      }
    }
    return $out;
  }

  public function update(int $id, ?string $prioridad, ?string $estado, ?int $triadoPor = null): void {
    $sets = [];
    $params = [];
    if ($prioridad !== null) {
      $sets[] = 'prioridad = ?';
      $params[] = $prioridad;
      // SLA: now + horas segun prioridad.
      $horas = self::SLA_HORAS[$prioridad] ?? 72;
      $sets[] = "sla_vence_at = NOW() + INTERVAL '{$horas} hours'";
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
      // Compatibilidad si migrate_02 aun no se aplico: reintenta sin triaje/SLA.
      if (($e->errorInfo[0] ?? '') === '42703') {
        $sets = [];
        $params = [];
        if ($prioridad !== null) { $sets[] = 'prioridad = ?'; $params[] = $prioridad; }
        if ($estado !== null) { $sets[] = 'estado = ?'; $params[] = $estado; }
        if (!$sets) return;
        $params[] = $id;
        $st = $this->db->prepare('UPDATE incidentes SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $st->execute($params);
        return;
      }
      throw $e;
    }
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
}
