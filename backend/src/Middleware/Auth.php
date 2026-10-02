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
    return $claims;
  }
}
