$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskConfig = Join-Path $taskRoot '.env.core25-worker.local'
$taskRuntime = Join-Path $taskRoot '.tmp/core25-pc-runtime'
$taskScript = Join-Path $PSScriptRoot 'core25-pc-worker.cjs'
if (-not (Test-Path -LiteralPath $taskConfig)) { throw 'Missing .env.core25-worker.local. Complete deployment configuration first.' }
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
$taskPidFile = Join-Path $taskRuntime 'worker.pid'
if (Test-Path -LiteralPath $taskPidFile) {
  $taskPreviousId = [int](Get-Content -LiteralPath $taskPidFile)
  $taskPrevious = Get-CimInstance Win32_Process -Filter "ProcessId=$taskPreviousId" -ErrorAction SilentlyContinue
  if ($taskPrevious -and $taskPrevious.CommandLine.Contains($taskScript)) { Write-Output 'Core25 worker is already running.'; exit 0 }
}
$taskNode = (Get-Command node.exe).Source
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @('"--env-file=' + $taskConfig + '"', '"' + $taskScript + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'worker.log') -RedirectStandardError (Join-Path $taskRuntime 'worker-error.log')
Set-Content -LiteralPath $taskPidFile -Value $taskProcess.Id
Write-Output "Core25 worker started (PID $($taskProcess.Id)). Status: $taskRuntime\worker.log"
