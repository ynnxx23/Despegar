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
$rand = Get-Random -Minimum 10000 -Maximum 99999
$reg = Call 'POST' '/api/register' @{ nombre = 'Sesion'; email = "sesion_$rand@test.com"; password = 'Clave1234' }
$tokV = $reg.data.token
$ref1 = $reg.data.refresh_token
$out += Check 'register trae refresh' ($reg.ok -and $null -ne $ref1)
$me = Call 'GET' '/api/me' $null $tokV
$out += Check 'me verificado flag' ($me.ok -and $null -ne $me.data.user.PSObject.Properties['email_verificado'])
$sol = Call 'POST' '/api/email/solicitar' $null $tokV
$out += Check 'email solicitar' ($sol.ok)
$tokEmail = $sol.data.data.token
if ($tokEmail) {
  $ve = Call 'POST' '/api/email/verificar' @{ token = $tokEmail } $tokV
  $out += Check 'email verificar' ($ve.ok -and $ve.data.data.email_verificado -eq $true)
  $ve2 = Call 'POST' '/api/email/verificar' @{ token = $tokEmail } $tokV
  $out += Check 'email token un solo uso' ($ve2.code -eq 400)
} else {
  $out += 'SKIP email verificar (prod sin token dev)'
}
$r1 = Call 'POST' '/api/refresh' @{ refresh_token = $ref1 }
$out += Check 'refresh rota' ($r1.ok -and $null -ne $r1.data.token -and $null -ne $r1.data.refresh_token)
$r2 = Call 'POST' '/api/refresh' @{ refresh_token = $ref1 }
$out += Check 'refresh viejo revocado' ($r2.code -eq 401)
$newRef = $r1.data.refresh_token
$lo = Call 'POST' '/api/logout' @{ refresh_token = $newRef } $r1.data.token
$out += Check 'logout' ($lo.ok)
$r3 = Call 'POST' '/api/refresh' @{ refresh_token = $newRef }
$out += Check 'refresh tras logout 401' ($r3.code -eq 401)
$loT = Call 'POST' '/api/logout' @{ todos = $true } $r1.data.token
$out += Check 'logout todos' ($loT.ok)
$del = Call 'DELETE' '/api/me' $null $r1.data.token
$out += Check 'borrar cuenta' ($del.ok)
$me2 = Call 'GET' '/api/me' $null $r1.data.token
$out += Check 'token tras borrado 401' ($me2.code -eq 401)
$login2 = Call 'POST' '/api/login' @{ email = "sesion_$rand@test.com"; password = 'Clave1234' }
$out += Check 'login tras borrado 401' ($login2.code -eq 401)
$out | ForEach-Object { $_ }
