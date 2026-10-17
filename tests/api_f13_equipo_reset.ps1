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
$ag = (Call 'POST' '/api/login' @{ email = 'agente@despegar.com'; password = 'Agente123' }).data; $tokG = $ag.token
$rand = Get-Random -Minimum 10000 -Maximum 99999
# Reset: email inexistente no enumera (siempre 200)
$no = Call 'POST' '/api/password/solicitar' @{ email = "nadie_$rand@test.com" }
$out += Check 'reset fantasma 200' ($no.ok)
$reg = Call 'POST' '/api/register' @{ nombre = 'Reset'; email = "reset_$rand@test.com"; password = 'Clave1234' }
$tokV = $reg.data.token
$sol = Call 'POST' '/api/password/solicitar' @{ email = "reset_$rand@test.com" }
$tok = $sol.data.data.token
$out += Check 'reset solicita' ($sol.ok)
if ($tok) {
  $re = Call 'POST' '/api/password/restablecer' @{ token = $tok; password = 'Nueva1234' }
  $out += Check 'reset restablece' ($re.ok)
  $re2 = Call 'POST' '/api/password/restablecer' @{ token = $tok; password = 'Otra12345' }
  $out += Check 'reset un solo uso' ($re2.code -eq 400)
  $lv = Call 'POST' '/api/login' @{ email = "reset_$rand@test.com"; password = 'Clave1234' }
  $out += Check 'clave vieja 401' ($lv.code -eq 401)
  $ln = Call 'POST' '/api/login' @{ email = "reset_$rand@test.com"; password = 'Nueva1234' }
  $out += Check 'clave nueva ok' ($ln.ok)
} else {
  $out += 'SKIP reset (prod sin token dev)'
}
# Equipo: alta + desactivar + reactivar
$al = Call 'POST' '/api/admin/agentes' @{ nombre = 'Agente Nuevo'; email = "nuevo_$rand@test.com"; password = 'Clave1234' } $tokG
$out += Check 'alta agente 201' ($al.ok)
$newId = $al.data.data.id
$dup = Call 'POST' '/api/admin/agentes' @{ nombre = 'Otro'; email = "nuevo_$rand@test.com"; password = 'Clave1234' } $tokG
$out += Check 'alta duplicada 409' ($dup.code -eq 409)
$via = Call 'POST' '/api/admin/agentes' @{ nombre = 'X'; email = "x_$rand@test.com"; password = 'Clave1234' } $tokV
$out += Check 'alta viajero 403' ($via.code -eq 403)
$off = Call 'PUT' "/api/admin/agentes/$newId/estado" @{ activo = $false } $tokG
$out += Check 'desactivar' ($off.ok)
$li = Call 'POST' '/api/login' @{ email = "nuevo_$rand@test.com"; password = 'Clave1234' }
$out += Check 'login desactivado 401' ($li.code -eq 401)
$self = Call 'PUT' "/api/admin/agentes/$($ag.user.id)/estado" @{ activo = $false } $tokG
$out += Check 'auto-desactivar 400' ($self.code -eq 400)
$on = Call 'PUT' "/api/admin/agentes/$newId/estado" @{ activo = $true } $tokG
$out += Check 'reactivar' ($on.ok)
$li2 = Call 'POST' '/api/login' @{ email = "nuevo_$rand@test.com"; password = 'Clave1234' }
$out += Check 'login reactivado' ($li2.ok)
$ls = Call 'GET' '/api/admin/agentes' $null $tokG
$out += Check 'lista con activo' ($ls.ok -and $null -ne @($ls.data.data)[0].PSObject.Properties['activo'])
$out | ForEach-Object { $_ }
