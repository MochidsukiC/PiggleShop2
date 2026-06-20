# Extract vanilla Minecraft item/block textures into client/assets/ so Piggle
# Shop shows the REAL item textures (the design PNGs were mockups). Sourced from
# the ForgeGradle-downloaded client-extra.jar; build mod/ once so it exists.
#
#   pwsh -File tools/extract-textures.ps1 [-Jar <path-to-client-extra.jar>]
#
# NOTE: these are Mojang assets — extracted locally, not committed (see
# .gitignore). tools/package.ps1 includes them when assembling a bundle.

param([string]$Jar)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
if (-not $Jar) {
    $Jar = Join-Path $env:USERPROFILE ".gradle\caches\forge_gradle\minecraft_repo\versions\1.20.1\client-extra.jar"
}
if (-not (Test-Path $Jar)) {
    Write-Error "MC client-extra.jar not found: $Jar`nBuild mod/ once (.\gradlew.bat -p mod build) so ForgeGradle downloads it."
}

$itemsDir = Join-Path $root "client\assets\items"
$texDir   = Join-Path $root "client\assets\tex"
New-Item -ItemType Directory -Force $itemsDir, $texDir | Out-Null

# design item id -> vanilla texture path (under assets/minecraft/textures/)
$items = [ordered]@{
    "dirt" = "block/dirt"; "cobblestone" = "block/cobblestone"; "netherrack" = "block/netherrack";
    "blackstone" = "block/blackstone"; "gold_block" = "block/gold_block"; "gold_ore" = "block/gold_ore";
    "diamond_ore" = "block/diamond_ore"; "emerald_ore" = "block/emerald_ore";
    "diamond_pickaxe" = "item/diamond_pickaxe"; "netherite_pickaxe" = "item/netherite_pickaxe";
    "gold_sword" = "item/golden_sword"; "diamond_sword" = "item/diamond_sword"; "netherite_sword" = "item/netherite_sword";
    "iron_axe" = "item/iron_axe"; "crossbow" = "item/crossbow_standby";
    "gold_helmet" = "item/golden_helmet"; "diamond_helmet" = "item/diamond_helmet";
    "diamond_chestplate" = "item/diamond_chestplate"; "netherite_chestplate" = "item/netherite_chestplate";
    "gold_leggings" = "item/golden_leggings"; "netherite_leggings" = "item/netherite_leggings";
    "diamond_boots" = "item/diamond_boots"; "gold_boots" = "item/golden_boots";
    "golden_apple" = "item/golden_apple"; "cooked_porkchop" = "item/cooked_porkchop"; "bread" = "item/bread";
    "gold_ingot" = "item/gold_ingot"; "iron_ingot" = "item/iron_ingot"; "netherite_ingot" = "item/netherite_ingot";
    "emerald" = "item/emerald"; "diamond" = "item/diamond"; "quartz" = "item/quartz"; "lapis" = "item/lapis_lazuli";
    "ancient_debris" = "block/ancient_debris_side";
    "enchanted_book" = "item/enchanted_book"; "totem" = "item/totem_of_undying";
}
# CSS stone tiles
$tex = [ordered]@{ "polished_blackstone" = "block/polished_blackstone"; "stone_deep" = "block/deepslate"; }

$zip = [System.IO.Compression.ZipFile]::OpenRead($Jar)
try {
    $ok = 0; $miss = 0
    function Extract($map, $destDir) {
        foreach ($k in $map.Keys) {
            $entryName = "assets/minecraft/textures/$($map[$k]).png"
            $e = $zip.GetEntry($entryName)
            if ($null -eq $e) { Write-Warning "missing: $entryName (for $k)"; $script:miss++; continue }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $destDir "$k.png"), $true)
            $script:ok++
        }
    }
    Extract $items $itemsDir
    Extract $tex $texDir

    # Broad set: every vanilla item/ + block/ texture by base name, so AEM-listed
    # items (whose tex = the mc id base name, e.g. minecraft:diamond → "diamond")
    # resolve. Item textures win over block textures on a name collision. (Block
    # item icons are 3D-rendered in-game; the flat block texture is an approximation.)
    $broad = 0
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '^assets/minecraft/textures/(item|block)/([a-z0-9_]+)\.png$') {
            $kind = $Matches[1]; $base = $Matches[2]
            $dest = Join-Path $itemsDir "$base.png"
            if ($kind -eq 'item' -or -not (Test-Path $dest)) {
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
                $script:broad++
            }
        }
    }
    Write-Host "extracted $ok named + $broad broad textures ($miss missing) → client/assets/{items,tex}"
}
finally { $zip.Dispose() }
