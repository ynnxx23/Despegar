$base = 'http://127.0.0.1:8000'
function Call($method, $path, $body = $null, $token = $null, $extra = $null) {
  $h = @{ 'Content-Type' = 'application/json' }
  if ($token) { $h['Authorization'] = "Bearer $token" }
  if ($extra) { foreach ($k in $extra.Keys) { $h[$k] = $extra[$k] } }
  $opt = @{ Uri = "$base$path"; Method = $method; Headers = $h; ErrorAction = 'Stop' }
  if ($body) { $opt['Body'] = ($body | ConvertTo-Json -Depth 5) }
  try {
    $r = Invoke-RestMethod @opt
    return @{ ok = $true; data = $r }
  } catch {
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch { }
    return @{ ok = $false; code = $code }
  }
}
function Login($email, $pass) { return (Call 'POST' '/api/login' @{ email = $email; password = $pass }).data }
$out = @()
$h = Call 'GET' '/api/health'
$out += "HEALTH ok=$($h.ok) db=$($h.data.db)"
$ag = Login 'agente@despegar.com' 'Agente123'; $tokG = $ag.token
$rand = Get-Random -Minimum 10000 -Maximum 99999
$reg = Call 'POST' '/api/register' @{ nombre = 'Fases'; email = "fases_$rand@test.com"; password = 'Clave1234' }
$tokV = $reg.data.token
# Idempotencia: mismo key -> mismo id
$key = "test-$rand-abcdef"
$c1 = Call 'POST' '/api/incidentes' @{ tipo = 'Otro'; titulo = 'Prueba idempotencia fase 9'; descripcion = 'Descripcion larga para probar idempotencia del sistema.'; idempotencia_key = $key } $tokV
$c2 = Call 'POST' '/api/incidentes' @{ tipo = 'Otro'; titulo = 'Prueba idempotencia fase 9'; descripcion = 'Descripcion larga para probar idempotencia del sistema.'; idempotencia_key = $key } $tokV
$out += "IDEM id1=$($c1.data.data.id) id2=$($c2.data.data.id) igual=$($c1.data.data.id -eq $c2.data.data.id)"
$id = $c1.data.data.id
# Réplica viajero
$rv = Call 'POST' "/api/incidentes/$id/respuestas" @{ mensaje = 'Agrego info desde app viajero' } $tokV
$out += "REPLICA_VIAJERO ok=$($rv.ok) code=$($rv.code)"
# Triage + responder agente (pública e interna)
$tr = Call 'PUT' "/api/admin/incidentes/$id" @{ prioridad = 'Alta' } $tokG
$out += "TRIAGE ok=$($tr.ok) sla=$($null -ne $tr.data.data.sla_vence_at)"
$ra = Call 'POST' "/api/admin/incidentes/$id/respuestas" @{ mensaje = 'Respuesta publica agente' } $tokG
$ri = Call 'POST' "/api/admin/incidentes/$id/respuestas" @{ mensaje = 'Nota interna solo equipo'; interna = $true } $tokG
$out += "RESP_PUB ok=$($ra.ok) RESP_INT ok=$($ri.ok)"
$hv = Call 'GET' "/api/incidentes/$id/respuestas" $null $tokV
$ha = Call 'GET' "/api/admin/incidentes/$id/respuestas" $null $tokG
$out += "HILO viajero_n=$((@($hv.data.data)).Count) agente_n=$((@($ha.data.data)).Count) viajero_menos=$(((@($hv.data.data)).Count) -lt ((@($ha.data.data)).Count))"
# Transición inválida: Resuelto -> Abierto directo debe fallar si se cierra primero
$rs = Call 'PUT' "/api/admin/incidentes/$id" @{ estado = 'Resuelto' } $tokG
$bad = Call 'PUT' "/api/admin/incidentes/$id" @{ estado = 'Abierto' } $tokG
$out += "RESUELTO ok=$($rs.ok) VOLVER_ABIERTO code=$($bad.code) esperado=400"
# Reabrir viajero
$re = Call 'POST' "/api/incidentes/$id/reabrir" $null $tokV
$out += "REABRIR ok=$($re.ok)"
# Bulk + merge + métricas + openapi + búsqueda
$cB = Call 'POST' '/api/incidentes' @{ tipo = 'Otro'; titulo = 'Bulk caso dos para test'; descripcion = 'Descripcion larga para bulk test dos.' } $tokV
$bk = Call 'POST' '/api/admin/incidentes/bulk' @{ ids = @($id, $cB.data.data.id); accion = 'priorizar'; prioridad = 'Baja' } $tokG
$out += "BULK ok=$($bk.ok) n=$($bk.data.data.ok)"
$mg = Call 'POST' "/api/admin/incidentes/$($cB.data.data.id)/merge" @{ duplicado_de = $id } $tokG
$out += "MERGE ok=$($mg.ok) estado=$($mg.data.data.estado)"
$mt = Call 'GET' '/api/admin/metricas' $null $tokG
$out += "METRICAS ok=$($mt.ok) vencidos=$($mt.data.data.vencidos)"
$oa = Call 'GET' '/api/openapi.json'
$out += "OPENAPI ok=$($oa.ok)"
$qb = Call 'GET' '/api/admin/incidentes?q=idempotencia&limit=5' $null $tokG
$out += "BUSQUEDA ok=$($qb.ok) total=$($qb.data.total)"
$adj = Call 'POST' "/api/incidentes/$id/adjuntos" @{ nombre = 'test.txt'; mime = 'text/plain'; data_base64 = 'aG9sYQ==' } $tokV
$out += "ADJUNTO_MIME_MAL code=$($adj.code) esperado=400"
$out | ForEach-Object { $_ }
