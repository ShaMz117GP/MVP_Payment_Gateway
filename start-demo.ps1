$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $root "PaymentGatewayMvpApp"
$uiDir = Join-Path $root "payment-demo-ui"

if (-not (Test-Path $apiDir)) {
    throw "API directory not found: $apiDir"
}

if (-not (Test-Path $uiDir)) {
    throw "UI directory not found: $uiDir"
}

Write-Host "Starting API in a new terminal..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$apiDir'; dotnet run"

Write-Host "Starting UI in a new terminal..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$uiDir'; npm run dev"

Write-Host ""
Write-Host "Demo startup triggered."
Write-Host "Use API URL shown by dotnet run in the UI Base URL field."
