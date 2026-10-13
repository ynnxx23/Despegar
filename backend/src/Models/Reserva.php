<?php
// Reserva: solo lectura para el viajero dueño (itinerario). Sin CRUD en v1 (decisión plan §22).
class Reserva {
  private PDO $db;
  public function __construct(PDO $db) { $this->db = $db; }

  public function listByUser(int $userId): array {
    $st = $this->db->prepare(
      'SELECT id, tipo, codigo, origen, destino, hotel, fecha_inicio, fecha_fin, estado ' .
      'FROM reservas WHERE user_id = ? ORDER BY fecha_inicio ASC'
    );
    $st->execute([$userId]);
    return array_map(function (array $r): array {
      $r['id'] = (int)$r['id']; // PG devuelve enteros como string
      return $r;
    }, $st->fetchAll());
  }

  public function belongsTo(int $reservaId, int $userId): bool {
    $st = $this->db->prepare('SELECT 1 FROM reservas WHERE id = ? AND user_id = ? LIMIT 1');
    $st->execute([$reservaId, $userId]);
    return (bool)$st->fetchColumn();
  }
}
