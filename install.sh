#!/usr/bin/env bash
# vaultkit managed installer. Copies skills, commands, and runtime scripts while
# preserving a hash ledger and rollback point. No network or package manager.
#   ./install.sh            # installs to ~/.claude
#   ./install.sh <dir>      # installs to <dir>/.claude (e.g. a project root)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$HOME}/.claude"

node "$SRC/scripts/managed-install.mjs" --target "$TARGET"

echo
echo "Installed to $TARGET. Runtime scripts:"
echo "  node $TARGET/vaultkit/scripts/vault-lint/cli.js --vault <vault>"
echo "  node $TARGET/vaultkit/scripts/notion-sync/cli.js status --vault <vault>"
echo "Rollback the most recent update with:"
echo "  node $TARGET/vaultkit/scripts/managed-install.mjs --target $TARGET --rollback latest"
