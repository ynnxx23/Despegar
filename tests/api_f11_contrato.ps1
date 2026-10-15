$base = 'http://127.0.0.1:8000'
function Call($method, $path, $body = $null, $token = $null) {
  $h = @{ 'Content-Type' = 'application/json' }
  if ($token) { $h['Authorization'] = "Bearer $token" }
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
function Check($nombre, $cond) { if ($cond) { "OK $nombre" } else { "FAIL $nombre" } }
$out = @()
$h = Call 'GET' '/api/health'
$out += Check 'health {ok,service,db}' ($h.ok -and $null -ne $h.data.ok -and $null -ne $h.data.db)
$ag = (Call 'POST' '/api/login' @{ email = 'agente@despegar.com'; password = 'Agente123' }).data; $tokG = $ag.token
$rand = Get-Random -Minimum 10000 -Maximum 99999
$reg = Call 'POST' '/api/register' @{ nombre = 'Contrato'; email = "contrato_$rand@test.com"; password = 'Clave1234' }
$tokV = $reg.data.token
$out += Check 'register {user,token}' ($reg.ok -and $null -ne $reg.data.user.id -and $null -ne $reg.data.token)
$me = Call 'GET' '/api/me' $null $tokV
$out += Check 'me {user}' ($me.ok -and $null -ne $me.data.user.email)
$it = Call 'GET' '/api/itinerario' $null $tokV
$out += Check 'itinerario {data[]}' ($it.ok -and $null -ne $it.data.data)
$mi = Call 'GET' '/api/incidentes/mios?limit=5' $null $tokV
$out += Check 'mios {data,total,page,limit}' ($mi.ok -and $null -ne $mi.data.total -and $null -ne $mi.data.page)
$c = Call 'POST' '/api/incidentes' @{ tipo = 'Otro'; titulo = 'Contrato de formas api'; descripcion = 'Descripcion larga para validar contrato de la api.' } $tokV
$id = $c.data.data.id
$out += Check 'crear {data.id,estado}' ($c.ok -and $id -gt 0 -and $null -ne $c.data.data.estado)
$out += Check 'viajero sin prioridad' ($null -eq $c.data.data.PSObject.Properties['prioridad'])
$d = Call 'GET' "/api/incidentes/$id" $null $tokV
$out += Check 'detalle {atendido_por,historial}' ($d.ok -and $null -ne $d.data.data.historial)
$cola = Call 'GET' '/api/admin/incidentes?limit=5' $null $tokG
$out += Check 'cola {data,total,page,limit}' ($cola.ok -and $null -ne $cola.data.total)
$res = Call 'GET' '/api/admin/incidentes/resumen' $null $tokG
$out += Check 'resumen {data,sin_triar,vencidos,mios}' ($res.ok -and $null -ne $res.data.sin_triar)
$mt = Call 'GET' '/api/admin/metricas' $null $tokG
$out += Check 'metricas {por_estado,mttr_horas}' ($mt.ok -and $null -ne $mt.data.data.por_estado)
$oa = Call 'GET' '/api/openapi.json'
$out += Check 'openapi version 1.4.0' ($oa.ok -and $oa.data.info.version -eq '1.4.0')
$err = Call 'GET' '/api/incidentes/99999999' $null $tokV
$out += Check '404 {error.code,request_id}' ($err.code -eq 404)
$out | ForEach-Object { $_ }
