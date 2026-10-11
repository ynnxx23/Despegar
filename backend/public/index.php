<?php
// Front-controller: tabla de rutas (backend/src/Utils/Router.php).
// Roles: viajero | agente | admin. El admin administra usuarios y agentes.
require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Utils/JwtHS256.php';
require_once __DIR__ . '/../src/Utils/Response.php';
require_once __DIR__ . '/../src/Utils/Cors.php';
require_once __DIR__ . '/../src/Utils/Security.php';
require_once __DIR__ . '/../src/Utils/RateLimit.php';
require_once __DIR__ . '/../src/Utils/Router.php';
require_once __DIR__ . '/../src/Middleware/Auth.php';
require_once __DIR__ . '/../src/Models/Usuario.php';
require_once __DIR__ . '/../src/Models/Auditoria.php';
require_once __DIR__ . '/../src/Models/Reserva.php';
require_once __DIR__ . '/../src/Models/Incidente.php';
require_once __DIR__ . '/../src/Models/GestionCaso.php';
require_once __DIR__ . '/../src/Models/Respuesta.php';
require_once __DIR__ . '/../src/Models/RefreshToken.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/ItinerarioController.php';
require_once __DIR__ . '/../src/Controllers/IncidentesController.php';
require_once __DIR__ . '/../src/Controllers/AdminController.php';
require_once __DIR__ . '/../src/Controllers/AdminUsuariosController.php';

Config::load(__DIR__ . '/../.env');

// Red de seguridad: ninguna excepcion filtra trace/SQL al cliente (se loguea y se
// responde 500 generico con el mismo formato JSON de la API).
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e): void {
  error_log('Error no controlado: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
  if (!headers_sent()) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
  }
  echo json_encode(['error' => ['code' => 500, 'message' => 'Error interno del servidor']], JSON_UNESCAPED_UNICODE);
  exit;
});

// Fail-fast: sin secreto JWT robusto no se opera (nunca exponer el valor al cliente).
if (strlen(Config::get('JWT_SECRET', '')) < 32) {
  error_log('Falta JWT_SECRET de al menos 32 caracteres');
  Response::error('Error interno del servidor', 500);
}

Security::applyHeaders();
Cors::apply();
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');

// Versionado: /api/v1/... es alias de /api/... (mismo comportamiento).
if ($path === '/api/v1') {
  $path = '/api';
} elseif (str_starts_with($path, '/api/v1/')) {
  $path = '/api' . substr($path, strlen('/api/v1'));
}

// Health antes de la BD: responde aunque Postgres este caido.
if ($method === 'GET' && $path === '/api/health') {
  Response::json(['ok' => true, 'service' => 'despegar-api', 'version' => 'v1', 'roles' => ['viajero', 'agente', 'admin']]);
}

function bodyJson(): array {
  $raw = file_get_contents('php://input');
  if ($raw === '' || $raw === false) return [];
  $data = json_decode($raw, true);
  if (json_last_error() !== JSON_ERROR_NONE) Response::error('JSON malformado', 400);
  return is_array($data) ? $data : [];
}

try {
  $db = Database::pdo();
} catch (Throwable $e) {
  error_log('DB connect: ' . $e->getMessage());
  Response::error('Error interno del servidor', 500);
}

$router = new Router();

// --- Publico ---
$router->post('/api/register', null, [AuthController::class, 'register']);
$router->post('/api/login', null, [AuthController::class, 'login']);
$router->post('/api/refresh', null, [AuthController::class, 'refresh']);
$router->post('/api/logout', null, [AuthController::class, 'logout']);

// --- Sesion ---
$router->get('/api/me', ['viajero', 'agente', 'admin'], [AuthController::class, 'me']);

// --- Dominio viajero (RF-04/05/06) ---
$router->get('/api/itinerario', ['viajero'], [ItinerarioController::class, 'show']);
$router->get('/api/incidentes/mios', ['viajero'], [IncidentesController::class, 'mios']);
$router->post('/api/incidentes', ['viajero'], [IncidentesController::class, 'crear']);

// Detalle y respuestas: el dueño (viajero) o cualquier agente/admin.
// (las rutas literales van antes que las de {id} para no pisarse)
$router->get('/api/incidentes/{id}', ['viajero', 'agente', 'admin'], function (PDO $db, array $claims, array $params) {
  $id = (int)$params['id'];
  if ($claims['rol'] === 'viajero') {
    IncidentesController::ver($db, $claims, $params, [], $_GET);
    return;
  }
  AdminController::ver($db, $claims, $params, [], $_GET);
});
$router->get('/api/incidentes/{id}/respuestas', ['viajero', 'agente', 'admin'], function (PDO $db, array $claims, array $params) {
  $id = (int)$params['id'];
  if ($claims['rol'] === 'viajero') {
    IncidentesController::respuestas($db, $claims, $params);
    return;
  }
  AdminController::respuestas($db, $claims, $params);
});

// --- Panel de agentes (RF-07/08/09, control RF-10: viajero recibe 403) ---
$router->get('/api/admin/incidentes/resumen', ['agente', 'admin'], [AdminController::class, 'resumen']);
$router->get('/api/admin/incidentes', ['agente', 'admin'], [AdminController::class, 'cola']);
$router->get('/api/admin/mi-cola', ['agente', 'admin'], [AdminController::class, 'miCola']);
$router->get('/api/admin/agentes', ['agente', 'admin'], [AdminController::class, 'agentes']);
$router->get('/api/admin/incidentes/{id}/historial', ['agente', 'admin'], [AdminController::class, 'historial']);
$router->post('/api/admin/incidentes/{id}/claim', ['agente', 'admin'], [AdminController::class, 'claim']);
$router->post('/api/admin/incidentes/{id}/release', ['agente', 'admin'], [AdminController::class, 'release']);
$router->post('/api/admin/incidentes/{id}/derivar', ['agente', 'admin'], [AdminController::class, 'derivar']);
$router->post('/api/admin/incidentes/{id}/seguir', ['agente', 'admin'], [AdminController::class, 'seguir']);
$router->delete('/api/admin/incidentes/{id}/seguir', ['agente', 'admin'], [AdminController::class, 'dejarSeguir']);
$router->get('/api/admin/incidentes/{id}/respuestas', ['agente', 'admin'], [AdminController::class, 'respuestas']);
$router->post('/api/admin/incidentes/{id}/respuestas', ['agente', 'admin'], [AdminController::class, 'responder']);
$router->get('/api/admin/incidentes/{id}', ['agente', 'admin'], [AdminController::class, 'ver']);
$router->put('/api/admin/incidentes/{id}', ['agente', 'admin'], [AdminController::class, 'actualizar']);

// --- Panel de administracion de usuarios (solo rol admin) ---
$router->get('/api/admin/usuarios', ['admin'], [AdminUsuariosController::class, 'listar']);
$router->post('/api/admin/usuarios', ['admin'], [AdminUsuariosController::class, 'crear']);
$router->get('/api/admin/usuarios/{id}/historial', ['admin'], [AdminUsuariosController::class, 'historial']);
$router->put('/api/admin/usuarios/{id}', ['admin'], [AdminUsuariosController::class, 'actualizar']);
$router->get('/api/admin/historial', ['admin'], [AdminUsuariosController::class, 'feed']);

$router->dispatch($db, $method, $path, 'bodyJson');
