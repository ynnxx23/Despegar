<?php
// Front-controller F3: auth + dominio viajero/admin. Apps móviles llegan en F4-F6.
require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Utils/JwtHS256.php';
require_once __DIR__ . '/../src/Utils/Response.php';
require_once __DIR__ . '/../src/Utils/Logger.php';
require_once __DIR__ . '/../src/Utils/RateLimit.php';
require_once __DIR__ . '/../src/Utils/IaHeuristica.php';
require_once __DIR__ . '/../src/Utils/AuditoriaHash.php';
require_once __DIR__ . '/../src/Utils/Ocr.php';
require_once __DIR__ . '/../src/Utils/Stt.php';
require_once __DIR__ . '/../src/Utils/Push.php';
require_once __DIR__ . '/../src/Middleware/Auth.php';
require_once __DIR__ . '/../src/Models/Usuario.php';
require_once __DIR__ . '/../src/Models/Reserva.php';
require_once __DIR__ . '/../src/Models/Incidente.php';
require_once __DIR__ . '/../src/Models/Respuesta.php';
require_once __DIR__ . '/../src/Models/Notificacion.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/ItinerarioController.php';
require_once __DIR__ . '/../src/Controllers/IncidentesController.php';
require_once __DIR__ . '/../src/Controllers/AdminController.php';
require_once __DIR__ . '/../src/Controllers/AdjuntosController.php';
require_once __DIR__ . '/../src/Controllers/NotificacionesController.php';
require_once __DIR__ . '/../src/Controllers/IaController.php';
require_once __DIR__ . '/../src/Controllers/ChatbotController.php';

Config::load(__DIR__ . '/../.env');
Logger::init();

// Handler global: toda excepción/error no atrapada -> JSON 500 sin traces.
set_exception_handler(function (Throwable $e): void {
  Logger::error('unhandled', ['type' => get_class($e)]);
  Response::error('Error interno del servidor', 500);
});
set_error_handler(function (int $no, string $str): bool {
  Logger::error('php_error', ['no' => $no]);
  return false;
});

// Fail-fast: sin secreto JWT robusto no se opera (nunca exponer el valor al cliente).
if (strlen(Config::get('JWT_SECRET', '')) < 32) {
  error_log('Falta JWT_SECRET de al menos 32 caracteres');
  Response::error('Error interno del servidor', 500);
}

// CORS allowlist (dev abierto solo si CORS_ORIGIN=* o vacío). Prod: setear dominio.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowList = array_filter(array_map('trim', explode(',', Config::get('CORS_ORIGIN', '*'))));
$allowStar = in_array('*', $allowList, true) || $allowList === [];
if ($allowStar) {
  header('Access-Control-Allow-Origin: *');
} elseif ($origin !== '' && in_array($origin, $allowList, true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization, Idempotency-Key');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
if (Config::get('APP_ENV', 'dev') === 'prod') {
  header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($method === 'GET' && $path === '/api/health') {
  $dbOk = false;
  try {
    $tmp = Database::pdo();
    $tmp->query('SELECT 1');
    $dbOk = true;
  } catch (Throwable $e) { $dbOk = false; }
  Response::json(['ok' => $dbOk, 'service' => 'despegar-api', 'fase' => 'F3-dominio', 'db' => $dbOk ? 'up' : 'down'], $dbOk ? 200 : 503);
}

if ($method === 'GET' && $path === '/api/openapi.json') {
  $f = __DIR__ . '/../../docs/openapi.json';
  if (!file_exists($f)) Response::error('Documentación no encontrada', 404);
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(200);
  readfile($f);
  exit;
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
  $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
  $ip = trim(explode(',', (string)$ip)[0]);
  RateLimit::checkLogin($ip);
  AuthController::login($db, bodyJson());
}

// Rate-limit global para escritura (POST/PUT/DELETE bajo /api).
if (in_array($method, ['POST', 'PUT', 'DELETE'], true) && str_starts_with($path, '/api/')) {
  $ipG = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
  $ipG = trim(explode(',', (string)$ipG)[0]);
  RateLimit::checkGlobal($ipG);
}

if ($method === 'GET' && $path === '/api/me') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  AuthController::me($db, $claims);
}

if ($method === 'POST' && $path === '/api/refresh') {
  AuthController::refresh($db, bodyJson());
}

if ($method === 'POST' && $path === '/api/password/solicitar') {
  AuthController::passwordSolicitar($db, bodyJson());
}

if ($method === 'POST' && $path === '/api/password/restablecer') {
  AuthController::passwordRestablecer($db, bodyJson());
}

if ($method === 'POST' && $path === '/api/logout') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  AuthController::logout($db, $claims, bodyJson());
}

if ($method === 'DELETE' && $path === '/api/me') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  AuthController::borrarCuenta($db, $claims);
}

if ($method === 'POST' && $path === '/api/email/solicitar') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  AuthController::emailSolicitar($db, $claims);
}

if ($method === 'POST' && $path === '/api/email/verificar') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  AuthController::emailVerificar($db, $claims, bodyJson());
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
      AdminController::ver($db, (int)$mch[1]);
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

if ($method === 'POST' && $path === '/api/admin/agentes') {
  $claims = Auth::requireRole(['agente']);
  AdminController::agenteCrear($db, $claims, bodyJson());
}

if (preg_match('#^/api/admin/agentes/(\d+)/estado$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'PUT') {
    AdminController::agenteEstado($db, $claims, (int)$mch[1], bodyJson());
  }
}

if ($method === 'GET' && $path === '/api/admin/mi-cola') {
  $claims = Auth::requireRole(['agente']);
  AdminController::miCola($db, $claims);
}

if ($method === 'GET' && $path === '/api/admin/incidentes') {
  Auth::requireRole(['agente']);
  AdminController::cola($db);
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
    AdminController::ver($db, (int)$mch[1]);
  } elseif ($method === 'PUT') {
    AdminController::actualizar($db, $claims, (int)$mch[1], bodyJson());
  }
}

// --- Fase 2/3: réplica viajero, reabrir/cancelar, adjuntos, bulk/merge, métricas ---
if (preg_match('#^/api/incidentes/(\d+)/respuestas$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  if ($method === 'POST' && ($claims['rol'] ?? '') === 'viajero') {
    IncidentesController::responderViajero($db, $claims, (int)$mch[1], bodyJson());
  }
}

if (preg_match('#^/api/incidentes/(\d+)/reabrir$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero']);
  if ($method === 'POST') {
    IncidentesController::reabrir($db, $claims, (int)$mch[1]);
  }
}

if (preg_match('#^/api/incidentes/(\d+)/adjuntos$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  if ($method === 'GET') {
    AdjuntosController::listar($db, $claims, (int)$mch[1]);
  } elseif ($method === 'POST') {
    AdjuntosController::subir($db, $claims, (int)$mch[1], bodyJson());
  }
}

if ($method === 'POST' && $path === '/api/admin/incidentes/bulk') {
  $claims = Auth::requireRole(['agente']);
  AdminController::bulk($db, $claims, bodyJson());
}

if (preg_match('#^/api/admin/incidentes/(\d+)/merge$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'POST') {
    AdminController::merge($db, $claims, (int)$mch[1], bodyJson());
  }
}

if ($method === 'GET' && $path === '/api/admin/metricas') {
  Auth::requireRole(['agente']);
  AdminController::metricas($db);
}

if ($method === 'GET' && $path === '/api/admin/metricas.csv') {
  Auth::requireRole(['agente']);
  AdminController::metricasCsv($db);
}

if ($method === 'GET' && $path === '/api/admin/sla/riesgo') {
  Auth::requireRole(['agente']);
  AdminController::slaRiesgo($db);
}

if ($method === 'POST' && $path === '/api/admin/sla/revisar') {
  $claims = Auth::requireRole(['agente']);
  AdminController::slaRevisar($db, $claims);
}

if (preg_match('#^/api/admin/incidentes/(\d+)/auditoria$#', $path, $mch)) {
  Auth::requireRole(['agente']);
  if ($method === 'GET') {
    AdminController::auditoriaVerificar($db, (int)$mch[1]);
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/auditoria/resellar$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'POST') {
    AdminController::auditoriaResellar($db, $claims, (int)$mch[1]);
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/ia$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'GET') {
    IaController::triage($db, $claims, (int)$mch[1]);
  }
}

if (preg_match('#^/api/admin/incidentes/(\d+)/copiloto$#', $path, $mch)) {
  $claims = Auth::requireRole(['agente']);
  if ($method === 'POST') {
    IaController::copiloto($db, $claims, (int)$mch[1], bodyJson());
  }
}

if (preg_match('#^/api/incidentes/(\d+)/resumen$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  if ($method === 'GET') {
    IaController::resumen($db, $claims, (int)$mch[1]);
  }
}

if (preg_match('#^/api/incidentes/(\d+)/adjuntos/(\d+)/ocr$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  if ($method === 'POST') {
    AdjuntosController::ocr($db, $claims, (int)$mch[1], (int)$mch[2]);
  }
}

// Notificaciones propias.
if ($method === 'GET' && $path === '/api/notificaciones') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  NotificacionesController::mias($db, $claims);
}

if ($method === 'GET' && $path === '/api/notificaciones/no-leidas') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  NotificacionesController::contar($db, $claims);
}

if ($method === 'POST' && $path === '/api/notificaciones/leer-todas') {
  $claims = Auth::requireRole(['viajero', 'agente']);
  NotificacionesController::leerTodas($db, $claims);
}

if (preg_match('#^/api/notificaciones/(\d+)/leer$#', $path, $mch)) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  if ($method === 'POST') {
    NotificacionesController::leer($db, $claims, (int)$mch[1]);
  }
}

// Chatbot + STT.
if ($method === 'POST' && $path === '/api/chatbot/borrador') {
  $claims = Auth::requireRole(['viajero']);
  ChatbotController::borrador($db, $claims, bodyJson());
}

if ($method === 'POST' && $path === '/api/stt/transcribir') {
  Auth::requireRole(['viajero', 'agente']);
  ChatbotController::transcribir(bodyJson());
}

// SSE snapshot (una entrega, sin loop para no colgar PHP).
if ($method === 'GET' && ($path === '/api/stream' || $path === '/api/admin/stream')) {
  $claims = Auth::requireRole(['viajero', 'agente']);
  header('Content-Type: text/event-stream; charset=utf-8');
  header('Cache-Control: no-cache');
  http_response_code(200);
  $n = Notificacion::contarNoLeidas($db, (int)($claims['sub'] ?? 0));
  echo "retry: 30000\n";
  echo 'data: ' . json_encode(['no_leidas' => $n], JSON_UNESCAPED_UNICODE) . "\n\n";
  exit;
}

// Sin coincidencia: 404 (los endpoints F3 ya están cableados arriba).
if (str_starts_with($path, '/api/')) {
  Response::error('Endpoint no encontrado', 404);
}

Response::error('Ruta no encontrada', 404);
