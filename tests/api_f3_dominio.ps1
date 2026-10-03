$base = 'http://127.0.0.1:8000'
function Call($method, $path, $body = $null, $token = $null) {
  $h = @{ 'Content-Type' = 'application/json' }
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $opt = @{ Uri = "$base$path"; Method = $method; Headers = $h; ErrorAction = 'Stop' }
  if ($body) { $opt['Body'] = ($body | ConvertTo-Json) }
  try {
    $r = Invoke-RestMethod @opt
    return @{ ok = $true; data = $r }
  } catch {
    $code = [int]$_.Exception.Response.StatusCode
    $txt = ''
    try {
      $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
      $txt = $sr.ReadToEnd()
    } catch { }
    return @{ ok = $false; code = $code; body = $txt }
  }
}
function Login($email, $pass) { return (Call 'POST' '/api/login' @{ email = $email; password = $pass }).data }
$out = @()
$ana = Login 'ana@test.com' 'Viaje1234'; $tokA = $ana.token
$bruno = Login 'bruno@test.com' 'Viaje5678'; $tokB = $bruno.token
$ag = Login 'agente@despegar.com' 'Agente123'; $tokG = $ag.token
# 1. itinerario propio
$iA = Call 'GET' '/api/itinerario' $null $tokA
$out += "ITIN_ANA n=$(@($iA.data.data).Count) esperado=2"
$iB = Call 'GET' '/api/itinerario' $null $tokB
$out += "ITIN_BRUNO n=$(@($iB.data.data).Count) esperado=1"
$iAg = Call 'GET' '/api/itinerario' $null $tokG
$out += "ITIN_AGENTE code=$($iAg.code) esperado=403"
# 2. crear incidente válido (reserva propia AR1234)
$resId = ($iA.data.data | Where-Object { $_.codigo -eq 'AR1234' }).id
$c1 = Call 'POST' '/api/incidentes' @{ reserva_id = $resId; tipo = 'Vuelo_cancelado'; titulo = 'Varado por cancelación nocturna'; descripcion = 'El vuelo fue cancelado de noche y necesito reprogramación urgente para mañana.' } $tokA
$out += "CREATE ok=$($c1.ok) estado=$($c1.data.data.estado) prio=$($c1.data.data.prioridad)"
$newId = $c1.data.data.id
# 3. reserva ajena -> 404
$resB = ($iB.data.data | Select-Object -First 1).id
$c2 = Call 'POST' '/api/incidentes' @{ reserva_id = $resB; tipo = 'Otro'; titulo = 'Intento con reserva ajena x'; descripcion = 'Descripcion suficientemente larga para pasar validacion.' } $tokA
$out += "CREATE_AJENA code=$($c2.code) esperado=404"
# 4. tipo inválido -> 400
$c3 = Call 'POST' '/api/incidentes' @{ tipo = 'Ovni'; titulo = 'Titulo valido largo'; descripcion = 'Descripcion suficientemente larga para pasar validacion.' } $tokA
$out += "CREATE_TIPO code=$($c3.code) esperado=400"
# 5. míos: ana lo ve, bruno no
$mA = Call 'GET' '/api/incidentes/mios' $null $tokA
$out += "MIOS_ANA ve_nuevo=$(($mA.data.data | Where-Object { $_.id -eq $newId } | Measure-Object).Count) esperado=1"
$mB = Call 'GET' '/api/incidentes/mios' $null $tokB
$out += "MIOS_BRUNO ve_ajeno=$(($mB.data.data | Where-Object { $_.id -eq $newId } | Measure-Object).Count) esperado=0"
# 6. detalle: dueño ok, otro viajero 403, agente ok
$d1 = Call 'GET' "/api/incidentes/$newId" $null $tokA
$out += "DET_DUENO ok=$($d1.ok)"
$d2 = Call 'GET' "/api/incidentes/$newId" $null $tokB
$out += "DET_AJENO code=$($d2.code) esperado=403"
$d3 = Call 'GET' "/api/incidentes/$newId" $null $tokG
$out += "DET_AGENTE ok=$($d3.ok)"
# 7. cola admin: agente ok, viajero 403, orden asc (el seed id=1 es más antiguo que el nuevo)
$q1 = Call 'GET' '/api/admin/incidentes?orden=asc&limit=50' $null $tokG
$ids = $q1.data.data | ForEach-Object { $_.id }
$out += "COLA total=$($q1.data.total) primero=$($ids[0]) nuevo=$newId ordenAscOk=$($ids[0] -lt $newId)"
$q2 = Call 'GET' '/api/admin/incidentes' $null $tokA
$out += "COLA_VIAJERO code=$($q2.code) esperado=403"
$q3 = Call 'GET' '/api/admin/incidentes?estado=Abierto' $null $tokG
$out += "COLA_FILTRO estadoOk=$(($q3.data.data | Where-Object { $_.estado -ne 'Abierto' } | Measure-Object).Count -eq 0)"
# 8. agente responde -> viajero lee hilo
$p1 = Call 'POST' "/api/admin/incidentes/$newId/respuestas" @{ mensaje = 'Contactamos a la aerolínea, te reprograman mañana 08:00.' } $tokG
$out += "RESPONDE ok=$($p1.ok) code201=$($p1.ok)"
$h1 = Call 'GET' "/api/incidentes/$newId/respuestas" $null $tokA
$out += "HILO_VIAJERO n=$(@($h1.data.data).Count) esperado>=1"
# 9. PUT prioridad+estado; inválido 400; viajero PUT 403
$u1 = Call 'PUT' "/api/admin/incidentes/$newId" @{ prioridad = 'Critica'; estado = 'Resuelto' } $tokG
$out += "PUT ok=$($u1.ok) prio=$($u1.data.data.prioridad) estado=$($u1.data.data.estado)"
$u2 = Call 'PUT' "/api/admin/incidentes/$newId" @{ prioridad = 'Extrema' } $tokG
$out += "PUT_MAL code=$($u2.code) esperado=400"
$u3 = Call 'PUT' "/api/admin/incidentes/$newId" @{ prioridad = 'Baja' } $tokA
$out += "PUT_VIAJERO code=$($u3.code) esperado=403"
# 10. sin token -> 401
$s1 = Call 'GET' '/api/itinerario'
$out += "SINTOKEN code=$($s1.code) esperado=401"
$out | ForEach-Object { $_ }
