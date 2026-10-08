# Despegar - API en Railway (PHP 8.2 CLI + pdo_pgsql)
# Build context: raiz del repo. Imagen minima, sin Apache ni vendor (cero dependencias).
FROM php:8.2-cli

# pdo_pgsql necesita libpq-dev para linkear; se limpia el cache de apt.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev \
 && docker-php-ext-install pdo_pgsql \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/ /app/

# Railway inyecta PORT; el server embebido de PHP debe escuchar en esa variable.
ENV PORT=8000
EXPOSE 8000

# Varios workers: el server embebido es single-thread por defecto y la app
# dispara varias peticiones en paralelo (health + itinerario).
ENV PHP_CLI_SERVER_WORKERS=8

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD php -r "exit(@file_get_contents('http://127.0.0.1:'.(getenv('PORT')?:8000).'/api/health') ? 0 : 1);"

CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8000} -t /app/public"]
