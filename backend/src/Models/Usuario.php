<?php
// Modelo Usuario: POO + encapsulamiento + PDO prepared (anti SQLi).
// password_hash / password_verify con BCRYPT (salt automático).
class Usuario {
  private PDO $db;

  public function __construct(PDO $db) { $this->db = $db; }

  public function findByEmail(string $email): ?array {
    $st = $this->db->prepare('SELECT * FROM usuarios WHERE email = ? LIMIT 1');
    $st->execute([$email]);
    $row = $st->fetch();
    return $row ?: null;
  }

  public function findById(int $id): ?array {
    $st = $this->db->prepare('SELECT * FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $row = $st->fetch();
    return $row ?: null;
  }

  public function create(string $nombre, string $email, string $hash, string $rol = 'viajero'): int {
    $st = $this->db->prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)');
    $st->execute([$nombre, $email, $hash, $rol]);
    return (int)$this->db->lastInsertId();
  }

  public static function hashPassword(string $plain): string {
    $cost = (int)Config::get('BCRYPT_COST', '10');
    if ($cost < 10) $cost = 10;
    if ($cost > 12) $cost = 12;
    return password_hash($plain, PASSWORD_BCRYPT, ['cost' => $cost]);
  }

  public static function toSafe(array $row): array {
    $safe = ['id' => (int)$row['id'], 'nombre' => $row['nombre'], 'email' => $row['email'], 'rol' => $row['rol']];
    if (array_key_exists('email_verificado', $row)) {
      $safe['email_verificado'] = !in_array($row['email_verificado'], [false, 0, '0', 'f', 'F', 'false', null], true);
    }
    return $safe;
  }
}
