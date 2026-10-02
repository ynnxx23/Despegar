<?php
// Respuesta: hilo 1:N por incidente (agente responde, viajero dueño lee).
class Respuesta {
  private PDO $db;
  public function __construct(PDO $db) { $this->db = $db; }

  public function listByIncidente(int $incidenteId): array {
    $st = $this->db->prepare(
      'SELECT r.id, r.mensaje, r.creado_at, u.nombre AS autor, u.rol AS autor_rol ' .
      'FROM respuestas r JOIN usuarios u ON u.id = r.autor_id ' .
      'WHERE r.incidente_id = ? ORDER BY r.creado_at ASC'
    );
    $st->execute([$incidenteId]);
    return array_map(function (array $r): array {
      $r['id'] = (int)$r['id']; // PG devuelve enteros como string
      return $r;
    }, $st->fetchAll());
  }

  // Inserta respuesta + marca EnGestion en UNA transacción vía función crear_respuesta().
  // Mapea P0002 (carrera: incidente borrado entre check e insert) a false para 404.
  public function responderAtomico(int $incidenteId, int $autorId, string $mensaje): int|false {
    try {
      $st = $this->db->prepare('SELECT crear_respuesta(?, ?, ?)');
      $st->execute([$incidenteId, $autorId, $mensaje]);
      return (int)$st->fetchColumn();
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === 'P0002') return false;
      throw $e;
    }
  }
}
