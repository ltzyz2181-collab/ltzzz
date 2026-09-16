$ErrorActionPreference = 'Continue'
$base = 'https://ltzzz-pay-proxy.ltzyz2181.workers.dev'
$token = $env:PAY_TOKEN
$headers = @{ Authorization = "Bearer $token" }
$json = 'application/json'
$out = 'C:\Users\李天柱\ltzzz\tools\pay_smoke_report.txt'
"" | Set-Content $out -Encoding UTF8

function WriteLine($name, $content) {
  Add-Content -Path $out -Value ("`n===== $name =====`n" + $content) -Encoding UTF8
}
function Post($name, $path, $payload) {
  try {
    $r = Invoke-RestMethod -Uri "$base$path" -Method Post -Headers $headers -ContentType $json -Body $payload
    WriteLine $name ($r | ConvertTo-Json -Depth 6 -Compress)
  } catch {
    $resp = $_.Exception.Response
    $status = if ($resp) { [int]$resp.StatusCode } else { '?' }
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    WriteLine $name ("HTTP=$status`n" + $msg)
  }
}
function Get1($name, $path) {
  $r = Invoke-RestMethod -Uri "$base$path" -Method Get -Headers $headers
  WriteLine $name ($r | ConvertTo-Json -Depth 6 -Compress)
}

Post 'step0: resume stale global' '/pause' '{"scope":"global","action":"resume","reason":"清理冒烟测试残留"}'
Post 'step1: decision OK 19.9 api-service' '/decision' '{"request_id":"SMOKE-01","proposal":{"project":"LTZZZ","vendor":"AI视频生成服务","vendor_id":"veo","item":"API额度","category":"api-service","amount":19.9,"reason":"冒烟测试-验证第一批视频生产能力"}}'
Post 'step2: decision gambling (expect 403)' '/decision' '{"proposal":{"vendor":"x","category":"gambling","amount":10}}'
Post 'step3: decision overlimit 60 (expect 403)' '/decision' '{"proposal":{"vendor":"x","category":"cloud","amount":60}}'
Get1 'step4: balance' '/balance'
Post 'step5: pause global' '/pause' '{"scope":"global","action":"pause","reason":"冒烟测试暂停"}'
Post 'step6: decision after pause (expect 403)' '/decision' '{"proposal":{"vendor":"y","category":"api-service","amount":5}}'
Post 'step7: resume global' '/pause' '{"scope":"global","action":"resume","reason":"冒烟测试恢复"}'
Get1 'step8: /stop' '/stop'
Get1 'step9: /ledger?limit=5' '/ledger?limit=5'
Get1 'step10: /health' '/health'

Write-Output "done -> $out"

