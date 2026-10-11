<#
  Despegar - pausa el proyecto en Railway para dejar de consumir usage.

  Que hace:
    1. HEALTHCHECK_ENABLED=0 : el healthcheck sale sin pegarle un request al server
       (sin trafico saliente). Con Serverless activado esto permite que el
       servicio se duerma solo; con el healthcheck cada 30s nunca duerme.
    2. railway down (api)     : quita el deployment de la API. El container se
       apaga y deja de facturar CPU/RAM.
    3. railway down (Postgres): idem para la BD. El volumen postgres-volume NO
       se borra: los datos quedan intactos y se recuperan al reanudar.

  Reanudar con deploy\railway-resume.ps1 (recrea Postgres desde la imagen y
  vuelve a desplegar la API).

  Uso:
    powershell -ExecutionPolicy Bypass -File deploy\railway-pause.ps1
    powershell -ExecutionPolicy Bypass -File deploy\railway-pause.ps1 -SoloHealthcheck
#>
param(
  # Solo cambia la variable (healthcheck apagado) sin tocar los deployments.
  [switch]$SoloHealthcheck,
  # Pausa solo la API y deja Postgres corriendo.
  [switch]$SinPostgres
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Find-Railway {
  $cmd = Get-Command railway.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cmd = Get-Command railway -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $p = Join-Path $env:APPDATA 'npm\railway.cmd'
  if (Test-Path $p) { return $p }
  throw 'No se encontro la CLI de Railway. Instalala: npm install -g @railway/cli'
}

function Invoke-Railway([string[]]$RailwayArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & $railway @RailwayArgs 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  $text = ($out | Out-String)
  if ($code -ne 0 -or $text -match 'Usage: railway') {
    Write-Host $text -ForegroundColor DarkGray
    throw "railway $($RailwayArgs -join ' ') fallo (exit $code)"
  }
  $out | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
}

# Idempotente y verificado por estado: si el servicio ya esta sin deployment, no lo toca.
function Get-DeploymentId([string]$Name) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $raw = & $railway service status --service $Name --json 2>$null
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0 -and $raw) {
    $st = ($raw -join "`n") | ConvertFrom-Json
    if ($st.deploymentId) { return $st.deploymentId }
  }
  return $null
}

function Stop-Service([string]$Name) {
  if (-not (Get-DeploymentId $Name)) {
    Write-Host "    $Name ya estaba pausado (sin deployment)." -ForegroundColor DarkGray
    return
  }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $railway down --service $Name --yes 2>&1 | Out-Null
  $ErrorActionPreference = $prev
  Start-Sleep -Seconds 3
  if (Get-DeploymentId $Name) { throw "no se pudo bajar el deployment de $Name" }
  Write-Host "    $Name pausado." -ForegroundColor DarkGray
}

$railway = Find-Railway
Write-Host "[i] railway: $railway" -ForegroundColor DarkGray

Write-Host "[>] HEALTHCHECK_ENABLED=0 (healthcheck sin trafico)" -ForegroundColor Cyan
Invoke-Railway @('variable', 'set', '--service', 'api', 'HEALTHCHECK_ENABLED=0', '--skip-deploys')

if ($SoloHealthcheck) {
  Write-Host "[OK] Healthcheck desactivado. Los deployments siguen corriendo." -ForegroundColor Green
  exit 0
}

Write-Host "[>] apagando la API (railway down --service api)" -ForegroundColor Cyan
Stop-Service 'api'

if (-not $SinPostgres) {
  Write-Host "[>] apagando Postgres (railway down --service Postgres)" -ForegroundColor Cyan
  Stop-Service 'Postgres'
}

Write-Host "[OK] Proyecto pausado: 0 CPU / 0 RAM facturados." -ForegroundColor Green
Write-Host "    Los datos siguen en el volumen postgres-volume." -ForegroundColor DarkGray
Write-Host "    Reanudar: powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1" -ForegroundColor DarkGray
