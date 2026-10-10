<?php
// AuthController: register (solo viajero) + login + refresh + logout + me. JWT HS256 8h.
class AuthController {
  private static function issueToken(array $safeUser): string {
    $ttlH = (int)Config::get('JWT_TTL_HOURS', '8');
    if ($ttlH < 1) $ttlH = 8;
    if ($ttlH > 24) $ttlH = 24;
    $now = time();
    return JwtHS256::encode([
      'sub' => $safeUser['id'],
      'rol' => $safeUser['rol'],
      'iat' => $now,
      'exp' => $now + $ttlH * 3600,
    ], Config::get('JWT_SECRET', ''));
  }

  // Sesion completa: access token + refresh token opaco de larga vida.
  private static function sesion(PDO $db, array $safeUser): array {
    return [
      'user' => $safeUser,
      'token' => self::issueToken($safeUser),
      'refresh_token' => RefreshToken::emitir($db, (int)$safeUser['id']),
    ];
  }

  public static function register(PDO $db, array $body): void {
    $nombre = trim($body['nombre'] ?? '');
    $email = strtolower(trim($body['email'] ?? ''));
    $password = $body['password'] ?? '';

    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100) {
      Response::error('Nombre inválido (2 a 100 caracteres)', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) {
      Response::error('Email inválido', 400);
    }
    if (!is_string($password) || strlen($password) < 8 || strlen($password) > 72) {
      Response::error('Password inválida (8 a 72 caracteres)', 400);
    }
    if (Config::get('JWT_SECRET', '') === '') {
      Response::error('Servidor sin JWT_SECRET configurado', 500);
    }

    $u = new Usuario($db);
    if ($u->findByEmail($email)) {
      Response::error('El email ya está registrado', 409);
    }

    // Decisión §22 plan: registro público SOLO crea viajero (agentes por seed/admin).
    // Guarda contra carrera (doble click): unique violation 23505 -> 409.
    try {
      $id = $u->create($nombre, $email, Usuario::hashPassword($password), 'viajero');
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '23505') {
        Response::error('El email ya está registrado', 409);
      }
      error_log('register: ' . $e->getMessage());
      Response::error('Error interno del servidor', 500);
    }
    $safe = Usuario::toSafe($u->findById($id));
    Response::json(self::sesion($db, $safe), 201);
  }

  public static function login(PDO $db, array $body): void {
    $email = strtolower(trim($body['email'] ?? ''));
    $password = $body['password'] ?? '';
    if ($email === '' || !is_string($password) || $password === '') {
      Response::error('Email y password requeridos', 400);
    }
    $u = new Usuario($db);
    $row = $u->findByEmail($email);
    // Mensaje genérico para no revelar si el email existe.
    if (!$row || !password_verify($password, $row['password_hash'])) {
      Response::error('Credenciales inválidas', 401);
    }
    $safe = Usuario::toSafe($row);
    Response::json(self::sesion($db, $safe), 200);
  }

  // Canjea un refresh token por un access token nuevo. El refresh se rota en el mismo paso.
  public static function refresh(PDO $db, array $body): void {
    $crudo = $body['refresh_token'] ?? '';
    if (!is_string($crudo) || strlen($crudo) < 32) {
      Response::error('Refresh token inválido', 401);
    }
    $rotado = RefreshToken::rotar($db, $crudo);
    if ($rotado === null) {
      Response::error('Refresh token inválido o expirado', 401);
    }
    [$usuarioId, $nuevo] = $rotado;
    $u = new Usuario($db);
    $row = $u->findById($usuarioId);
    if (!$row) Response::error('Usuario no encontrado', 401);
    $safe = Usuario::toSafe($row);
    Response::json([
      'user' => $safe,
      'token' => self::issueToken($safe),
      'refresh_token' => $nuevo,
    ], 200);
  }

  // Revoca el refresh token: la app lo llama al cerrar sesión.
  public static function logout(PDO $db, array $body): void {
    $crudo = $body['refresh_token'] ?? '';
    if (is_string($crudo) && $crudo !== '') {
      RefreshToken::revocar($db, $crudo);
    }
    Response::json(['data' => ['ok' => true]], 200);
  }

  public static function me(PDO $db, array $claims): void {
    $u = new Usuario($db);
    $row = $u->findById((int)($claims['sub'] ?? 0));
    if (!$row) Response::error('Usuario no encontrado', 401);
    Response::json(['user' => Usuario::toSafe($row)], 200);
  }
}
