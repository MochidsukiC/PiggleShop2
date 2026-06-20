# Publish the Piggle Shop mobile app to the MochiOS external-app loader so the
# in-phone App Store (com.mochi.appstore) can install it (DEV.md §4.6).
#
# Prereqs (your environment):
#   - The devstack is running with the loader services: app-registry (:7405) +
#     app-repository (:7409). (tools/mochi-inworld.ps1 in MochiOS2.0.)
#   - A bearer SESSION TOKEN from a logged-in dev session. With in-world OTP OFF
#     you can mint one yourself (open registration):
#       $body = @{ email='you@example.com'; password='...' } | ConvertTo-Json
#       Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7404/accounts -ContentType application/json -Body $body
#       $tok = (Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7402/auth/login `
#                 -ContentType application/json `
#                 -Body (@{email='you@example.com';password='...';device_id='dev'}|ConvertTo-Json)).access_token
#
# Usage:
#   powershell -File tools/publish-piggleshop.ps1 -Token $tok
#
# Then in-world: open the App Store → install「Piggle Shop」→ it appears on the
# home grid and launches (the loader registers its CEF factory dynamically).

param(
    [Parameter(Mandatory = $true)] [string] $Token,
    [string] $MochiRepo = 'D:\IdeaProjects\MochiOS2.0',
    [string] $RegistryUrl = 'http://127.0.0.1:7405',
    [string] $RepositoryUrl = 'http://127.0.0.1:7409'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# 1. Assemble the bundle (copy the shared client into the bundle dir).
& (Join-Path $root 'tools\package.ps1')

# 2. Publish via the MochiOS loader's publish tool (pack → registry POST + repo PUT).
$bundle = Join-Path $root 'app-mobile\apps\com.mochi.piggleshop'
$publish = Join-Path $MochiRepo 'tools\mochi-publish-app.ps1'
if (-not (Test-Path $publish)) { throw "loader publish tool not found: $publish" }

& $publish -AppDir $bundle -Token $Token -RegistryUrl $RegistryUrl -RepositoryUrl $RepositoryUrl
Write-Host "Piggle Shop published — install it from the in-phone App Store." -ForegroundColor Green
