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
    powershell -ExecutionPolicy Bypass -File deploy\railway-resume.ps1 -MaxIntentos 0
      -MaxIntentos 0 falla en el primer error (sin esperas).
#>
param(
  [switch]$AutoSleep,
  # No levanta la BD (util si solo se quiere tocar la API).
  [switch]$SinPostgres,
  # Reintentos cuando Railway rechaza los deploys por incidente de la plataforma
  # ("Deploys have been paused temporarily"). 0 = sin reintentos.
  [int]$MaxIntentos = 60,
  [int]$EsperaSeg = 60
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$urlFile = Join-Path $root 'deploy\api-url.txt'
$pgImage = 'ghcr.io/railwayapp-templates/postgres-ssl:18'
# Marca True cuando la plataforma responde "Deploys have been paused temporarily".
$script:DeployPause = $false

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
    # Incidente global de la plataforma: Railway pausa los deploys de todos los
    # workspaces (no es un problema del proyecto). Se reintenta solo.
    if ($text -match 'Deploys have been paused') {
      $script:DeployPause = $true
      throw "railway $($RailwayArgs -join ' ') fallo (exit $code): deploys pausados por la plataforma"
    }
    throw "railway $($RailwayArgs -join ' ') fallo (exit $code)"
  }
  $out | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
}

# Ejecuta un comando de Railway reintentando mientras la plataforma tenga los
# deploys pausados. Devuelve $true si eventually salio bien.
function Invoke-ConReintento([string[]]$RailwayArgs, [string]$Que) {
  for ($i = 1; $i -le [Math]::Max($MaxIntentos, 1); $i++) {
    try {
      Invoke-Railway $RailwayArgs
      return $true
    } catch {
      if (-not $script:DeployPause -or $MaxIntentos -le 0) { throw }
      Write-Host "    [!] Railway tiene los deploys pausados (incidente de la plataforma)." -ForegroundColor Yellow
      Write-Host "        $Que -> reintento $i/$MaxIntentos en $EsperaSeg s" -ForegroundColor DarkGray
      Write-Host "        https://status.railway.com" -ForegroundColor DarkGray
      $script:DeployPause = $false
      Start-Sleep -Seconds $EsperaSeg
    }
  }
  return $false
}

# Devuelve la region donde corre el servicio, para el fallback de scale.
# Los ids de zona (us-west2) se normalizan a la region que acepta la CLI
# (us-west, us-east, eu-west, southeast-asia); los ids viejos (iad, egr...)
# se traducen. Si no se puede leer, se asume us-west.
function Get-ScaleRegion([string]$Service) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $raw = & $railway deployment list --service $Service --json 2>$null
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0 -and $raw) {
    try {
      $list = ($raw -join "`n") | ConvertFrom-Json
      if ($list -and $list.Count -gt 0) {
        $cfg = $list[0].meta.serviceManifest.deploy.multiRegionConfig
        $key = @($cfg.PSObject.Properties.Name)[0]
        if ($key) {
          $r = ($key -replace '\d+$', '')
          $map = @{ 'iad' = 'us-east'; 'egr' = 'eu-west'; 'ord' = 'us-west'; 'sin' = 'southeast-asia' }
          if ($map.ContainsKey($r)) { return $map[$r] }
          if ($r -in @('us-east', 'us-west', 'eu-west', 'southeast-asia')) { return $r }
        }
      }
    } catch {}
  }
  return 'us-west'
}

$railway = Find-Railway
Write-Host "[i] railway: $railway" -ForegroundColor DarkGray

if (-not $SinPostgres) {
  Write-Host "[>] levantando Postgres desde $pgImage" -ForegroundColor Cyan
  Invoke-ConReintento @('service', 'source', 'connect', '--image', $pgImage, '--service', 'Postgres') 'Postgres' | Out-Null

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
  $pgOk = Wait-Postgres 24
  if (-not $pgOk) {
    # Fallback: si la config del service quedo con 0 replicas, se fuerza 1
    # en la region donde ya estaba (no en una nueva).
    $region = Get-ScaleRegion 'Postgres'
    Write-Host "[!] Postgres no arranco: fuerzo 1 replica en $region" -ForegroundColor Yellow
    Invoke-ConReintento @('scale', '--service', 'Postgres', "$region=1") 'scale Postgres' | Out-Null
    $pgOk = Wait-Postgres 24
  }
  if (-not $pgOk) { throw 'Postgres no llego a SUCCESS. Mirá: railway logs --service Postgres' }
  Write-Host "[OK] Postgres arriba (volumen postgres-volume con los datos)." -ForegroundColor Green
}

$flag = if ($AutoSleep) { '0' } else { '1' }
Write-Host "[>] HEALTHCHECK_ENABLED=$flag" -ForegroundColor Cyan
try {
  Invoke-Railway @('variable', 'set', '--service', 'api', "HEALTHCHECK_ENABLED=$flag", '--skip-deploys')
} catch {
  Write-Host "[!] no pude setear HEALTHCHECK_ENABLED: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "[>] desplegando la API (railway up)" -ForegroundColor Cyan
Invoke-ConReintento @('up', '--service', 'api', '--detach', '--yes') 'API' | Out-Null

if (-not (Test-Path $urlFile)) { throw "No existe $urlFile" }
$apiUrl = (Get-Content $urlFile -Raw).Trim()
$healthUrl = "$apiUrl/health"

Write-Host "[>] esperando health en $healthUrl" -ForegroundColor DarkGray
$ok = $false
for ($i = 1; $i -le 60; $i++) {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
      $ok = $true
      Write-Host "[OK] API arriba: $apiUrl" -ForegroundColor Green
      break
    }
  } catch {
    Write-Host "    ...esperando ($i/60)" -ForegroundColor DarkGray
  }
}

if (-not $ok) {
  Write-Host "[!] La API no respondio a tiempo. Mirá los logs: railway logs --service api" -ForegroundColor Yellow
  exit 1
}

# El health responde aunque Postgres este caido: se verifica el login contra la BD.
try {
  $login = Invoke-WebRequest -Uri "$apiUrl/login" -Method POST -ContentType 'application/json' `
    -Body (@{ email = 'agente@despegar.com'; password = 'Agente123' } | ConvertTo-Json) `
    -UseBasicParsing -TimeoutSec 15
  if ($login.StatusCode -eq 200) { Write-Host "[OK] La base responde (login 200)." -ForegroundColor Green }
} catch {
  Write-Host "[!] El health responde pero la base no: $($_.Exception.Message)" -ForegroundColor Yellow
}

if ($AutoSleep) {
  Write-Host "[i] AutoSleep: activa 'Settings > Deploy > Serverless' en el dashboard para que duerma sola." -ForegroundColor Yellow
}
