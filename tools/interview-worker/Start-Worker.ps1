param(
  [string]$Python = "",
  [ValidateSet("ui", "doctor", "set-token", "status", "bundle-hash", "once", "run")]
  [string]$Command = "ui"
)
$ErrorActionPreference = "Stop"
if (-not $Python) {
  $bundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  $Python = if (Test-Path -LiteralPath $bundledPython) { $bundledPython } else { "python" }
}
$scriptPath = Join-Path $PSScriptRoot "worker.py"
$configPath = Join-Path $PSScriptRoot "config.json"
if ($Command -ne "bundle-hash" -and -not (Test-Path -LiteralPath $configPath)) {
  throw "config.example.json을 config.json으로 복사하고 개발문서에 따라 설정하세요."
}
& $Python $scriptPath --config $configPath $Command
exit $LASTEXITCODE
