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
    $resp = $_.Exception.Response
    $code = [int]$resp.StatusCode
    $txt = ''
    try {
      $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
      $txt = $sr.ReadToEnd()
    } catch { }
    return @{ ok = $false; code = $code; body = $txt }
  }
}
$out = @()
$rand = Get-Random -Minimum 1000 -Maximum 9999
$email = "test$rand@test.com"
# 1. register OK
$r1 = Call 'POST' '/api/register' @{ nombre = 'Test Viajero'; email = $email; password = 'Clave1234' }
$out += "REGISTER ok=$($r1.ok) rol=$($r1.data.user.rol) id=$($r1.data.user.id)"
$tok = $r1.data.token
# 2. register duplicado -> 409
$r2 = Call 'POST' '/api/register' @{ nombre = 'Otro'; email = $email; password = 'Clave1234' }
$out += "DUP ok=$($r2.ok) code=$($r2.code) esperado=409"
# 3. password corta -> 400
$r3 = Call 'POST' '/api/register' @{ nombre = 'X'; email = "corto$rand@test.com"; password = '123' }
$out += "SHORT ok=$($r3.ok) code=$($r3.code) esperado=400"
# 4. login agente seed OK
$r4 = Call 'POST' '/api/login' @{ email = 'agente@despegar.com'; password = 'Agente123' }
$out += "LOGIN_AGENTE ok=$($r4.ok) rol=$($r4.data.user.rol)"
$tokAg = $r4.data.token
# 5. login mal -> 401
$r5 = Call 'POST' '/api/login' @{ email = 'agente@despegar.com'; password = 'mala' }
$out += "LOGIN_MAL ok=$($r5.ok) code=$($r5.code) esperado=401"
# 6. SQLi -> 401 seguro (no bypass)
$r6 = Call 'POST' '/api/login' @{ email = "' OR '1'='1"; password = 'x' }
$out += "SQLI ok=$($r6.ok) code=$($r6.code) esperado=400o401"
# 7. me con token viajero OK
$r7 = Call 'GET' '/api/me' $null $tok
$out += "ME ok=$($r7.ok) email=$($r7.data.user.email)"
# 8. me sin token -> 401
$r8 = Call 'GET' '/api/me'
$out += "ME_SINTOKEN ok=$($r8.ok) code=$($r8.code) esperado=401"
# 9. me token manipulado -> 401
$r9 = Call 'GET' '/api/me' $null ($tok + 'x')
$out += "ME_TAMPER ok=$($r9.ok) code=$($r9.code) esperado=401"
# 10. hash nunca expuesto
$hasHash = ($r1.data | ConvertTo-Json).Contains('password_hash')
$out += "LEAK_HASH=$hasHash esperado=False"
$out | ForEach-Object { $_ }
