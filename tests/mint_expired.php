<?php
// Genera un JWT expirado con la clave real del backend (solo para tests F7).
// Uso: php tests/mint_expired.php [ruta_backend]
$backend = $argv[1] ?? dirname(__DIR__) . '/backend';
require $backend . '/src/Utils/JwtHS256.php';
$env = parse_ini_file($backend . '/.env');
$t = JwtHS256::encode(['sub' => 2, 'rol' => 'viajero', 'iat' => time() - 7200, 'exp' => time() - 3600], $env['JWT_SECRET']);
echo $t;
