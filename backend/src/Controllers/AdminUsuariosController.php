<?php
// Panel de administracion de usuarios (solo rol admin).
// Permite: listar usuarios, registrar uno nuevo (agente o cualquier rol),
// promover a agente a un usuario ya registrado, cambiar rol, activar/desactivar,
// resetear password y ver el historial de cambios.
class AdminUsuariosController {
  /** @return array{0:Usuario,1:array} usuario y fila */
  private static function obtener(PDO $db, int $id): array {
    $u = new Usuario($db);
    $row = $u->findById($id);
    if (!$row) Response::error('Usuario no encontrado', 404);
    return [$u, $row];
  }

  // GET /api/admin/usuarios?rol=&q=&page=&limit=
  public static function listar(PDO $db, array $claims, array $params, array $body, array $query): void {
    $rol = isset($query['rol']) ? trim((string)$query['rol']) : null;
    if ($rol === '') $rol = null;
    if ($rol !== null && !in_array($rol, Usuario::ROLES, true)) {
      Response::error('Rol inválido (viajero|agente|admin)', 400);
    }
    $q = isset($query['q']) ? trim((string)$query['q']) : null;
    if ($q === '') $q = null;
    if ($q !== null && mb_strlen($q) > 120) Response::error('Búsqueda demasiado larga', 400);

    $limite = min(max((int)($query['limit'] ?? 50), 1), 200);
    $pagina = max((int)($query['page'] ?? 1), 1);
    $u = new Usuario($db);
    $data = $u->listar($rol, $q, $limite, ($pagina - 1) * $limite);
    Response::json([
      'data' => $data,
      'total' => $u->contar($rol, $q),
      'page' => $pagina,
      'limit' => $limite,
    ], 200);
  }

  // POST /api/admin/usuarios {nombre, email, password, rol}
  public static function crear(PDO $db, array $claims, array $params, array $body): void {
    $nombre = trim((string)($body['nombre'] ?? ''));
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $password = (string)($body['password'] ?? '');
    $rol = trim((string)($body['rol'] ?? 'agente'));

    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100) {
      Response::error('Nombre inválido (2 a 100 caracteres)', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) {
      Response::error('Email inválido', 400);
    }
    if (strlen($password) < 8 || strlen($password) > 72) {
      Response::error('Password inválida (8 a 72 caracteres)', 400);
    }
    if (!in_array($rol, Usuario::ROLES, true)) {
      Response::error('Rol inválido (viajero|agente|admin)', 400);
    }

    $u = new Usuario($db);
    if ($u->findByEmail($email)) {
      Response::error('El email ya está registrado', 409);
    }
    try {
      $id = $u->create($nombre, $email, Usuario::hashPassword($password), $rol);
    } catch (PDOException $e) {
      if (($e->errorInfo[0] ?? '') === '23505') {
        Response::error('El email ya está registrado', 409);
      }
      error_log('admin/crear usuario: ' . $e->getMessage());
      Response::error('Error interno del servidor', 500);
    }
    Auditoria::registrar(
      $db,
      $id,
      (int)($claims['sub'] ?? 0) ?: null,
      'crear_usuario',
      'rol',
      null,
      $rol,
      'Alta de ' . $rol . ' ' . $email
    );
    $row = $u->findById($id);
    Response::json(['data' => Usuario::toSafe($row)], 201);
  }

  // PUT /api/admin/usuarios/{id} {rol?, activo?, password?, motivo?}
  public static function actualizar(PDO $db, array $claims, array $params, array $body): void {
    $id = (int)($params['id'] ?? 0);
    if ($id <= 0) Response::error('Usuario inválido', 400);
    [$u, $row] = self::obtener($db, $id);

    $actor = (int)($claims['sub'] ?? 0);
    $rolActual = (string)$row['rol'];
    $nuevoRol = null;
    $nuevoActivo = null;
    $nuevaPass = null;
    $motivo = isset($body['motivo']) ? trim((string)$body['motivo']) : null;
    if ($motivo === '') $motivo = null;
    if ($motivo !== null && mb_strlen($motivo) > 300) {
      Response::error('Motivo demasiado largo (máx. 300 caracteres)', 400);
    }

    if (array_key_exists('rol', $body)) {
      $nuevoRol = trim((string)$body['rol']);
      if (!in_array($nuevoRol, Usuario::ROLES, true)) {
        Response::error('Rol inválido (viajero|agente|admin)', 400);
      }
      if ($nuevoRol === $rolActual) $nuevoRol = null;
    }
    if (array_key_exists('activo', $body)) {
      $nuevoActivo = filter_var($body['activo'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
      if ($nuevoActivo === null) Response::error('Valor de "activo" inválido', 400);
      if ($nuevoActivo === (bool)$row['activo']) $nuevoActivo = null;
    }
    if (array_key_exists('password', $body)) {
      $pass = (string)$body['password'];
      if (strlen($pass) < 8 || strlen($pass) > 72) {
        Response::error('Password inválida (8 a 72 caracteres)', 400);
      }
      $nuevaPass = $pass;
    }

    if ($nuevoRol === null && $nuevoActivo === null && $nuevaPass === null) {
      Response::error('Nada para actualizar (rol, activo y/o password)', 400);
    }

    // Un admin no se degrada ni se desactiva a si mismo (evita quedar sin admins).
    if ($id === $actor && ($nuevoRol !== null || $nuevoActivo === false)) {
      Response::error('No podés cambiar tu propio rol ni desactivar tu cuenta', 400);
    }
    // No se puede dejar la base sin ningún admin activo.
    if ($rolActual === 'admin' && ($nuevoRol !== null || $nuevoActivo === false)) {
      if ($u->contarAdminsActivos($id) === 0) {
        Response::error('Debe quedar al menos un administrador activo', 409);
      }
    }

    try {
      $db->beginTransaction();
      if ($nuevoRol !== null) {
        $u->cambiarRol($id, $nuevoRol);
        Auditoria::registrar($db, $id, $actor ?: null, 'cambio_rol', 'rol', $rolActual, $nuevoRol, $motivo);
      }
      if ($nuevoActivo !== null) {
        $u->setActivo($id, $nuevoActivo);
        Auditoria::registrar(
          $db,
          $id,
          $actor ?: null,
          $nuevoActivo ? 'activar' : 'desactivar',
          'activo',
          $row['activo'] ? 'true' : 'false',
          $nuevoActivo ? 'true' : 'false',
          $motivo
        );
      }
      if ($nuevaPass !== null) {
        $u->setPassword($id, Usuario::hashPassword($nuevaPass));
        Auditoria::registrar($db, $id, $actor ?: null, 'reset_password', 'password', null, '****', $motivo);
      }
      $db->commit();
    } catch (Throwable $e) {
      if ($db->inTransaction()) $db->rollBack();
      error_log('admin/actualizar usuario: ' . $e->getMessage());
      Response::error('Error interno del servidor', 500);
    }

    $row = $u->findById($id);
    Response::json(['data' => Usuario::toSafe($row)], 200);
  }

  // GET /api/admin/usuarios/{id}/historial
  public static function historial(PDO $db, array $claims, array $params, array $body, array $query): void {
    $id = (int)($params['id'] ?? 0);
    if ($id <= 0) Response::error('Usuario inválido', 400);
    [$u, $row] = self::obtener($db, $id);
    $limite = min(max((int)($query['limit'] ?? 50), 1), 200);
    Response::json([
      'data' => Auditoria::porUsuario($db, $id, $limite),
      'usuario' => Usuario::toSafe($row),
    ], 200);
  }

  // GET /api/admin/historial?usuario_id=&limit=
  public static function feed(PDO $db, array $claims, array $params, array $body, array $query): void {
    $usuarioId = isset($query['usuario_id']) ? (int)$query['usuario_id'] : null;
    if ($usuarioId !== null && $usuarioId <= 0) $usuarioId = null;
    $limite = min(max((int)($query['limit'] ?? 100), 1), 200);
    Response::json(['data' => Auditoria::feed($db, $usuarioId, $limite)], 200);
  }
}
