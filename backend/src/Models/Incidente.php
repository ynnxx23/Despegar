<?php
// Incidente: dominio Grupo 8. Prioridad Baja/Alta/Critica, estado Abierto/EnGestion/Resuelto.
// Gestion de casos: sugerencia de prioridad, SLA, asignado, eventos y seguidores.
class Incidente {
  public const TIPOS = [
    'Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva',
    'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro',
  ];
  public const PRIORIDADES = ['Baja', 'Alta', 'Critica'];
  public const ESTADOS = ['Abierto', 'EnGestion', 'PendienteViajero', 'Escalado', 'Resuelto', 'Duplicado', 'Cerrado'];
  // Estados visibles viajero (el resto es gestión interna pero no se oculta el historial público).
  public const ESTADOS_FINALES = ['Resuelto', 'Duplicado', 'Cerrado'];
  // Transiciones válidas agente. Viajero solo reabre/cancela vía endpoints propios.
  public const TRANSICIONES = [
    'Abierto' => ['EnGestion', 'PendienteViajero', 'Escalado', 'Resuelto', 'Duplicado'],
    'EnGestion' => ['PendienteViajero', 'Escalado', 'Resuelto', 'Duplicado', 'Abierto'],
    'PendienteViajero' => ['EnGestion', 'Escalado', 'Resuelto', 'Duplicado'],
    'Escalado' => ['EnGestion', 'Resuelto', 'Duplicado'],
    'Resuelto' => ['EnGestion', 'Cerrado'],
    'Duplicado' => ['EnGestion'],
    'Cerrado' => [],
  ];
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

  public function create(int $userId, ?int $reservaId, string $tipo, string $titulo, string $descripcion, ?string $idempotencyKey = null): int {
    // Idempotencia: misma key + mismo usuario -> devuelve incidente existente.
    if ($idempotencyKey !== null && $idempotencyKey !== '') {
      try {
        $st = $this->db->prepare('SELECT incidente_id FROM incidente_idempotencia WHERE key = ? AND user_id = ? LIMIT 1');
        $st->execute([$idempotencyKey, $userId]);
        $prev = $st->fetchColumn();
        if ($prev !== false && $prev !== null) return (int)$prev;
      } catch (PDOException $e) {
        if (($e->errorInfo[0] ?? '') !== '42P01') throw $e;
      }
    }
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
    $id = (int)$this->db->lastInsertId();
    if ($idempotencyKey !== null && $idempotencyKey !== '') {
      try {
        $st = $this->db->prepare('INSERT INTO incidente_idempotencia (key, user_id, incidente_id) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING');
        $st->execute([$idempotencyKey, $userId, $id]);
      } catch (PDOException $e) {
        if (($e->errorInfo[0] ?? '') !== '42P01') throw $e;
      }
    }
    return $id;
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

  // Horas SLA: lee sla_politicas si existe, fallback a constante.
  public function slaHoras(string $prioridad): int {
    try {
      $st = $this->db->prepare('SELECT horas FROM sla_politicas WHERE prioridad = ? LIMIT 1');
      $st->execute([$prioridad]);
      $h = $st->fetchColumn();
      if ($h !== false && (int)$h >= 1) return (int)$h;
    } catch (PDOException $e) { /* tabla aún no migrada */ }
    return self::SLA_HORAS[$prioridad] ?? 72;
  }

  public static function transicionValida(string $desde, string $hacia): bool {
    if ($desde === $hacia) return true;
    return in_array($hacia, self::TRANSICIONES[$desde] ?? [], true);
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

  public function listAll(?string $estado, ?string $prioridad, string $orden, int $limit, int $offset, ?string $q = null, ?string $tipo = null): array {
    $sql = 'SELECT * FROM incidentes WHERE 1=1';
    $params = [];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    if ($prioridad !== null) { $sql .= ' AND prioridad = ?'; $params[] = $prioridad; }
    if ($tipo !== null) { $sql .= ' AND tipo = ?'; $params[] = $tipo; }
    if ($q !== null && $q !== '') { $sql .= ' AND (titulo ILIKE ? OR descripcion ILIKE ? OR CAST(id AS TEXT) = ?)'; $like = '%' . $q . '%'; $params[] = $like; $params[] = $like; $params[] = $q; }
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

  public function countAll(?string $estado, ?string $prioridad, ?string $q = null, ?string $tipo = null): int {
    $sql = 'SELECT COUNT(*) FROM incidentes WHERE 1=1';
    $params = [];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    if ($prioridad !== null) { $sql .= ' AND prioridad = ?'; $params[] = $prioridad; }
    if ($tipo !== null) { $sql .= ' AND tipo = ?'; $params[] = $tipo; }
    if ($q !== null && $q !== '') { $sql .= ' AND (titulo ILIKE ? OR descripcion ILIKE ? OR CAST(id AS TEXT) = ?)'; $like = '%' . $q . '%'; $params[] = $like; $params[] = $like; $params[] = $q; }
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

  // Registra un evento de gestion (actor puede ser null). Guarda IP/UA si columnas existen.
  // Retorna id del evento (0 si tabla ausente). Sella hash encadenado si migrate_05 aplicada.
  public function registrarEvento(int $incidenteId, ?int $actorId, string $accion, ?string $detalle = null): int {
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? null);
    if (is_string($ip)) $ip = trim(explode(',', $ip)[0]);
    if (!is_string($ip) || $ip === '') $ip = null;
    if ($ip !== null && strlen($ip) > 45) $ip = substr($ip, 0, 45);
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;
    if (is_string($ua) && $ua !== '' && strlen($ua) > 500) $ua = substr($ua, 0, 500);
    if ($ua === '') $ua = null;
    try {
      $st = $this->db->prepare(
        'INSERT INTO incidente_eventos (incidente_id, actor_id, accion, detalle, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
      );
      $st->execute([$incidenteId, $actorId, $accion, $detalle, $ip, $ua]);
      $eid = (int)$st->fetchColumn();
    } catch (PDOException $e) {
      // Si migrate_03/04 aun no se aplico, no rompe el flujo principal.
      if (($e->errorInfo[0] ?? '') === '42P01' || ($e->errorInfo[0] ?? '') === '42703') {
        try {
          $st = $this->db->prepare(
            'INSERT INTO incidente_eventos (incidente_id, actor_id, accion, detalle) VALUES (?, ?, ?, ?) RETURNING id'
          );
          $st->execute([$incidenteId, $actorId, $accion, $detalle]);
          return (int)$st->fetchColumn();
        } catch (PDOException $e2) {
          if (($e2->errorInfo[0] ?? '') === '42P01') return 0;
          throw $e2;
        }
      }
      throw $e;
    }
    try {
      if (class_exists('AuditoriaHash') && $eid > 0) AuditoriaHash::sellar($this->db, $eid);
    } catch (Throwable $e) { /* sello opcional */ }
    return $eid;
  }

  // Historial interno con nombre de actor (para agente). Incluye hash si existe.
  public function historial(int $incidenteId): array {
    try {
      $st = $this->db->prepare(
        'SELECT e.id, e.accion, e.detalle, e.creado_at, e.actor_id, u.nombre AS actor_nombre, e.hash' .
        ' FROM incidente_eventos e LEFT JOIN usuarios u ON u.id = e.actor_id' .
        ' WHERE e.incidente_id = ? ORDER BY e.creado_at ASC, e.id ASC'
      );
      $st->execute([$incidenteId]);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') !== '42703') throw $e;
      $st = $this->db->prepare(
        'SELECT e.id, e.accion, e.detalle, e.creado_at, e.actor_id, u.nombre AS actor_nombre' .
        ' FROM incidente_eventos e LEFT JOIN usuarios u ON u.id = e.actor_id' .
        ' WHERE e.incidente_id = ? ORDER BY e.creado_at ASC, e.id ASC'
      );
      $st->execute([$incidenteId]);
    }
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
      // SLA configurable: lee sla_politicas, fallback constante.
      $horas = $this->slaHoras($prioridad);
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

  public function listByUser(int $userId, ?string $estado = null, int $limit = 50, int $offset = 0, ?string $q = null): array {
    $sql = 'SELECT * FROM incidentes WHERE user_id = ?';
    $params = [$userId];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    if ($q !== null && $q !== '') { $sql .= ' AND (titulo ILIKE ? OR descripcion ILIKE ?)'; $like = '%' . $q . '%'; $params[] = $like; $params[] = $like; }
    $sql .= ' ORDER BY creado_at DESC LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  public function countByUser(int $userId, ?string $estado = null, ?string $q = null): int {
    $sql = 'SELECT COUNT(*) FROM incidentes WHERE user_id = ?';
    $params = [$userId];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    if ($q !== null && $q !== '') { $sql .= ' AND (titulo ILIKE ? OR descripcion ILIKE ?)'; $like = '%' . $q . '%'; $params[] = $like; $params[] = $like; }
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }
}
