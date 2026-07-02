# Frees a TCP port by stopping whatever process is listening on it.
# Use this to kill a stale/zombie `next dev` server that survived a previous
# session and is serving an old (often unstyled) build.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/free-port.ps1 -Port 3000
#
# Or via npm: `npm run dev:clean`

param(
  [int]$Port = 3000
)

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listeners) {
  Write-Host "Port $Port is free."
  exit 0
}

foreach ($conn in $listeners) {
  $procId = $conn.OwningProcess
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  $name = if ($proc) { $proc.ProcessName } else { "unknown" }
  Write-Host "Stopping PID $procId ($name) listening on port $Port"
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Write-Warning "Port $Port is still in use."
  exit 1
}
Write-Host "Port $Port freed."
