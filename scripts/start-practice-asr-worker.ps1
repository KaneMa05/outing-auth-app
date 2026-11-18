param([string]$EnvFile, [switch]$Once, [string]$ImportFile)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) { $EnvFile = Join-Path $projectDirectory '.env.local' }
$resolvedEnv = (Resolve-Path -LiteralPath $EnvFile).Path
$runtimeDirectory = Join-Path $projectDirectory '.tmp/practice-asr'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$workerScript = Join-Path $PSScriptRoot 'interview-practice-asr-worker.cjs'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$workerArguments = @('"--env-file=' + $resolvedEnv + '"', '"' + $workerScript + '"')
if ($Once) { $workerArguments += '--once' }
if ($ImportFile) { $workerArguments += @('--import', '"' + (Resolve-Path -LiteralPath $ImportFile).Path + '"') }
$workerProcess = Start-Process -FilePath $nodePath -ArgumentList $workerArguments -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'worker.log') -RedirectStandardError (Join-Path $runtimeDirectory 'worker-error.log') -PassThru
Write-Output ('Practice transcription worker started. PID: ' + $workerProcess.Id)
