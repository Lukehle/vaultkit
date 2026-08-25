# vaultkit managed installer. Copies skills, commands, and runtime scripts while
# preserving a hash ledger and rollback point. No network or package manager.
#   .\install.ps1            # installs to $HOME\.claude
#   .\install.ps1 C:\proj    # installs to C:\proj\.claude
param([string]$TargetRoot = $HOME)

$ErrorActionPreference = 'Stop'
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Join-Path $TargetRoot '.claude'

& node (Join-Path $Src 'scripts\managed-install.mjs') --target $Target
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output ""
Write-Output "Installed to $Target. Runtime scripts:"
Write-Output "  node $Target\vaultkit\scripts\vault-lint\cli.js --vault <vault>"
Write-Output "  node $Target\vaultkit\scripts\notion-sync\cli.js status --vault <vault>"
Write-Output "Rollback the most recent update with:"
Write-Output "  node $Target\vaultkit\scripts\managed-install.mjs --target $Target --rollback latest"
