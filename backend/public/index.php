<?php
// Front-controller F3: auth + dominio viajero/admin. Apps móviles llegan en F4-F6.
require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Utils/JwtHS256.php';
require_once __DIR__ . '/../src/Utils/Response.php';
require_once __DIR__ . '/../src/Middleware/Auth.php';
require_once __DIR__ . '/../src/Models/Usuario.php';
require_once __DIR__ . '/../src/Models/Reserva.php';
require_once __DIR__ . '/../src/Models/Incidente.php';
require_once __DIR__ . '/../src/Models/Respuesta.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/ItinerarioController.php';
require_once __DIR__ . '/../src/Controllers/IncidentesController.php';
require_once __DIR__ . '/../src/Controllers/AdminController.php';

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

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($method === 'GET' && $path === '/api/health') {
  Response::json(['ok' => true, 'service' => 'despegar-api', 'fase' => 'F3-dominio']);
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

if ($method === 'POST' && $path === '/api/register') {
  AuthController::register($db, bodyJson());
}

if ($method === 'POST' && $path === '/api/login') {
  AuthController::login($db, bodyJson());
}

if ($method === 'GET' && $path === '/api/me') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  AuthController::me($db, $claims);
}

// --- Dominio viajero (RF-04/05/06) ---
if ($method === 'GET' && $path === '/api/itinerario') {
  $claims = Auth::requireRole(['viajero']);
  ItinerarioController::show($db, $claims);
}

if ($method === 'GET' && $path === '/api/incidentes/mios') {
  $claims = Auth::requireRole(['viajero']);
  IncidentesController::mios($db, $claims);
}

if ($method === 'POST' && $path === '/api/incidentes') {
  $claims = Auth::requireRole(['viajero']);
  IncidentesController::crear($db, $claims, bodyJson());
}

// Detalle y respuestas visibles para dueño (viajero) o agente global (RF-06/RF-09).
if (preg_match('#^/api/incidentes/(\d+)$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  if ($method === 'GET') {
    if ($claims['rol'] === 'agente') {
      AdminController::ver($db, $claims, (int)$mch[1]);
    } else {
      IncidentesController::ver($db, $claims, (int)$mch[1]);
    }
  }
}

if (preg_match('#^/api/incidentes/(\d+)/respuestas$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  if ($method === 'GET') {
    if ($claims['rol'] === 'agente') {
      AdminController::respuestas($db, (int)$mch[1]);
    } else {
      IncidentesController::respuestas($db, $claims, (int)$mch[1]);
    }
  }
}

// --- Admin agente (RF-07/08/09, control RF-10: viajero recibe 403) ---
if ($method === 'GET' && $path === '/api/admin/agentes') {
  Auth::requireRole(['agente']);
  AdminController::agentes($db);
}

if ($method === 'GET' && $path === '/api/admin/mi-cola') {
  $claims = Auth::requireRole(['agente']);
  AdminController::miCola($db, $claims);
}

if ($method === 'GET' && $path === '/api/admin/incidentes') {
  $claims = Auth::requireRole(['agente']);
  AdminController::cola($db, $claims);
}

if ($method === 'GET' && $path === '/api/admin/incidentes/resumen') {
  $claims = Auth::requireRole(['agente']);
  AdminController::resumen($db, $claims);
}

if (preg_match('#^/api/admin/incidentes/(\d+)/historial$#', $path, $mch)) {
  Auth::requireRole(['agente']);
  if ($method === 'GET') {
    AdminController::historial($db, (int)$mch[1]);
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/claim$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'POST') {
    AdminController::claim($db, $claims, (int)$mch[1]);
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/release$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'POST') {
    AdminController::release($db, $claims, (int)$mch[1]);
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/derivar$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'POST') {
    AdminController::derivar($db, $claims, (int)$mch[1], bodyJson());
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/seguir$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'POST') {
    AdminController::seguir($db, $claims, (int)$mch[1]);
  } elseif ($method === 'DELETE') {
    AdminController::dejarSeguir($db, $claims, (int)$mch[1]);
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/respuestas$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'GET') {
    AdminController::respuestas($db, (int)$mch[1]);
  } elseif ($method === 'POST') {
    AdminController::responder($db, $claims, (int)$mch[1], bodyJson());
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'GET') {
    AdminController::ver($db, $claims, (int)$mch[1]);
  } elseif ($method === 'PUT') {
    AdminController::actualizar($db, $claims, (int)$mch[1], bodyJson());
  }
}

// Sin coincidencia: 404 (los endpoints F3 ya están cableados arriba).
if (str_starts_with($path, '/api/')) {
  Response::error('Endpoint no encontrado', 404);
}

Response::error('Ruta no encontrada', 404);
