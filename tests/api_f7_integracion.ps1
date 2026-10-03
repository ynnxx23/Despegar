$ErrorActionPreference = 'Stop'
# F7 integración: JWT expirado -> 401 + loop viajero->agente->viajero.
# Requiere API en http://127.0.0.1:8000 (php -S localhost:8000 -t backend/public).
$base = 'http://127.0.0.1:8000'
$here = $PSScriptRoot
$backend = Join-Path (Split-Path $here) 'backend'
$exp = php (Join-Path $here 'mint_expired.php') $backend
try {
  Invoke-RestMethod -Uri "$base/api/me" -Headers @{ Authorization = "Bearer $exp" } | Out-Null
  Write-Output 'EXPIRY FAIL (no 401)'
} catch {
  Write-Output "EXPIRY code=$([int]$_.Exception.Response.StatusCode) esperado=401 (la app hace logout por onUnauthorized)"
}
$rand = Get-Random -Minimum 10000 -Maximum 99999
$reg = Invoke-RestMethod -Uri "$base/api/register" -Method POST -ContentType 'application/json' -Body (@{ nombre = 'Loop'; email = "loop$rand@test.com"; password = 'Clave1234' } | ConvertTo-Json)
$hV = @{ Authorization = "Bearer $($reg.token)" }
$ag = Invoke-RestMethod -Uri "$base/api/login" -Method POST -ContentType 'application/json' -Body (@{ email = 'agente@despegar.com'; password = 'Agente123' } | ConvertTo-Json)
$hG = @{ Authorization = "Bearer $($ag.token)" }
$it = Invoke-RestMethod -Uri "$base/api/itinerario" -Headers $hV
Write-Output "LOOP itinerario_nuevo_viajero=$(@($it.data).Count) esperado=0"
$cr = Invoke-RestMethod -Uri "$base/api/incidentes" -Method POST -ContentType 'application/json' -Headers $hV -Body (@{ tipo = 'Fraude'; titulo = 'Cobro duplicado en mi tarjeta'; descripcion = 'Aparece un cobro duplicado del hotel en mi resumen de tarjeta.' } | ConvertTo-Json)
$id = $cr.data.id
Invoke-RestMethod -Uri "$base/api/admin/incidentes/$id/respuestas" -Method POST -ContentType 'application/json' -Headers $hG -Body (@{ mensaje = 'Bloqueamos el cobro duplicado con el hotel.' } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/api/admin/incidentes/$id" -Method PUT -ContentType 'application/json' -Headers $hG -Body (@{ prioridad = 'Alta'; estado = 'Resuelto' } | ConvertTo-Json) | Out-Null
$fin = Invoke-RestMethod -Uri "$base/api/incidentes/$id" -Headers $hV
$hilo = Invoke-RestMethod -Uri "$base/api/incidentes/$id/respuestas" -Headers $hV
Write-Output "LOOP estado_final=$($fin.data.estado) esperado=Resuelto, respuestas_vistas=$($hilo.data.Count) esperado=1"
