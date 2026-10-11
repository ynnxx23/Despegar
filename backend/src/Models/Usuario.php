<?php
// Modelo Usuario: POO + encapsulamiento + PDO prepared (anti SQLi).
// password_hash / password_verify con BCRYPT (salt automático).
class Usuario {
  // Roles cerrados: viajero, agente y admin (admin administra usuarios y agentes).
  public const ROLES = ['viajero', 'agente', 'admin'];

  private PDO $db;

  public function __construct(PDO $db) { $this->db = $db; }

  public function findByEmail(string $email): ?array {
    $st = $this->db->prepare('SELECT id, nombre, email, password_hash, rol, activo, creado_at FROM usuarios WHERE email = ? LIMIT 1');
    $st->execute([$email]);
    $row = $st->fetch();
    return $row ?: null;
  }

  public function findById(int $id): ?array {
    $st = $this->db->prepare('SELECT id, nombre, email, password_hash, rol, activo, creado_at FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $row = $st->fetch();
    return $row ?: null;
  }

  public function create(string $nombre, string $email, string $hash, string $rol = 'viajero'): int {
    $st = $this->db->prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)');
    $st->execute([$nombre, $email, $hash, $rol]);
    return (int)$this->db->lastInsertId();
  }

  // Lista para el panel de admin: filtros por rol y busqueda por nombre/email.
  public function listar(?string $rol, ?string $q, int $limite, int $offset): array {
    $sql =
      'SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.creado_at,
              (SELECT COUNT(*) FROM incidentes i WHERE i.user_id = u.id) AS incidentes,
              (SELECT COUNT(*) FROM incidentes i WHERE i.asignado_a = u.id) AS asignados
       FROM usuarios u WHERE 1=1';
    $params = [];
    if ($rol !== null && $rol !== '') {
      $sql .= ' AND u.rol = ?';
      $params[] = $rol;
    }
    if ($q !== null && $q !== '') {
      $sql .= ' AND (u.nombre ILIKE ? OR u.email ILIKE ?)';
      $like = '%' . $q . '%';
      $params[] = $like;
      $params[] = $like;
    }
    $sql .= ' ORDER BY u.rol ASC, u.nombre ASC LIMIT ? OFFSET ?';
    $params[] = $limite;
    $params[] = $offset;
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return array_map(function (array $r): array {
      $r['id'] = (int)$r['id'];
      $r['incidentes'] = (int)$r['incidentes'];
      $r['asignados'] = (int)$r['asignados'];
      $r['activo'] = (bool)$r['activo'];
      return $r;
    }, $st->fetchAll());
  }

  public function contar(?string $rol, ?string $q): int {
    $sql = 'SELECT COUNT(*) FROM usuarios u WHERE 1=1';
    $params = [];
    if ($rol !== null && $rol !== '') {
      $sql .= ' AND u.rol = ?';
      $params[] = $rol;
    }
    if ($q !== null && $q !== '') {
      $sql .= ' AND (u.nombre ILIKE ? OR u.email ILIKE ?)';
      $like = '%' . $q . '%';
      $params[] = $like;
      $params[] = $like;
    }
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }

  // Cambio de rol (queda registrado en la auditoria).
  public function cambiarRol(int $id, string $rol): void {
    $st = $this->db->prepare('UPDATE usuarios SET rol = ? WHERE id = ?');
    $st->execute([$rol, $id]);
  }

  public function setActivo(int $id, bool $activo): void {
    $st = $this->db->prepare('UPDATE usuarios SET activo = ? WHERE id = ?');
    $st->execute([$activo ? true : false, $id]);
  }

  public function setPassword(int $id, string $hash): void {
    $st = $this->db->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?');
    $st->execute([$hash, $id]);
  }

  // Cantidad de admins activos: evita dejar la base sin ninguno.
  public function contarAdminsActivos(?int $exceptoId = null): int {
    $sql = "SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = TRUE";
    $params = [];
    if ($exceptoId !== null) {
      $sql .= ' AND id <> ?';
      $params[] = $exceptoId;
    }
    $st = $this->db->prepare($sql);
    $st->execute($params);
    return (int)$st->fetchColumn();
  }

  public static function hashPassword(string $plain): string {
    $cost = (int)Config::get('BCRYPT_COST', '10');
    if ($cost < 10) $cost = 10;
    if ($cost > 12) $cost = 12;
    return password_hash($plain, PASSWORD_BCRYPT, ['cost' => $cost]);
  }

  public static function toSafe(array $row): array {
    return [
      'id' => (int)$row['id'],
      'nombre' => $row['nombre'],
      'email' => $row['email'],
      'rol' => $row['rol'],
      'activo' => isset($row['activo']) ? (bool)$row['activo'] : true,
    ];
  }
}
