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
function Login($email, $pass) { return (Call 'POST' '/api/login' @{ email = $email; password = $pass }).data }
$out = @()
$ag = Login 'agente@despegar.com' 'Agente123'; $tokG = $ag.token
$rand = Get-Random -Minimum 10000 -Maximum 99999
$reg = Call 'POST' '/api/register' @{ nombre = 'FaseCuatro'; email = "fase4_$rand@test.com"; password = 'Clave1234' }
$tokV = $reg.data.token
$c = Call 'POST' '/api/incidentes' @{ tipo = 'Vuelo_cancelado'; titulo = 'Vuelo cancelado urgente varado hoy'; descripcion = 'Estoy varada en el aeropuerto, necesito salir hoy urgente.' } $tokV
$id = $c.data.data.id
$ia = Call 'GET' "/api/admin/incidentes/$id/ia" $null $tokG
$out += "IA ok=$($ia.ok) score=$($ia.data.data.ia_score) nivel=$($ia.data.data.ia_nivel)"
$cp = Call 'POST' "/api/admin/incidentes/$id/copiloto" @{ tono = 'cercano' } $tokG
$out += "COPILOTO ok=$($cp.ok) tiene_texto=$($null -ne $cp.data.data.texto)"
$rs = Call 'GET' "/api/incidentes/$id/resumen" $null $tokV
$out += "RESUMEN ok=$($rs.ok) n=$($rs.data.data.n)"
$rsEn = Call 'GET' "/api/incidentes/$id/resumen?lang=en" $null $tokV
$out += "RESUMEN_EN ok=$($rsEn.ok) lang=$($rsEn.data.data.lang)"
$ra = Call 'POST' "/api/admin/incidentes/$id/respuestas" @{ mensaje = 'Te reprogramamos manana.' } $tokG
$nv = Call 'GET' '/api/notificaciones/no-leidas' $null $tokV
$out += "NOTIF_VIAJERO no_leidas=$($nv.data.data.no_leidas) esperado>=1"
$nt = Call 'GET' '/api/notificaciones' $null $tokV
$firstId = @($nt.data.data)[0].id
$lr = Call 'POST' "/api/notificaciones/$firstId/leer" $null $tokV
$out += "NOTIF_LEER ok=$($lr.ok)"
$bot = Call 'POST' '/api/chatbot/borrador' @{ texto = 'me cancelaron el vuelo AR1234 hoy' } $tokV
$out += "CHATBOT tipo=$($bot.data.data.tipo_sugerido) codigo=$($bot.data.data.codigo_detectado)"
$stt = Call 'POST' '/api/stt/transcribir' @{ audio_base64 = 'AAAA' } $tokV
$out += "STT ok=$($stt.ok) nota=$($null -ne $stt.data.data.nota)"
$ri = Call 'GET' '/api/admin/sla/riesgo' $null $tokG
$out += "RIESGO ok=$($ri.ok)"
$csv = Call 'GET' '/api/admin/metricas.csv' $null $tokG
$out += "CSV ok=$($csv.ok)"
$au = Call 'GET' "/api/admin/incidentes/$id/auditoria" $null $tokG
$out += "AUDITORIA ok=$($au.data.data.ok)"
$ad = Call 'POST' "/api/incidentes/$id/adjuntos" @{ nombre = 'AR1234-boarding.pdf'; mime = 'application/pdf'; data_base64 = 'aG9sYQ==' } $tokV
$out += "ADJUNTO ok=$($ad.ok) id=$($ad.data.data.id)"
if ($ad.ok) {
  $oc = Call 'POST' "/api/incidentes/$id/adjuntos/$($ad.data.data.id)/ocr" $null $tokV
  $out += "OCR ok=$($oc.ok) texto=$($oc.data.data.ocr)"
}
$qq = Call 'GET' '/api/admin/incidentes?q=urgente&limit=5' $null $tokG
$out += "BUSQUEDA_COLA ok=$($qq.ok) total=$($qq.data.total)"
$oa = Call 'GET' '/api/openapi.json'
$out += "OPENAPI ok=$($oa.ok)"
$out | ForEach-Object { $_ }
