$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js 22 or newer is required." -ForegroundColor Red
    Write-Host "Install Node.js, then run this script again."
    exit 1
}
$nodeMajor = [int]((node -p "process.versions.node").Split('.')[0])
if ($nodeMajor -lt 22) {
    Write-Host "Node.js 22 or newer is required. Installed major version: $nodeMajor" -ForegroundColor Red
    Write-Host "Update Node.js, then run this script again."
    exit 1
}
Start-Job -ScriptBlock { Start-Sleep -Seconds 2; Start-Process "http://localhost:4173" } | Out-Null
Write-Host "Starting KEMS Alpha2 Web Companion at http://localhost:4173" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop it." -ForegroundColor DarkGray
node server.mjs
