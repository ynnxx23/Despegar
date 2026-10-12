<?php
// IA + copiloto + resumen (Fase 4a). Heurística local, mismo contrato que un modelo real.
class IaController {
  public static function triage(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    [$sugerida, $motivo] = Incidente::sugerirPrioridad($inc['tipo'], $inc['titulo'], $inc['descripcion']);
    $ia = IaHeuristica::score($inc['tipo'], $inc['titulo'], $inc['descripcion']);
    // Persiste score para SLA predictivo y dashboards.
    try {
      $st = $db->prepare('UPDATE incidentes SET ia_score = ?, ia_explica = ? WHERE id = ?');
      $st->execute([$ia['score'], $ia['explica'], $id]);
    } catch (PDOException $e) { /* pre-migrate_05 */ }
    $m->registrarEvento($id, (int)($claims['sub'] ?? 0) ?: null, 'triaje', 'ia:' . $ia['nivel'] . ' ' . $ia['score']);
    Response::json(['data' => [
      'incidente_id' => $id,
      'sugerida' => $sugerida,
      'motivo' => $motivo,
      'ia_score' => $ia['score'],
      'ia_nivel' => $ia['nivel'],
      'ia_explica' => $ia['explica'],
    ]], 200);
  }

  public static function copiloto(PDO $db, array $claims, int $id, array $body): void {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    $tono = strtolower(trim($body['tono'] ?? 'cercano'));
    if (!in_array($tono, ['cercano', 'formal'], true)) $tono = 'cercano';
    $nombre = null;
    try {
      $st = $db->prepare('SELECT nombre FROM usuarios WHERE id = ? LIMIT 1');
      $st->execute([(int)$inc['user_id']]);
      $nombre = $st->fetchColumn() ?: null;
      if (is_string($nombre)) $nombre = trim(explode(' ', $nombre)[0]);
    } catch (Throwable $e) { $nombre = null; }
    // RAG heurístico: mejor respuesta de base_conocimiento para el tipo.
    $fuente = null;
    try {
      $st = $db->prepare('SELECT respuesta FROM base_conocimiento WHERE tipo = ? LIMIT 1');
      $st->execute([$inc['tipo']]);
      $fuente = $st->fetchColumn() ?: null;
    } catch (PDOException $e) { $fuente = null; }
    $sug = IaHeuristica::sugerirRespuesta($inc['tipo'], $inc['titulo'], $nombre, $tono);
    if ($fuente) $sug['contexto'] = (string)$fuente;
    Response::json(['data' => $sug + ['incidente_id' => $id]], 200);
  }

  public static function resumen(PDO $db, array $claims, int $id): void {
    $m = new Incidente($db);
    $inc = $m->findById($id);
    if (!$inc) Response::error('Incidente no encontrado', 404);
    if (($claims['rol'] ?? '') === 'viajero' && (int)$inc['user_id'] !== (int)($claims['sub'] ?? 0)) {
      Response::error('Permiso denegado', 403);
    }
    $r = new Respuesta($db);
    $esViajero = ($claims['rol'] ?? '') === 'viajero';
    $hilo = $r->listByIncidente($id, $esViajero, 200, 0);
    $textos = array_map(fn($x) => (string)($x['mensaje'] ?? ''), $hilo);
    $res = IaHeuristica::resumir($textos);
    $lang = strtolower(trim($_GET['lang'] ?? 'es'));
    if (in_array($lang, ['en', 'pt'], true)) {
      $res['puntos'] = array_map(fn($p) => IaHeuristica::traducir($p, $lang), $res['puntos']);
      $res['lang'] = $lang;
      $res['nota'] = 'Traducción básica automática';
    } else {
      $res['lang'] = 'es';
    }
    $res['incidente_id'] = $id;
    $res['estado'] = $inc['estado'];
    Response::json(['data' => $res], 200);
  }
}
