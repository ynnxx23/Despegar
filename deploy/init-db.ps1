<#
  Despegar - inicializa la BD de Railway con el schema + seeds + migraciones.
  Uso:
    powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 -DatabaseUrl "postgresql://user:pass@host:5432/railway"

  -Force  : re-aplica schema.sql (DESTRUCTIVO: borra las tablas y sus datos).
            Sin -Force, si la BD ya tiene tablas solo aplica seeds + migraciones.
#>
param(
  [Parameter(Mandatory = $true)][string]$DatabaseUrl,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$db = Join-Path $root 'db'

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending
  if ($candidates) { return $candidates[0].FullName }
  throw 'No se encontro psql. Instalalo (PostgreSQL 15+) o agregalo al PATH.'
}

$psql = Find-Psql
Write-Host "[i] psql: $psql" -ForegroundColor DarkGray

function Invoke-Sql([string]$file) {
  Write-Host "[>] aplicando $(Split-Path -Leaf $file)" -ForegroundColor Cyan
  & $psql $DatabaseUrl -v ON_ERROR_STOP=1 -q -f $file
  if ($LASTEXITCODE -ne 0) { throw "Fallo $(Split-Path -Leaf $file) (exit $LASTEXITCODE)" }
}

# Estado actual
$check = & $psql $DatabaseUrl -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
$tables = [int]($check | Select-Object -First 1)
Write-Host "[i] tablas existentes en public: $tables"

if ($tables -gt 0 -and -not $Force) {
  Write-Host "[!] La BD ya tiene tablas: NO se aplica schema.sql (destructivo)." -ForegroundColor Yellow
  Write-Host "[i] Se aplican seeds + migraciones (upgrade de una base vieja)." -ForegroundColor Yellow
  Invoke-Sql (Join-Path $db 'seeds.sql')
  Invoke-Sql (Join-Path $db 'migrate_02_prioridad_nullable.sql')
  Invoke-Sql (Join-Path $db 'migrate_03_gestion_casos.sql')
  Invoke-Sql (Join-Path $db 'migrate_04_refresh_tokens.sql')
} else {
  if ($tables -gt 0) {
    Write-Host "[!] -Force: se borran y recrean las tablas." -ForegroundColor Red
  }
  Invoke-Sql (Join-Path $db 'schema.sql')
  Invoke-Sql (Join-Path $db 'seeds.sql')
}

Write-Host "[OK] Base inicializada." -ForegroundColor Green
Write-Host "    Usuarios demo: ana@test.com / Viaje1234 (viajera), agente@despegar.com / Agente123 (agente)"
