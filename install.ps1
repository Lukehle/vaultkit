# vaultkit installer - copies skills and commands into a Claude Code config dir.
# No network, no package manager. Usage:
#   .\install.ps1            # installs to $HOME\.claude
#   .\install.ps1 C:\proj    # installs to C:\proj\.claude
param([string]$TargetRoot = $HOME)

$ErrorActionPreference = 'Stop'
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Join-Path $TargetRoot '.claude'

New-Item -ItemType Directory -Force (Join-Path $Target 'skills') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $Target 'commands') | Out-Null

Get-ChildItem (Join-Path $Src 'skills') -Directory | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $Target 'skills') -Recurse -Force
    Write-Output "skill:   $($_.Name)"
}

Get-ChildItem (Join-Path $Src 'commands') -Filter '*.md' | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $Target 'commands') -Force
    Write-Output "command: /$($_.BaseName)"
}

Write-Output ""
Write-Output "Installed to $Target. Scripts stay in this repo - run them by path:"
Write-Output "  node $Src\scripts\vault-lint\cli.js --vault <vault>"
Write-Output "  node $Src\scripts\notion-sync\cli.js status --vault <vault>"
