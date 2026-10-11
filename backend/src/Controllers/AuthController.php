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

  // IP del cliente: detras de un proxy (Railway) llega REMOTE_ADDR del proxy.
  private static function ip(): string {
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'desconocida');
  }

  private static function limite(string $clave, int $defecto, int $ventanaDefecto): int {
    $v = (int)Config::get($clave, (string)$defecto);
    return $v > 0 ? $v : $defecto;
  }

  public static function register(PDO $db, array $claims = [], array $params = [], array $body = []): void {
    $nombre = trim((string)($body['nombre'] ?? ''));
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $password = (string)($body['password'] ?? '');

    // Freno al alta automatica de cuentas (mismo IP).
    RateLimit::exigir(
      'registro:' . self::ip(),
      self::limite('REGISTER_RATE_LIMIT', 10, 3600),
      self::limite('REGISTER_RATE_WINDOW', 3600, 3600),
      'Demasiados registros desde este dispositivo. Probá más tarde.'
    );

    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100) {
      Response::error('Nombre inválido (2 a 100 caracteres)', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) {
      Response::error('Email inválido', 400);
    }
    if (strlen($password) < 8 || strlen($password) > 72) {
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
    Auditoria::registrar($db, $id, null, 'registro_publico', 'rol', null, 'viajero', 'Alta pública desde la app');
    $safe = Usuario::toSafe($u->findById($id));
    Response::json(self::sesion($db, $safe), 201);
  }

  public static function login(PDO $db, array $claims = [], array $params = [], array $body = []): void {
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $password = (string)($body['password'] ?? '');
    if ($email === '' || $password === '') {
      Response::error('Email y password requeridos', 400);
    }

    // Dos frenos: por IP (dispositivo) y por cuenta (evitan insistir contra una sola cuenta).
    RateLimit::exigir(
      'login-ip:' . self::ip(),
      self::limite('LOGIN_RATE_LIMIT', 30, 60),
      self::limite('LOGIN_RATE_WINDOW', 60, 60),
      'Demasiados intentos de login. Esperá un minuto e intentá de nuevo.'
    );
    RateLimit::exigir(
      'login-cuenta:' . $email,
      self::limite('LOGIN_RATE_ACCOUNT_LIMIT', 20, 60),
      self::limite('LOGIN_RATE_WINDOW', 60, 60),
      'Demasiados intentos para esta cuenta. Esperá un minuto e intentá de nuevo.'
    );

    $u = new Usuario($db);
    $row = $u->findByEmail($email);
    // Mensaje genérico para no revelar si el email existe.
    if (!$row || !password_verify($password, $row['password_hash'])) {
      Response::error('Credenciales inválidas', 401);
    }
    // Cuenta desactivada por un admin: solo lo sabe quien tiene la password.
    if (array_key_exists('activo', $row) && !$row['activo']) {
      Response::error('Tu cuenta está desactivada. Contactá a un administrador.', 403);
    }
    RefreshToken::purgar($db);
    $safe = Usuario::toSafe($row);
    Response::json(self::sesion($db, $safe), 200);
  }

  // Canjea un refresh token por un access token nuevo. El refresh se rota en el mismo paso.
  public static function refresh(PDO $db, array $claims = [], array $params = [], array $body = []): void {
    $crudo = (string)($body['refresh_token'] ?? '');
    RateLimit::exigir(
      'refresh:' . self::ip(),
      self::limite('REFRESH_RATE_LIMIT', 60, 60),
      self::limite('LOGIN_RATE_WINDOW', 60, 60),
      'Demasiadas renovaciones de sesión. Probá de nuevo en un minuto.'
    );
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
    if (array_key_exists('activo', $row) && !$row['activo']) {
      Response::error('Tu cuenta está desactivada. Contactá a un administrador.', 403);
    }
    $safe = Usuario::toSafe($row);
    Response::json([
      'user' => $safe,
      'token' => self::issueToken($safe),
      'refresh_token' => $nuevo,
    ], 200);
  }

  // Revoca el refresh token: la app lo llama al cerrar sesión.
  public static function logout(PDO $db, array $claims = [], array $params = [], array $body = []): void {
    $crudo = (string)($body['refresh_token'] ?? '');
    if (is_string($crudo) && $crudo !== '') {
      RefreshToken::revocar($db, $crudo);
    }
    Response::json(['data' => ['ok' => true]], 200);
  }

  public static function me(PDO $db, array $claims, array $params = [], array $body = [], array $query = []): void {
    $u = new Usuario($db);
    $row = $u->findById((int)($claims['sub'] ?? 0));
    if (!$row) Response::error('Usuario no encontrado', 401);
    Response::json(['user' => Usuario::toSafe($row)], 200);
  }
}
