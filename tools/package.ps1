# Assemble deployable bundles from client/ (the shared web-app source).
#
# The mobile bundle dir (app-mobile/apps/com.mochi.piggleshop) and the desktop
# Tauri web/ dir hold only their platform-specific entry (manifest.json /
# index.html); this copies the shared shop/ + assets/ + piggle-sdk.js into each
# so they are self-contained for deployment.
#
#   mobile  : deploy the assembled bundle dir to
#             <gameDir>/mods/mochi/apps/com.mochi.piggleshop/<version>/
#   desktop : Tauri serves app-desktop/web as frontendDist.

param(
    [string]$Mobile,
    [string]$DesktopWeb
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$client = Join-Path $root "client"
$shared = @("shop", "assets", "piggle-sdk.js")

function Sync-Into([string]$dest) {
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }
    foreach ($s in $shared) {
        $src = Join-Path $client $s
        if (Test-Path $src) {
            Copy-Item -Recurse -Force $src $dest
        }
    }
}

$mob = if ($Mobile) { $Mobile } else { Join-Path $root "app-mobile\apps\com.mochi.piggleshop" }
Sync-Into $mob
Write-Host "mobile bundle assembled: $mob"

$dw = if ($DesktopWeb) { $DesktopWeb } else { Join-Path $root "app-desktop\web" }
Sync-Into $dw
Write-Host "desktop web assembled:  $dw"
