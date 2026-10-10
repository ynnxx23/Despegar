<?php
// Middleware auth: extrae Bearer JWT, valida firma+exp y revalida el rol contra la BD.
// Uso: $claims = Auth::requireRole($db, ['viajero','agente']); 401/403 si falla.
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

  public static function requireRole(PDO $db, array $roles): array {
    $token = self::bearer();
    if (!$token) Response::error('Token requerido', 401);
    $claims = JwtHS256::decode($token, Config::get('JWT_SECRET', ''));
    if (!$claims) Response::error('Token invalido o expirado', 401);
    $rol = self::rolVigente($db, (int)($claims['sub'] ?? 0));
    if ($rol === null) Response::error('Usuario no encontrado', 401);
    if (!in_array($rol, $roles, true)) Response::error('Permiso denegado', 403);
    $claims['rol'] = $rol;
    return $claims;
  }

  // El rol vigente sale de la BD: si se degrada una cuenta, su token deja de valer al instante.
  private static function rolVigente(PDO $db, int $usuarioId): ?string {
    $st = $db->prepare('SELECT rol FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([$usuarioId]);
    $rol = $st->fetchColumn();
    return $rol === false || $rol === null ? null : (string)$rol;
  }
}
