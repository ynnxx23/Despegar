<?php
// Router: tabla de rutas con metodo, patron con parametros y roles.
// Ventajas sobre un if-chain: 405 Method Not Allowed real, versionado (/api y /api/v1)
// y un unico punto donde se aplica la autenticacion por rol.
class Router {
  /** @var array<string, array<string, array{roles:?array, handler:callable}>> metodo => patron => ruta */
  private array $routes = [];

  public function get(string $patron, ?array $roles, callable $handler): void {
    $this->add('GET', $patron, $roles, $handler);
  }
  public function post(string $patron, ?array $roles, callable $handler): void {
    $this->add('POST', $patron, $roles, $handler);
  }
  public function put(string $patron, ?array $roles, callable $handler): void {
    $this->add('PUT', $patron, $roles, $handler);
  }
  public function delete(string $patron, ?array $roles, callable $handler): void {
    $this->add('DELETE', $patron, $roles, $handler);
  }

  private function add(string $metodo, string $patron, ?array $roles, callable $handler): void {
    $this->routes[$metodo][$patron] = ['roles' => $roles, 'handler' => $handler];
  }

  // {id} -> (?P<id>[^/]+)
  private function regex(string $patron): string {
    $p = preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', '(?P<$1>[^/]+)', $patron);
    return '#^' . $p . '$#';
  }

  /**
   * Resuelve la peticion. $bodyProvider devuelve el cuerpo JSON ya parseado
   * (se invoca solo si la ruta lo necesita).
   */
  public function dispatch(PDO $db, string $metodo, string $path, callable $bodyProvider): void {
    $permitidos = [];
    foreach ($this->routes as $m => $porPatron) {
      foreach ($porPatron as $patron => $ruta) {
        if (!preg_match($this->regex($patron), $path, $mch)) continue;
        if ($m !== $metodo) {
          $permitidos[] = $m;
          continue;
        }
        $params = [];
        foreach ($mch as $k => $v) {
          if (!is_int($k)) $params[$k] = $v;
        }
        $claims = [];
        if ($ruta['roles'] !== null) {
          $claims = Auth::requireRole($db, $ruta['roles']);
        }
        $body = ($metodo === 'POST' || $metodo === 'PUT' || $metodo === 'PATCH') ? $bodyProvider() : [];
        $args = [$db, $claims, $params, is_array($body) ? $body : [], $_GET];
        // El handler recibe el prefijo que declare: (db, claims, params, body, query).
        $ref = is_array($ruta['handler'])
          ? new ReflectionMethod($ruta['handler'][0], $ruta['handler'][1])
          : new ReflectionFunction($ruta['handler']);
        $declarados = $ref->getNumberOfParameters();
        if ($declarados < count($args)) {
          $args = array_slice($args, 0, max(1, $declarados));
        }
        call_user_func_array($ruta['handler'], $args);
        return;
      }
    }
    if ($permitidos) {
      header('Allow: ' . implode(', ', array_values(array_unique($permitidos))));
      Response::error('Método no permitido para este endpoint', 405);
    }
    Response::error('Endpoint no encontrado', 404);
  }
}
