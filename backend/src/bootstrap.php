<?php
// Autoload simple del backend: resuelve clases por nombre de archivo (sin namespaces).
// Busca en src/, src/Models/, src/Controllers/, src/Utils/, src/Middleware/.
// Evita los require_once manuales en index.php.
spl_autoload_register(function (string $class): void {
    $base = __DIR__;
    $candidatos = [
        "{$base}/{$class}.php",
        "{$base}/Models/{$class}.php",
        "{$base}/Controllers/{$class}.php",
        "{$base}/Utils/{$class}.php",
        "{$base}/Middleware/{$class}.php",
    ];
    foreach ($candidatos as $archivo) {
        if (is_file($archivo)) {
            require_once $archivo;
            return;
        }
    }
});
