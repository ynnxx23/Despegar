<?php
// Respuesta JSON uniforme. Nunca expone traces ni SQL al cliente.
class Response {
  public static function json(mixed $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }
  public static function error(string $message, int $status, array $details = []): void {
    self::json(['error' => ['code' => $status, 'message' => $message] + ($details ? ['details' => $details] : [])], $status);
  }
}
