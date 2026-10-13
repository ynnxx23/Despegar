<?php
// AuthController: register/login/me + refresh rotation + logout + GDPR + email verify.
class AuthController {
  private static function issueToken(array $safeUser): string {
    $ttlH = (int)Config::get('JWT_TTL_HOURS', '8');
    if ($ttlH < 1) $ttlH = 8;
    if ($ttlH > 24) $ttlH = 24;
    $now = time();
    try {
      $jti = bin2hex(random_bytes(12));
    } catch (Throwable $e) {
      $jti = uniqid('jti_', true);
    }
    return JwtHS256::encode([
      'sub' => $safeUser['id'],
      'rol' => $safeUser['rol'],
      'iat' => $now,
      'exp' => $now + $ttlH * 3600,
      'iss' => 'despegar-api',
      'jti' => $jti,
    ], Config::get('JWT_SECRET', ''));
  }

  // Par access+refresh. Refresh 30d opaco (sha256 en BD), rotación en cada uso.
  private static function issuePair(PDO $db, array $safeUser, ?string $ip): array {
    $token = self::issueToken($safeUser);
    $raw = bin2hex(random_bytes(32));
    try {
      $st = $db->prepare('INSERT INTO refresh_tokens (user_id, token_hash, expira_at, ip) VALUES (?, ?, NOW() + INTERVAL \'30 days\', ?)');
      $st->execute([(int)$safeUser['id'], hash('sha256', $raw), $ip]);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') !== '42P01') throw $e;
      return ['user' => $safeUser, 'token' => $token]; // pre-migrate_06
    }
    return ['user' => $safeUser, 'token' => $token, 'refresh_token' => $raw];
  }

  private static function ip(): ?string {
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? null);
    if (is_string($ip)) $ip = trim(explode(',', $ip)[0]);
    return is_string($ip) && $ip !== '' ? substr($ip, 0, 45) : null;
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
    Response::json(self::issuePair($db, $safe, self::ip()), 201);
  }

  public static function login(PDO $db, array $body): void {
    $email = strtolower(trim($body['email'] ?? ''));
    $password = $body['password'] ?? '';
    if ($email === '' || !is_string($password) || $password === '') {
      Response::error('Email y password requeridos', 400);
    }
    $u = new Usuario($db);
    $row = $u->findByEmail($email);
    // Mensaje genérico para no revelar si el email existe (incluye borradas/inactivas).
    $inactivo = is_array($row) && array_key_exists('activo', $row)
      && in_array($row['activo'], [false, 0, '0', 'f', 'F', 'false'], true);
    if (!$row || !empty($row['borrado_at']) || $inactivo || !password_verify($password, $row['password_hash'])) {
      Response::error('Credenciales inválidas', 401);
    }
    $safe = Usuario::toSafe($row);
    Response::json(self::issuePair($db, $safe, self::ip()), 200);
  }

  public static function me(PDO $db, array $claims): void {
    $u = new Usuario($db);
    $row = $u->findById((int)($claims['sub'] ?? 0));
    if (!$row || !empty($row['borrado_at'])) Response::error('Usuario no encontrado', 401);
    Response::json(['user' => Usuario::toSafe($row)], 200);
  }

  // Refresh con rotación: valida, revoca el usado y emite par nuevo.
  public static function refresh(PDO $db, array $body): void {
    $raw = trim($body['refresh_token'] ?? '');
    if ($raw === '') Response::error('refresh_token requerido', 400);
    $hash = hash('sha256', $raw);
    try {
      $st = $db->prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? LIMIT 1');
      $st->execute([$hash]);
      $ses = $st->fetch();
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') Response::error('Refresh no disponible', 404);
      throw $e;
    }
    if (!$ses || !empty($ses['revocado']) || strtotime((string)$ses['expira_at']) < time()) {
      Response::error('Sesión inválida o expirada', 401);
    }
    $u = new Usuario($db);
    $row = $u->findById((int)$ses['user_id']);
    if (!$row || !empty($row['borrado_at'])) Response::error('Usuario no encontrado', 401);
    $st = $db->prepare('UPDATE refresh_tokens SET revocado = TRUE WHERE id = ?');
    $st->execute([(int)$ses['id']]);
    Response::json(self::issuePair($db, Usuario::toSafe($row), self::ip()), 200);
  }

  // Logout: revoca refresh dado (o todos si todos=true).
  public static function logout(PDO $db, array $claims, array $body): void {
    $yo = (int)($claims['sub'] ?? 0);
    try {
      if (!empty($body['todos'])) {
        $st = $db->prepare('UPDATE refresh_tokens SET revocado = TRUE WHERE user_id = ? AND revocado = FALSE');
        $st->execute([$yo]);
        Response::json(['data' => ['revocadas' => $st->rowCount()]], 200);
      }
      $raw = trim($body['refresh_token'] ?? '');
      if ($raw === '') {
        Response::json(['data' => ['ok' => true]], 200);
      }
      $st = $db->prepare('UPDATE refresh_tokens SET revocado = TRUE WHERE token_hash = ? AND user_id = ?');
      $st->execute([hash('sha256', $raw), $yo]);
      Response::json(['data' => ['ok' => true]], 200);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42P01') Response::json(['data' => ['ok' => true]], 200);
      throw $e;
    }
  }

  // GDPR: anonimiza cuenta + borra reservas/adjuntos/notifs/sesiones. Incidentes se conservan sin PII directa.
  public static function borrarCuenta(PDO $db, array $claims): void {
    $yo = (int)($claims['sub'] ?? 0);
    $u = new Usuario($db);
    $row = $u->findById($yo);
    if (!$row) Response::error('Usuario no encontrado', 404);
    // Archivos adjuntos del usuario.
    try {
      $st = $db->prepare('SELECT ruta FROM incidente_adjuntos WHERE autor_id = ?');
      $st->execute([$yo]);
      foreach ($st->fetchAll() as $a) {
        @unlink(__DIR__ . '/../../uploads/' . basename((string)$a['ruta']));
      }
      $db->prepare('DELETE FROM incidente_adjuntos WHERE autor_id = ?')->execute([$yo]);
    } catch (PDOException $e) { /* pre-migrate_04 */ }
    try {
      $db->prepare('DELETE FROM notificaciones WHERE user_id = ?')->execute([$yo]);
    } catch (PDOException $e) { /* pre-migrate_05 */ }
    try {
      $db->prepare('UPDATE refresh_tokens SET revocado = TRUE WHERE user_id = ?')->execute([$yo]);
    } catch (PDOException $e) { /* pre-migrate_06 */ }
    // Reservas se borran (incidentes quedan con reserva_id NULL por ON DELETE SET NULL).
    $db->prepare('DELETE FROM reservas WHERE user_id = ?')->execute([$yo]);
    // Anonimiza incidentes propios (título/descripción genéricos).
    $db->prepare("UPDATE incidentes SET titulo = '[eliminado]', descripcion = '[datos eliminados por el usuario]' WHERE user_id = ?")->execute([$yo]);
    $st = $db->prepare('UPDATE usuarios SET nombre = ?, email = ?, password_hash = ?, email_verificado = FALSE, email_token = NULL, borrado_at = NOW() WHERE id = ?');
    $st->execute(['Cuenta eliminada', "deleted_{$yo}@deleted.local", hash('sha256', bin2hex(random_bytes(16))), $yo]);
    Logger::info('gdpr_borrado', ['user' => $yo]);
    Response::json(['data' => ['ok' => true]], 200);
  }

  // Email verificación: solicitar (genera token + outbox) y verificar.
  public static function emailSolicitar(PDO $db, array $claims): void {
    $yo = (int)($claims['sub'] ?? 0);
    $u = new Usuario($db);
    $row = $u->findById($yo);
    if (!$row) Response::error('Usuario no encontrado', 404);
    $tok = bin2hex(random_bytes(16));
    try {
      $st = $db->prepare('UPDATE usuarios SET email_token = ? WHERE id = ?');
      $st->execute([$tok, $yo]);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42703') Response::error('Verificación no disponible', 404);
      throw $e;
    }
    if (class_exists('Push')) {
      Push::enviar($yo, (string)$row['email'], 'verificacion', 'Tu código de verificación: ' . $tok, null);
    }
    // En dev se devuelve el token para probar sin email real; en prod solo outbox.
    $dev = Config::get('APP_ENV', 'dev') !== 'prod';
    Response::json(['data' => ['ok' => true] + ($dev ? ['token' => $tok] : [])], 200);
  }

  public static function emailVerificar(PDO $db, array $claims, array $body): void {
    $tok = trim($body['token'] ?? '');
    if ($tok === '') Response::error('Token requerido', 400);
    $yo = (int)($claims['sub'] ?? 0);
    $u = new Usuario($db);
    $row = $u->findById($yo);
    if (!$row) Response::error('Usuario no encontrado', 404);
    if (empty($row['email_token']) || !hash_equals((string)$row['email_token'], $tok)) {
      Response::error('Token inválido', 400);
    }
    $st = $db->prepare('UPDATE usuarios SET email_verificado = TRUE, email_token = NULL WHERE id = ?');
    $st->execute([$yo]);
    Response::json(['data' => ['email_verificado' => true]], 200);
  }

  // Reset: solicitar (siempre 200, no enumera) y restablecer (token 1h, un uso).
  public static function passwordSolicitar(PDO $db, array $body): void {
    $email = strtolower(trim($body['email'] ?? ''));
    if ($email !== '') {
      $u = new Usuario($db);
      $row = $u->findByEmail($email);
      if ($row && empty($row['borrado_at'])) {
        $tok = bin2hex(random_bytes(16));
        try {
          $st = $db->prepare('UPDATE usuarios SET reset_token = ?, reset_expira = NOW() + INTERVAL \'1 hour\' WHERE id = ?');
          $st->execute([$tok, (int)$row['id']]);
          if (class_exists('Push')) {
            Push::enviar((int)$row['id'], (string)$row['email'], 'reset', 'Tu código para restablecer: ' . $tok, null);
          }
          if (Config::get('APP_ENV', 'dev') !== 'prod') {
            Response::json(['data' => ['ok' => true, 'token' => $tok]], 200);
          }
        } catch (PDOException $e) {
          if (($e->errorInfo[0] ?? '') !== '42703') throw $e;
        }
      }
    }
    Response::json(['data' => ['ok' => true]], 200);
  }

  public static function passwordRestablecer(PDO $db, array $body): void {
    $tok = trim($body['token'] ?? '');
    $password = $body['password'] ?? '';
    if ($tok === '') Response::error('Token requerido', 400);
    if (!is_string($password) || strlen($password) < 8 || strlen($password) > 72) {
      Response::error('Password inválida (8 a 72 caracteres)', 400);
    }
    $st = $db->prepare('SELECT * FROM usuarios WHERE reset_token = ? LIMIT 1');
    try {
      $st->execute([$tok]);
      $row = $st->fetch();
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '42703') Response::error('Reset no disponible', 404);
      throw $e;
    }
    if (!$row || empty($row['reset_expira']) || strtotime((string)$row['reset_expira']) < time() || !empty($row['borrado_at'])) {
      Response::error('Token inválido o expirado', 400);
    }
    $db->beginTransaction();
    try {
      $st = $db->prepare('UPDATE usuarios SET password_hash = ?, reset_token = NULL, reset_expira = NULL WHERE id = ?');
      $st->execute([Usuario::hashPassword($password), (int)$row['id']]);
      try {
        $st = $db->prepare('UPDATE refresh_tokens SET revocado = TRUE WHERE user_id = ?');
        $st->execute([(int)$row['id']]);
      } catch (PDOException $e) { /* pre-migrate_06 */ }
      $db->commit();
    } catch (Throwable $e) {
      if ($db->inTransaction()) $db->rollBack();
      throw $e;
    }
    Logger::info('password_reset', ['user' => (int)$row['id']]);
    Response::json(['data' => ['ok' => true]], 200);
  }
}
