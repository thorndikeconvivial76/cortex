# Cortex Windows Service Setup via NSSM
# Requires NSSM (nssm.cc) to be installed

$ServiceName = "CortexDaemon"
$CortexPath = (Get-Command cortex -ErrorAction SilentlyContinue).Source
$Home = $env:USERPROFILE
$LogDir = Join-Path $Home ".cortex\logs"

if (-not $CortexPath) {
    Write-Error "cortex not found in PATH. Install cortex first."
    exit 1
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Install service
nssm install $ServiceName $CortexPath "server" "--daemon"
nssm set $ServiceName AppDirectory $Home
nssm set $ServiceName AppStdout (Join-Path $LogDir "daemon.log")
nssm set $ServiceName AppStderr (Join-Path $LogDir "error.log")
nssm set $ServiceName AppRotateFiles 1
nssm set $ServiceName AppRotateBytes 52428800  # 50MB
nssm set $ServiceName Start SERVICE_AUTO_START

# Start service
nssm start $ServiceName

Write-Host "Cortex daemon installed and started as Windows service."
