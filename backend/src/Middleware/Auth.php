<?php
// Middleware auth: extrae Bearer JWT, valida firma+exp, exige rol.
// Uso F2/F3: $user = Auth::requireRole(['viajero','agente']); 401/403 si falla.
class Auth {
  public static function bearer(): ?string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($h === '' && function_exists('getallheaders')) {
      $all = getallheaders();
      $h = $all['Authorization'] ?? ($all['authorization'] ?? '');
    }
    if (str_starts_with($h, 'Bearer ')) return substr($h, 7);
    return null;
  }
  public static function requireRole(array $roles): array {
    $token = self::bearer();
    if (!$token) Response::error('Token requerido', 401);
    $claims = JwtHS256::decode($token, Config::get('JWT_SECRET', ''));
    if (!$claims) Response::error('Token invalido o expirado', 401);
    if (!in_array($claims['rol'] ?? '', $roles, true)) Response::error('Permiso denegado', 403);
    // Cuenta borrada (GDPR) o desactivada: tokens restantes quedan inválidos.
    try {
      $db = Database::pdo();
      $st = $db->prepare('SELECT borrado_at, activo FROM usuarios WHERE id = ? LIMIT 1');
      $st->execute([(int)($claims['sub'] ?? 0)]);
      $row = $st->fetch();
      if (!$row) Response::error('Usuario no encontrado', 401);
      $inactivo = array_key_exists('activo', $row) && in_array($row['activo'], [false, 0, '0', 'f', 'F', 'false'], true);
      if (!empty($row['borrado_at']) || $inactivo) {
        Response::error('Usuario no encontrado', 401);
      }
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') !== '42703') throw $e; // pre-migrate_06/07: omite chequeo
    }
    return $claims;
  }
}
