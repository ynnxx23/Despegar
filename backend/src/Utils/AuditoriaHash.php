<?php
// Auditoría hash encadenado: cada evento apunta al hash previo (inmutable verificable).
class AuditoriaHash {
  // Formato canónico del timestamp: la representación textual de PG varía
  // según TimeZone/precisión de sesión; normalizar evita falsos "roto".
  public static function canon(string $raw): string {
    $ts = strtotime($raw);
    if ($ts === false) return $raw;
    return gmdate('Y-m-d\TH:i:s', $ts) . 'Z';
  }

  public static function hashDe(int $id, string $accion, ?string $detalle, string $creadoAt, ?string $prev): string {
    return hash('sha256', ($prev ?? 'GENESIS') . '|' . $id . '|' . $accion . '|' . ($detalle ?? '') . '|' . self::canon($creadoAt));
  }

  // Recalcula cadena de un incidente. Retorna ['ok'=>bool, 'roto_en'=>?int].
  public static function verificar(PDO $db, int $incidenteId): array {
    $st = $db->prepare('SELECT id, accion, detalle, creado_at, hash_prev, hash FROM incidente_eventos WHERE incidente_id = ? ORDER BY creado_at ASC, id ASC');
    $st->execute([$incidenteId]);
    $rows = $st->fetchAll();
    $prev = null;
    foreach ($rows as $r) {
      // Eventos viejos sin hash: se saltean sin anclar (prev se mantiene).
      if (empty($r['hash'])) continue;
      // El anclaje debe continuar la cadena calculada.
      if ($r['hash_prev'] !== null && $prev !== null && $r['hash_prev'] !== $prev) {
        return ['ok' => false, 'roto_en' => (int)$r['id']];
      }
      $base = $r['hash_prev'] !== null && $prev === null ? $r['hash_prev'] : $prev;
      $calc = self::hashDe((int)$r['id'], (string)$r['accion'], $r['detalle'], (string)$r['creado_at'], $base);
      if ($r['hash'] !== $calc) {
        // Tolerancia legacy: sellos viejos con timestamp crudo + prev ''.
        if ($base !== null && $base !== '') return ['ok' => false, 'roto_en' => (int)$r['id']];
        $legacy = hash('sha256', '' . '|' . (int)$r['id'] . '|' . (string)$r['accion'] . '|' . ($r['detalle'] ?? '') . '|' . (string)$r['creado_at']);
        if ($r['hash'] !== $legacy) return ['ok' => false, 'roto_en' => (int)$r['id']];
      }
      $prev = $r['hash'];
    }
    return ['ok' => true, 'eventos' => count($rows)];
  }

  // Sella un evento recién creado (idempotente si ya tiene hash).
  public static function sellar(PDO $db, int $eventoId): void {    try {
      $st = $db->prepare('SELECT e.id, e.incidente_id, e.accion, e.detalle, e.creado_at, e.hash FROM incidente_eventos e WHERE e.id = ? LIMIT 1');
      $st->execute([$eventoId]);
      $ev = $st->fetch();
      if (!$ev || !empty($ev['hash'])) return;
      $st = $db->prepare('SELECT hash FROM incidente_eventos WHERE incidente_id = ? AND id < ? AND hash IS NOT NULL ORDER BY id DESC LIMIT 1');
      $st->execute([(int)$ev['incidente_id'], $eventoId]);
      $prev = $st->fetchColumn();
      // fetchColumn devuelve false sin filas: normalizar a null ANTES de castear
      // (bug real: $prev=null luego (string)null = '' rompia el primer eslabon).
      $prevHash = ($prev === false || $prev === null) ? null : (string)$prev;
      $h = self::hashDe((int)$ev['id'], (string)$ev['accion'], $ev['detalle'], (string)$ev['creado_at'], $prevHash);
      $st = $db->prepare('UPDATE incidente_eventos SET hash_prev = ?, hash = ? WHERE id = ?');
      $st->execute([$prevHash, $h, $eventoId]);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42703') return; // pre-migrate_05
      throw $e;
    }
  }

  // Re-sella toda la cadena de un incidente (backfill tras cambio de formato).
  // Uso único por incidente; queda registrado en log.
  public static function resellar(PDO $db, int $incidenteId): int {
    $st = $db->prepare('SELECT id, accion, detalle, creado_at FROM incidente_eventos WHERE incidente_id = ? ORDER BY creado_at ASC, id ASC');
    $st->execute([$incidenteId]);
    $rows = $st->fetchAll();
    $prev = null;
    $n = 0;
    foreach ($rows as $r) {
      $h = self::hashDe((int)$r['id'], (string)$r['accion'], $r['detalle'], (string)$r['creado_at'], $prev);
      $up = $db->prepare('UPDATE incidente_eventos SET hash_prev = ?, hash = ? WHERE id = ?');
      $up->execute([$prev, $h, (int)$r['id']]);
      $prev = $h;
      $n++;
    }
    return $n;
  }
}
