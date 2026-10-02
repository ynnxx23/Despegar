<?php
// JWT HS256 manual (sin dependencias): header.payload.firma HMAC-SHA256.
// Claims: sub, rol, exp, iat. Nunca incluir password ni secretos.
class JwtHS256 {
  private static function b64u(string $b): string { return rtrim(strtr(base64_encode($b), '+/', '-_'), '='); }
  private static function b64ud(string $s): string { return base64_decode(strtr($s, '-_', '+/')); }

  public static function encode(array $claims, string $secret): string {
    $h = self::b64u(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $p = self::b64u(json_encode($claims));
    $sig = self::b64u(hash_hmac('sha256', "$h.$p", $secret, true));
    return "$h.$p.$sig";
  }

  public static function decode(string $jwt, string $secret): ?array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return null;
    [$h, $p, $sig] = $parts;
    $header = json_decode(self::b64ud($h), true);
    if (($header['alg'] ?? '') !== 'HS256') return null;
    $expected = self::b64u(hash_hmac('sha256', "$h.$p", $secret, true));
    if (!hash_equals($expected, $sig)) return null;
    $claims = json_decode(self::b64ud($p), true);
    if (!is_array($claims) || ($claims['exp'] ?? 0) < time()) return null;
    return $claims;
  }
}
