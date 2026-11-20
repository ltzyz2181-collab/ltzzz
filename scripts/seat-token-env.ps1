<#
.SYNOPSIS
  LTZZZ seat token injection (Windows PowerShell 5.1 / pwsh).
.DESCRIPTION
  Resolves a GitHub token and injects GH_TOKEN / GITHUB_TOKEN into one child command.
  The value is never printed and never written to disk; the caller environment is
  restored after the child exits.

  Pass the command line as one quoted string so that flags such as -e or --queue
  are not mistaken for parameters of this script.
.EXAMPLE
  powershell -NoProfile -File scripts/seat-token-env.ps1 -Check
.EXAMPLE
  powershell -NoProfile -File scripts/seat-token-env.ps1 -Exec "node scripts/task-hub.mjs --queue"
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [string]$Exec,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Ignored
)

$ErrorActionPreference = 'Stop'

function Show-Usage {
  Write-Output 'seat-token-env: inject GH_TOKEN/GITHUB_TOKEN into one child process only.'
  Write-Output ''
  Write-Output '  -Check'
  Write-Output '      Print has_token/source without the token value.'
  Write-Output ''
  Write-Output '  -Exec "<command line>"'
  Write-Output '      Run the command with GH_TOKEN and GITHUB_TOKEN set.'
  Write-Output '      Nothing is printed or persisted; the caller environment is restored.'
  Write-Output ''
  Write-Output 'Resolution order: GH_TOKEN, GITHUB_TOKEN, git credential fill (host=github.com).'
  Write-Output 'Exit codes: 0 ok, 2 usage, 3 token_missing.'
}

function Resolve-SeatToken {
  if ($env:GH_TOKEN) { return [pscustomobject]@{ Token = $env:GH_TOKEN; Source = 'env:GH_TOKEN' } }
  if ($env:GITHUB_TOKEN) { return [pscustomobject]@{ Token = $env:GITHUB_TOKEN; Source = 'env:GITHUB_TOKEN' } }
  $previousPrompt = $env:GIT_TERMINAL_PROMPT
  $env:GIT_TERMINAL_PROMPT = '0'
  try {
    $out = @("protocol=https`nhost=github.com`n`n" | & git credential fill 2>$null)
  } catch {
    $out = @()
  } finally {
    if ($null -eq $previousPrompt) {
      Remove-Item Env:\GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue
    } else {
      $env:GIT_TERMINAL_PROMPT = $previousPrompt
    }
  }
  $line = $out | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
  if (-not $line) { return $null }
  return [pscustomobject]@{ Token = $line.Substring(9).Trim(); Source = 'git_credential_fill' }
}

if ($Check) {
  $token = Resolve-SeatToken
  if ($token) {
    Write-Output ('{"has_token":true,"source":"' + $token.Source + '"}')
    exit 0
  }
  Write-Output '{"has_token":false,"source":"none"}'
  exit 3
}

if (-not $Exec) { Show-Usage; exit 2 }

$token = Resolve-SeatToken
if (-not $token) {
  [Console]::Error.WriteLine('{"error":"token_missing","source":"none"}')
  exit 3
}

$oldGh = $env:GH_TOKEN
$oldGithub = $env:GITHUB_TOKEN
$code = 1
try {
  $env:GH_TOKEN = $token.Token
  $env:GITHUB_TOKEN = $token.Token
  & ([scriptblock]::Create($Exec))
  if ($null -eq $LASTEXITCODE) { $code = 0 } else { $code = $LASTEXITCODE }
} finally {
  if ($null -eq $oldGh) {
    Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:GH_TOKEN = $oldGh
  }
  if ($null -eq $oldGithub) {
    Remove-Item Env:\GITHUB_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:GITHUB_TOKEN = $oldGithub
  }
}
exit $code
