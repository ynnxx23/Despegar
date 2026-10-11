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

  // Sugerencia pura: base por tipo, +1 nivel si hay keyword (maximo Critica).
  // Retorna [sugerida, motivo].
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
    if (array_key_exists('seguidores_count', $row)) {
      $row['seguidores_count'] = (int)$row['seguidores_count'];
    }
    if (array_key_exists('siguiendo', $row)) {
      $row['siguiendo'] = in_array($row['siguiendo'], [true, 1, '1', 't', 'true'], true);
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
      // Sin fallback silencioso: si falta la columna de sugerencia, la base esta
      // desactualizada y hay que correr las migraciones (no perder datos en silencio).
      if (($e->errorInfo[0] ?? '') === '42703') {
        error_log('incidentes: falta la columna de sugerencia. Corré db/migrate_*.sql');
        Response::error('La base de datos está desactualizada: falta aplicar migraciones', 500);
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

  // Orden urgencia: vencidos SLA primero, luego sin triar, luego Critica/Alta/Baja, luego creado ASC.
  private static function ordenUrgencia(): string {
    return " ORDER BY" .
      " CASE WHEN sla_vence_at IS NOT NULL AND sla_vence_at < NOW() AND estado <> 'Resuelto' THEN 0 ELSE 1 END ASC," .
      " CASE WHEN prioridad IS NULL THEN 0 ELSE 1 END ASC," .
      " CASE prioridad WHEN 'Critica' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Baja' THEN 2 ELSE 3 END ASC," .
      " sla_vence_at ASC NULLS LAST," .
      " creado_at ASC";
  }

  /**
   * Filtros de la cola (los mismos para listar y para contar, para que el total
   * de la pagina coincida con lo que se ve).
   *   estado      : 'Abierto' | 'EnGestion' | 'Resuelto' | 'activos' (todo lo no resuelto)
   *   prioridad   : 'Baja' | 'Alta' | 'Critica' | 'sin_triar' (sin priorizar)
   *   tipo        : uno de Incidente::TIPOS
   *   vista       : 'mios' | 'siguiendo' (solo para la cola propia)
   */
  private static function filtrosSql(array $f, array &$params): string {
    $sql = '';
    $estado = $f['estado'] ?? null;
    if ($estado === 'activos') {
      $sql .= " AND i.estado <> 'Resuelto'";
    } elseif ($estado !== null && $estado !== '') {
      $sql .= ' AND i.estado = ?';
      $params[] = $estado;
    }
    $prioridad = $f['prioridad'] ?? null;
    if ($prioridad === 'sin_triar') {
      $sql .= ' AND i.prioridad IS NULL';
    } elseif ($prioridad !== null && $prioridad !== '') {
      $sql .= ' AND i.prioridad = ?';
      $params[] = $prioridad;
    }
    $tipo = $f['tipo'] ?? null;
    if ($tipo !== null && $tipo !== '') {
      $sql .= ' AND i.tipo = ?';
      $params[] = $tipo;
    }
    return $sql;
  }

  public function listAll(array $filtros, string $orden, int $limit, int $offset, ?int $agenteId = null): array {
    // Proyeccion agente: incluye quien tiene el caso (asignado_nombre), cuantos lo siguen
    // y si el agente que consulta lo sigue (siguiendo).
    $sql = 'SELECT i.*, u.nombre AS asignado_nombre,'
      . ' (SELECT COUNT(*) FROM incidente_seguidores s WHERE s.incidente_id = i.id) AS seguidores_count';
    $params = [];
    if ($agenteId !== null && $agenteId > 0) {
      $sql .= ', EXISTS(SELECT 1 FROM incidente_seguidores s2 WHERE s2.incidente_id = i.id AND s2.agente_id = ?) AS siguiendo';
      $params[] = $agenteId;
    } else {
      $sql .= ', FALSE AS siguiendo';
    }
    $sql .= ' FROM incidentes i LEFT JOIN usuarios u ON u.id = i.asignado_a WHERE 1=1';
    $sql .= self::filtrosSql($filtros, $params);
    if ($orden === 'urgencia') {
      $sql .= self::ordenUrgencia();
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

  public function countAll(array $filtros): int {
    $sql = 'SELECT COUNT(*) FROM incidentes i WHERE 1=1';
    $params = [];
    $sql .= self::filtrosSql($filtros, $params);
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }

  // Mi cola. $vista: 'mios' (reclamados por mi), 'siguiendo' (los que sigo y no son mios)
  // o null (union: asignados + seguidos). No Resueltos salvo filtro explicito.
  public function miCola(int $agenteId, array $filtros, string $orden, int $limit, int $offset, ?string $vista = null): array {
    $sql = 'SELECT i.*, u.nombre AS asignado_nombre,'
      . ' (SELECT COUNT(*) FROM incidente_seguidores s WHERE s.incidente_id = i.id) AS seguidores_count,'
      . ' EXISTS(SELECT 1 FROM incidente_seguidores s2 WHERE s2.incidente_id = i.id AND s2.agente_id = ?) AS siguiendo'
      . ' FROM incidentes i LEFT JOIN usuarios u ON u.id = i.asignado_a WHERE 1=1';
    $params = [$agenteId];
    $sql .= $this->filtroVista($vista, $agenteId, $params);
    $sql .= self::filtrosSql($filtros, $params);
    $sql .= $this->ordenSql($orden);
    $sql .= ' LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  private function ordenSql(string $orden): string {
    if ($orden === 'urgencia') return self::ordenUrgencia();
    return $orden === 'desc' ? ' ORDER BY i.creado_at DESC' : ' ORDER BY i.creado_at ASC';
  }

  // Filtro de vista para mi cola (agrega params en orden).
  private function filtroVista(?string $vista, int $agenteId, array &$params): string {
    if ($vista === 'mios') {
      $params[] = $agenteId;
      return ' AND i.asignado_a = ?';
    }
    if ($vista === 'siguiendo') {
      $params[] = $agenteId;
      $params[] = $agenteId;
      return ' AND EXISTS(SELECT 1 FROM incidente_seguidores s3 WHERE s3.incidente_id = i.id AND s3.agente_id = ?)'
        . ' AND (i.asignado_a IS NULL OR i.asignado_a <> ?)';
    }
    $params[] = $agenteId;
    $params[] = $agenteId;
    return ' AND (i.asignado_a = ? OR EXISTS(SELECT 1 FROM incidente_seguidores s4 WHERE s4.incidente_id = i.id AND s4.agente_id = ?))';
  }

  public function countMiCola(int $agenteId, array $filtros, ?string $vista = null): int {
    $sql = 'SELECT COUNT(*) FROM incidentes i WHERE 1=1';
    $params = [];
    $sql .= $this->filtroVista($vista, $agenteId, $params);
    $sql .= self::filtrosSql($filtros, $params);
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }

  /**
   * Actualiza triaje (prioridad) y/o estado.
   * $recalculaSla: solo se renueva el reloj de SLA cuando la prioridad CAMBIA.
   * Si no, re-guardar el caso (misma prioridad) no debe "refrescar" el SLA.
   */
  public function update(int $id, ?string $prioridad, ?string $estado, ?int $triadoPor = null, bool $recalculaSla = true): void {
    $sets = [];
    $params = [];
    if ($prioridad !== null) {
      $sets[] = 'prioridad = ?';
      $params[] = $prioridad;
      if ($recalculaSla) {
        $horas = self::SLA_HORAS[$prioridad] ?? 72;
        $sets[] = "sla_vence_at = NOW() + INTERVAL '{$horas} hours'";
      }
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
      // Sin fallback silencioso: si faltan columnas de triaje/SLA la base esta
      // desactualizada y hay que correr db/migrate_*.sql.
      if (($e->errorInfo[0] ?? '') === '42703') {
        error_log('incidentes: faltan columnas de triaje/SLA. Corré db/migrate_*.sql');
        Response::error('La base de datos está desactualizada: falta aplicar migraciones', 500);
      }
      throw $e;
    }
  }

  public function listByUser(int $userId, ?string $estado = null, int $limit = 100, int $offset = 0): array {
    $sql = 'SELECT * FROM incidentes WHERE user_id = ?';
    $params = [$userId];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    $sql .= ' ORDER BY creado_at DESC LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return array_map([self::class, 'norm'], $st->fetchAll());
  }

  public function countByUser(int $userId, ?string $estado = null): int {
    $sql = 'SELECT COUNT(*) FROM incidentes WHERE user_id = ?';
    $params = [$userId];
    if ($estado !== null) { $sql .= ' AND estado = ?'; $params[] = $estado; }
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }
}
