<#
  Despegar - reanuda el proyecto en Railway (despues de deploy\railway-pause.ps1).

  Que hace:
    1. Postgres: recrea el deployment desde la imagen del plugin (mismo volumen,
       mismos datos, mismas variables) y espera que quede SUCCESS.
    2. HEALTHCHECK_ENABLED=1 (o 0 con -AutoSleep): reactiva el healthcheck.
    3. railway up --detach: rebuild desde el repo local (Dockerfile) y levanta la API.
    4. Espera a que /api/health responda 200.

  Uso:
    powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1
    powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1 -AutoSleep
      -AutoSleep deja el healthcheck apagado: con Serverless activado en el
      dashboard la API se duerme sola a los 5-10 min de inactividad (0 compute).
#>
param(
  [switch]$AutoSleep,
  # No levanta la BD (util si solo se quiere tocar la API).
  [switch]$SinPostgres
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$urlFile = Join-Path $root 'deploy\api-url.txt'
$pgImage = 'ghcr.io/railwayapp-templates/postgres-ssl:18'

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

$railway = Find-Railway
Write-Host "[i] railway: $railway" -ForegroundColor DarkGray

if (-not $SinPostgres) {
  Write-Host "[>] levantando Postgres desde $pgImage" -ForegroundColor Cyan
  Invoke-Railway @('service', 'source', 'connect', '--image', $pgImage, '--service', 'Postgres')

  function Wait-Postgres([int]$Attempts) {
    for ($i = 1; $i -le $Attempts; $i++) {
      Start-Sleep -Seconds 5
      $prev = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      $raw = & $railway service status --service Postgres --json 2>$null
      $ErrorActionPreference = $prev
      if ($LASTEXITCODE -eq 0 -and $raw) {
        $st = ($raw -join "`n") | ConvertFrom-Json
        if ($st.status -eq 'SUCCESS') { return $true }
      }
      Write-Host "    ...esperando Postgres ($i/$Attempts)" -ForegroundColor DarkGray
    }
    return $false
  }

  Write-Host "[>] esperando Postgres" -ForegroundColor DarkGray
  $pgOk = Wait-Postgres 12
  if (-not $pgOk) {
    # Fallback: si la config del service quedo con 0 replicas, se fuerza 1.
    Write-Host "[!] Postgres no arranco: fuerzo 1 replica en iad" -ForegroundColor Yellow
    Invoke-Railway @('scale', '--service', 'Postgres', 'iad=1')
    $pgOk = Wait-Postgres 12
  }
  if (-not $pgOk) { throw 'Postgres no llego a SUCCESS. Mirá: railway logs --service Postgres' }
  Write-Host "[OK] Postgres arriba (volumen postgres-volume con los datos)." -ForegroundColor Green
}

$flag = if ($AutoSleep) { '0' } else { '1' }
Write-Host "[>] HEALTHCHECK_ENABLED=$flag" -ForegroundColor Cyan
Invoke-Railway @('variable', 'set', '--service', 'api', "HEALTHCHECK_ENABLED=$flag", '--skip-deploys')

Write-Host "[>] desplegando la API (railway up)" -ForegroundColor Cyan
Invoke-Railway @('up', '--service', 'api', '--detach', '--yes')

if (-not (Test-Path $urlFile)) { throw "No existe $urlFile" }
$apiUrl = (Get-Content $urlFile -Raw).Trim()
$healthUrl = "$apiUrl/health"

Write-Host "[>] esperando health en $healthUrl" -ForegroundColor DarkGray
$ok = $false
for ($i = 1; $i -le 40; $i++) {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
      $ok = $true
      Write-Host "[OK] API arriba: $apiUrl" -ForegroundColor Green
      break
    }
  } catch {
    Write-Host "    ...esperando ($i/40)" -ForegroundColor DarkGray
  }
}

if (-not $ok) {
  Write-Host "[!] La API no respondio a tiempo. Mirá los logs: railway logs --service api" -ForegroundColor Yellow
  exit 1
}

if ($AutoSleep) {
  Write-Host "[i] AutoSleep: activa 'Settings > Deploy > Serverless' en el dashboard para que duerma sola." -ForegroundColor Yellow
}
