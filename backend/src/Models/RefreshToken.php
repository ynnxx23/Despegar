<?php
// Refresh tokens opacos: el cliente recibe el token crudo y la BD guarda solo su SHA-256.
class RefreshToken {
  public static function diasVigencia(): int {
    $dias = (int)Config::get('REFRESH_TTL_DAYS', '30');
    if ($dias < 1) $dias = 30;
    if ($dias > 90) $dias = 90;
    return $dias;
  }

  // Emite un token y devuelve el valor crudo (unica vez, nunca se guarda en claro).
  public static function emitir(PDO $db, int $usuarioId): string {
    $crudo = bin2hex(random_bytes(32));
    $expira = gmdate('Y-m-d\TH:i:s\Z', time() + self::diasVigencia() * 86400);
    $st = $db->prepare('INSERT INTO refresh_tokens (usuario_id, token_hash, expira_at) VALUES (?, ?, ?)');
    $st->execute([$usuarioId, self::hash($crudo), $expira]);
    return $crudo;
  }

  // Valida el token, revoca el viejo y emite uno nuevo: [usuarioId, tokenNuevo] o null.
  public static function rotar(PDO $db, string $crudo): ?array {
    $st = $db->prepare(
      'SELECT id, usuario_id FROM refresh_tokens
       WHERE token_hash = ? AND revocado_at IS NULL AND expira_at > NOW() LIMIT 1'
    );
    $st->execute([self::hash($crudo)]);
    $fila = $st->fetch();
    if (!$fila) return null;

    $usuarioId = (int)$fila['usuario_id'];
    $st = $db->prepare('UPDATE refresh_tokens SET revocado_at = NOW() WHERE id = ?');
    $st->execute([(int)$fila['id']]);
    return [$usuarioId, self::emitir($db, $usuarioId)];
  }

  public static function revocar(PDO $db, string $crudo): void {
    $st = $db->prepare('UPDATE refresh_tokens SET revocado_at = NOW() WHERE token_hash = ? AND revocado_at IS NULL');
    $st->execute([self::hash($crudo)]);
  }

  // Limpieza de tokens vencidos o revocados (la tabla no crece para siempre).
  public static function purgar(PDO $db): void {
    try {
      $st = $db->prepare('DELETE FROM refresh_tokens WHERE expira_at < NOW() OR (revocado_at IS NOT NULL AND revocado_at < NOW() - INTERVAL \'7 days\')');
      $st->execute();
    } catch (PDOException $e) {
      error_log('purgar refresh tokens: ' . $e->getMessage());
    }
  }

  private static function hash(string $crudo): string {
    return hash('sha256', $crudo);
  }
}
