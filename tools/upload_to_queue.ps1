# LTZZZ 视频入队脚本：本地 mp4 → R2 queue/ → video-scheduler cron 自动公开发布
# 用法:  .\tools\upload_to_queue.ps1 -Video "C:\path\v.mp4" -Title "标题" -Description "描述" [-Name "unique-name"]
# 网络: 本操作走 CF 边缘（wrangler OAuth），与链上网络无关。
# 依赖: wrangler 已登录（wrangler whoami 通过）

param(
  [Parameter(Mandatory=$true)][string]$Video,
  [Parameter(Mandatory=$true)][string]$Title,
  [string]$Description = "",
  [string]$Name = ""
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Video)) { Write-Error "视频文件不存在: $Video"; exit 1 }
if (-not $Name) { $Name = [IO.Path]::GetFileNameWithoutExtension($Video) -replace '[^a-zA-Z0-9_-]', '-' }

$bucket = "ltzzz-videos"
$mp4Key   = "queue/$Name.mp4"
$metaKey  = "queue/$Name.meta.json"

Write-Output "==> 上传视频到 R2 $mp4Key"
wrangler r2 object put $bucket $mp4Key --file $Video
if ($LASTEXITCODE -ne 0) { Write-Error "视频上传失败"; exit 1 }

$meta = @{ title = $Title; description = $Description; created = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ') } | ConvertTo-Json -Compress
$metaFile = Join-Path $env:TEMP "queue-meta-$Name.json"
[IO.File]::WriteAllText($metaFile, $meta, (New-Object Text.UTF8Encoding $false))
Write-Output "==> 上传元数据到 R2 $metaKey"
wrangler r2 object put $bucket $metaKey --file $metaFile
if ($LASTEXITCODE -ne 0) { Write-Error "元数据上传失败"; exit 1 }
Remove-Item $metaFile -Force

Write-Output ""
Write-Output "✅ 已入队: queue/$Name.mp4 + queue/$Name.meta.json"
Write-Output "   发布方式: video-scheduler cron 每日 UTC 14:00 (CST 22:00) 自动扫 queue/ 公开发布"
Write-Output "   想立即发布: curl -X POST https://ltzzz-video-scheduler.ltzyz2181.workers.dev/schedule/publish (需 LTZZZ_AGENT_TOKEN)"
Write-Output "   发布结果: R2 logs/publish-*.json + YouTube Studio"
