param(
    [ValidateSet('prepare','generate')][string]$Action='generate',
    [ValidateSet('auto','cpu')][string]$Device='auto',
    [ValidateRange(1,3)][int]$Count=3,
    [ValidateSet('0.6B','1.7B')][string]$ModelSize='1.7B'
)
$ErrorActionPreference='Stop'
$voiceRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$voicePython=Join-Path $voiceRoot '.tmp/qwen-tts-local/venv/Scripts/python.exe'
if(-not(Test-Path -LiteralPath $voicePython)){throw 'Qwen isolated environment is missing.'}
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
$env:HF_HOME=Join-Path $voiceRoot '.tmp/qwen-tts-local/cache/huggingface'
$env:HF_HUB_DISABLE_XET='1'
$env:HF_HUB_DISABLE_TELEMETRY='1'
$env:OMP_NUM_THREADS='4'
& $voicePython (Join-Path $PSScriptRoot 'qwen-local.py') $Action --device $Device --count $Count --model-size $ModelSize
if($LASTEXITCODE -ne 0){throw "Qwen local generation failed with exit code $LASTEXITCODE"}
