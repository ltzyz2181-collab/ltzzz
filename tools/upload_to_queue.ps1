# 本地视频通过已认证 Worker 入队；不调用 wrangler，不需要 R2:Edit。
# 凭证由已有安全环境提供 LTZZZ_AGENT_TOKEN；不要把 Key 写进命令或回执。
param(
  [Parameter(Mandatory=$true)][string]$Video,
  [string]$Meta = "",
  [string]$Title = "",
  [string]$Description = "",
  [string]$Name = ""
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Video -PathType Leaf)) { throw 'video_file_missing' }
if (-not $env:LTZZZ_AGENT_TOKEN) { throw 'LTZZZ_AGENT_TOKEN_missing: 使用既有安全环境配置；不要贴到聊天' }
$generated = $false
if (-not $Meta) {
  $Meta = Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Video))) (([IO.Path]::GetFileNameWithoutExtension($Video)) + '.meta.json')
  if (-not (Test-Path -LiteralPath $Meta)) {
    if (-not $Title) { throw 'metadata_or_title_required' }
    $Meta = Join-Path ([IO.Path]::GetTempPath()) (([guid]::NewGuid().ToString()) + '.meta.json')
    $payload = @{title=$Title;description=$Description;created=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($Meta, $payload, (New-Object Text.UTF8Encoding $false))
    $generated = $true
  }
}
try {
  $entry = Join-Path $PSScriptRoot '../scripts/queue-video-only.mjs'
  $queueArguments = @($entry, '--video', [IO.Path]::GetFullPath($Video), '--meta', [IO.Path]::GetFullPath($Meta))
  if ($Name) { $queueArguments += @('--name', $Name) }
  & node @queueArguments
  if ($LASTEXITCODE -ne 0) { throw 'queue_not_verified: 查看结构化回执，不要直接换名重传' }
  Write-Output '入队和哈希回读成功；公开发布仍需平台回执。'
} finally {
  if ($generated) { Remove-Item -LiteralPath $Meta -Force }
}
