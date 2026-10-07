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
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch { }
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
$ag = Login 'agente@despegar.com' 'Agente123'; $tokG = $ag.token; $agId = $ag.user.id
$rand = Get-Random -Minimum 10000 -Maximum 99999
# Segundo agente: maria seed; fallback registra+promueve via psql (si disponible)
$tokG2 = $null; $ag2Id = $null
$m2 = Login 'maria@despegar.com' 'Agente456'
if ($m2 -and $m2.token) { $tokG2 = $m2.token; $ag2Id = $m2.user.id }
if (-not $tokG2) {
try {
  $r2 = Call 'POST' '/api/register' @{ nombre = 'Agente Dos'; email = "agente2_$rand@test.com"; password = 'Clave1234' }
  if ($r2.ok) {
    $ag2Id = $r2.data.user.id
    $env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else {
      (Select-String -Path (Join-Path $PSScriptRoot '..\backend\.env') -Pattern '^DB_PASS=(.*)$' -ErrorAction SilentlyContinue).Matches.Groups[1].Value
    }
    & psql -h 127.0.0.1 -U despegar -d despegar -c "UPDATE usuarios SET rol='agente' WHERE id=$ag2Id" 2>$null | Out-Null
    $l2 = Login "agente2_$rand@test.com" 'Clave1234'
    if ($l2 -and $l2.token) { $tokG2 = $l2.token }
  }
} catch { }
}
# Viajero fresco para casos aislados
$reg = Call 'POST' '/api/register' @{ nombre = 'Gestion'; email = "gestion_$rand@test.com"; password = 'Clave1234' }
$tokV = $reg.data.token
# 1. crear Fraude + keyword urgente -> sugerida Critica (base Critica, bump queda Critica)
$c1 = Call 'POST' '/api/incidentes' @{ tipo = 'Fraude'; titulo = 'Cobro urgente estafa en tarjeta'; descripcion = 'Me cobraron de mas, es urgente y creo que es una estafa bancaria grave.' } $tokV
$sug1 = $c1.data.data.prioridad_sugerida
$mot1 = $c1.data.data.prioridad_motivo
$out += "SUG_FRAUDE sug=$sug1 esperado=Critica motivo_ok=$($mot1 -like 'Sugerida por tipo Fraude*')"
$id1 = $c1.data.data.id
# 2. crear Otro sin keyword -> Baja
$c2 = Call 'POST' '/api/incidentes' @{ tipo = 'Otro'; titulo = 'Consulta general sobre reserva'; descripcion = 'Quisiera saber si puedo cambiar la fecha de mi proxima reserva.' } $tokV
$out += "SUG_OTRO sug=$($c2.data.data.prioridad_sugerida) esperado=Baja"
$id2 = $c2.data.data.id
# 2b. crear Vuelo_retrasado + keyword hospital -> bump Baja->Alta
$c3 = Call 'POST' '/api/incidentes' @{ tipo = 'Vuelo_retrasado'; titulo = 'Retraso y salud en riesgo'; descripcion = 'El vuelo se retraso hoy y necesito llegar al hospital por salud.' } $tokV
$out += "SUG_BUMP sug=$($c3.data.data.prioridad_sugerida) esperado=Alta motivo_ok=$($c3.data.data.prioridad_motivo -like '*palabras:*')"
$id3 = $c3.data.data.id
# 3. claim -> 200 + atendido visible viajero
$k1 = Call 'POST' "/api/admin/incidentes/$id1/claim" $null $tokG
$out += "CLAIM ok=$($k1.ok) asignado_a=$($k1.data.data.asignado_a) esperado=$agId"
$v1 = Call 'GET' "/api/incidentes/$id1" $null $tokV
$out += "ATENDIDO nombre=$($v1.data.data.atendido_por) esperado_no_vacio=$($null -ne $v1.data.data.atendido_por -and $v1.data.data.atendido_por -ne '')"
$out += "SINPRIO tiene_prioridad=$($null -ne $v1.data.data.PSObject.Properties['prioridad']) esperado=False"
# 4. claim otro agente -> 409 (o SKIP si no hay segundo agente)
if ($tokG2) {
  $k2 = Call 'POST' "/api/admin/incidentes/$id1/claim" $null $tokG2
  $out += "CLAIM_OTRO code=$($k2.code) esperado=409"
  $destino = $ag2Id
} else {
  $out += "CLAIM_OTRO SKIP (sin segundo agente: crear via psql UPDATE usuarios SET rol='agente')"
  $destino = $agId
}
# 5. derivar -> cambia asignado (solo si hay destino distinto al actual)
if ($tokG2) {
  $dv = Call 'POST' "/api/admin/incidentes/$id1/derivar" @{ agente_id = $destino; motivo = 'Turno noche' } $tokG
  $out += "DERIVAR ok=$($dv.ok) asignado_a=$($dv.data.data.asignado_a) esperado=$destino"
  $dv2 = Call 'POST' "/api/admin/incidentes/$id1/derivar" @{ agente_id = $destino } $tokG
  $out += "DERIVAR_MISMO code=$($dv2.code) esperado=400"
  $dv3 = Call 'POST' "/api/admin/incidentes/$id1/derivar" @{ agente_id = 999999 } $tokG
  $out += "DERIVAR_404 code=$($dv3.code) esperado=404"
} else {
  $out += "DERIVAR SKIP (sin segundo agente)"
}
# 6. seguir -> aparece en mi-cola
$s1 = Call 'POST' "/api/admin/incidentes/$id2/seguir" $null $tokG
$cola = Call 'GET' '/api/admin/mi-cola?orden=urgencia&limit=50' $null $tokG
$veSeguido = (($cola.data.data | Where-Object { $_.id -eq $id2 } | Measure-Object).Count -eq 1)
$out += "SEGUIR ok=$($s1.ok) en_micola=$veSeguido esperado=True"
# 7. release (sobre id1, lo libera aunque este derivado)
$rl = Call 'POST' "/api/admin/incidentes/$id1/release" $null $tokG
$out += "RELEASE ok=$($rl.ok) asignado_nulo=$($null -eq $rl.data.data.asignado_a) esperado=True"
# 8. historial contiene eventos (creado, claim, derivar/seguir, release)
$h = Call 'GET' "/api/admin/incidentes/$id1/historial" $null $tokG
$acc = @($h.data.data | ForEach-Object { $_.accion })
$out += "HIST acciones=$($acc -join ',')"
$out += "HIST_tiene_claim=$($acc -contains 'claim') release=$($acc -contains 'release') creado=$($acc -contains 'creado')"
# 9. Resuelto sin prioridad -> 400 (id2 sigue sin triar)
$rs = Call 'PUT' "/api/admin/incidentes/$id2" @{ estado = 'Resuelto' } $tokG
$out += "RESUELTO_SINTRIAR code=$($rs.code) esperado=400"
# 10. triage fija SLA + orden urgencia aceptado + resumen extendido
$tr = Call 'PUT' "/api/admin/incidentes/$id2" @{ prioridad = 'Alta' } $tokG
$out += "TRIAGE ok=$($tr.ok) sla=$($null -ne $tr.data.data.sla_vence_at) esperado=True"
$qU = Call 'GET' '/api/admin/mi-cola?orden=urgencia&limit=50' $null $tokG
$out += "ORDEN_URGENCIA ok=$($qU.ok)"
$re = Call 'GET' '/api/admin/incidentes/resumen' $null $tokG
$out += "RESUMEN sin_triar=$($re.data.sin_triar) vencidos=$($re.data.vencidos) mios=$($re.data.mios)"
$agentes = Call 'GET' '/api/admin/agentes' $null $tokG
$out += "AGENTES n=$(@($agentes.data.data).Count) esperado>=1"
$ds = Call 'DELETE' "/api/admin/incidentes/$id2/seguir" $null $tokG
$out += "DEJAR_SEGUIR ok=$($ds.ok)"
$out | ForEach-Object { $_ }
