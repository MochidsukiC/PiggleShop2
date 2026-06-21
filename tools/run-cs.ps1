# Launch the Piggle Shop cs.mnn web backend for dev.
#
# Prereqs (your environment):
#   - The MochiOS devstack is up: ipvm-router (:7400) + gateway (:7411) + the MC
#     command bus (:7421, opt-in via MOCHI_HUB_MC_PKI_DIR). (tools/mochi-inworld.ps1
#     in MochiOS2.0, started with the MC-PKI env.)
#   - A piggleshop command-bus cert issued with:
#       mochi-mc-ca issue --dir <CA> --mcserver-id piggleshop --out <CERT_DIR> --flat
#     (default below points at the devstack CA output.)
#
# Usage:
#   powershell -File tools/run-cs.ps1            # TLS on (https://piggleshop.cs.mnn)
#   powershell -File tools/run-cs.ps1 -NoTls     # plaintext loopback (smoke)

param(
    [string]$CertDir   = "D:\IdeaProjects\MochiOS2.0\.devstack\mc-pki\piggleshop",
    [string]$Listen    = "127.0.0.1:7430",
    [string]$RouterUrl = "http://127.0.0.1:7400",
    [string]$Gateway   = "127.0.0.1:7411",
    [string]$HubQuic   = "127.0.0.1:7421",
    [switch]$NoTls,
    [switch]$Build
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$crate = Join-Path $root "server\piggleshop-cs"
$exe = Join-Path $crate "target\debug\piggleshop-cs.exe"

if ($Build -or -not (Test-Path $exe)) {
    Write-Host "building piggleshop-cs ..." -ForegroundColor Cyan
    Push-Location $crate
    try { & cargo build; if ($LASTEXITCODE -ne 0) { throw "cargo build failed" } }
    finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $CertDir "leaf.key.pem"))) {
    Write-Warning "no cert at $CertDir — cs.mnn will run CATALOG-ONLY (checkout cannot deliver). Issue one with mochi-mc-ca."
}

$env:MOCHI_MC_CERT_DIR     = $CertDir
$env:PIGGLESHOP_CS_LISTEN  = $Listen
$env:MOCHI_IPVM_ROUTER_URL = $RouterUrl
$env:MOCHI_IPVM_GATEWAY    = $Gateway
$env:MOCHI_MC_HUB_QUIC     = $HubQuic
$env:PIGGLESHOP_CS_MNN     = "piggleshop.cs.mnn"
$env:PIGGLESHOP_CS_TLS     = if ($NoTls) { "0" } else { "1" }
$env:PIGGLESHOP_CS_SELF_REGISTER = "1"   # Direct self-register (dev)
if (-not $env:RUST_LOG) { $env:RUST_LOG = "info" }

Write-Host "starting piggleshop.cs.mnn (listen=$Listen tls=$(-not $NoTls) cert=$CertDir)" -ForegroundColor Green
& $exe
