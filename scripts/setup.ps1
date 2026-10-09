param([string]$PythonExe = 'python')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $Executable ($LASTEXITCODE)" }
}

Push-Location $repoRoot
try {
    Invoke-Checked 'npm.cmd' @('ci')
    if (-not (Test-Path -LiteralPath 'apps/api/.venv/Scripts/python.exe')) {
        Invoke-Checked $PythonExe @('-m', 'venv', 'apps/api/.venv')
    }
    Push-Location 'apps/api'
    try {
        $apiPython = (Resolve-Path '.venv/Scripts/python.exe').Path
        Invoke-Checked $apiPython @('-m', 'pip', 'install', '-r', 'requirements-dev.lock')
        Invoke-Checked $apiPython @('-m', 'pip', 'install', '--no-deps', '-e', '.[dev]')
        if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
        Invoke-Checked $apiPython @('-m', 'alembic', 'upgrade', 'head')
        Invoke-Checked $apiPython @('-m', 'app.seed')
    } finally { Pop-Location }
    Write-Host 'Ready. See docs/QUICKSTART.md for the API and web commands.'
} finally { Pop-Location }
