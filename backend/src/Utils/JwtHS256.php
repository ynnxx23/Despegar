<?php
// JWT HS256 manual (sin dependencias): header.payload.firma HMAC-SHA256.
// Claims: sub, rol, exp, iat. Nunca incluir password ni secretos.
class JwtHS256 {
  private static function b64u(string $b): string { return rtrim(strtr(base64_encode($b), '+/', '-_'), '='); }
  private static function b64ud(string $s): ?string {
    if ($s === '') return null;
    $dec = base64_decode(strtr($s, '-_', '+/'), true);
    return $dec === false ? null : $dec;
  }

  public static function encode(array $claims, string $secret): string {
    $h = self::b64u(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $p = self::b64u(json_encode($claims));
    $sig = self::b64u(hash_hmac('sha256', "$h.$p", $secret, true));
    return "$h.$p.$sig";
  }

  public static function decode(string $jwt, string $secret): ?array {
    try {
      $parts = explode('.', $jwt);
      if (count($parts) !== 3) return null;
      [$h, $p, $sig] = $parts;
      if ($h === '' || $p === '' || $sig === '') return null;
      $hRaw = self::b64ud($h);
      if ($hRaw === null) return null;
      $header = json_decode($hRaw, true);
      if (json_last_error() !== JSON_ERROR_NONE || !is_array($header)) return null;
      if (($header['alg'] ?? '') !== 'HS256') return null;
      $expected = self::b64u(hash_hmac('sha256', "$h.$p", $secret, true));
      if (strlen($expected) !== strlen($sig) || !hash_equals($expected, $sig)) return null;
      $pRaw = self::b64ud($p);
      if ($pRaw === null) return null;
      $claims = json_decode($pRaw, true);
      if (json_last_error() !== JSON_ERROR_NONE || !is_array($claims)) return null;
      // Claims obligatorios: sub numérico, rol cerrado, exp/iat enteros coherentes.
      if (!isset($claims['sub']) || !is_numeric($claims['sub'])) return null;
      if (!in_array($claims['rol'] ?? '', ['viajero', 'agente'], true)) return null;
      if (!isset($claims['exp']) || !is_numeric($claims['exp']) || (int)$claims['exp'] < time()) return null;
      if (isset($claims['iat']) && (!is_numeric($claims['iat']) || (int)$claims['iat'] > time() + 60)) return null;
      if (isset($claims['iss']) && (!is_string($claims['iss']) || $claims['iss'] === '')) return null;
      return $claims;
    } catch (Throwable $e) {
      return null;
    }
  }
}
