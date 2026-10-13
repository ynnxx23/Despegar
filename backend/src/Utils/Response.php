<?php
// Respuesta JSON uniforme. Nunca expone traces ni SQL al cliente.
// Formato error: {error:{code:int, message, code_str?, request_id?, details?}} (code int se conserva por contrato tests).
class Response {
  public static function json(mixed $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    if (class_exists('Logger') && Logger::$requestId !== '') {
      header('X-Request-Id: ' . Logger::$requestId);
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }
  public static function error(string $message, int $status, array $details = []): void {
    $codeStr = $details['code'] ?? self::defaultCode($status, $message);
    if (isset($details['code'])) unset($details['code']);
    $err = ['code' => $status, 'code_str' => $codeStr, 'message' => $message];
    if (class_exists('Logger') && Logger::$requestId !== '') {
      $err['request_id'] = Logger::$requestId;
    }
    if ($details) $err['details'] = $details;
    self::json(['error' => $err], $status);
  }

  private static function defaultCode(int $status, string $message): string {
    return match ($status) {
      400 => str_contains($message, 'JSON') ? 'INVALID_JSON' : 'VALIDATION_FAILED',
      401 => str_contains($message, 'expirado') || str_contains($message, 'expirad') ? 'AUTH_EXPIRED' : 'UNAUTHORIZED',
      403 => 'FORBIDDEN',
      404 => 'NOT_FOUND',
      409 => 'CONFLICT',
      429 => 'RATE_LIMITED',
      default => $status >= 500 ? 'INTERNAL' : 'ERROR',
    };
  }
}
