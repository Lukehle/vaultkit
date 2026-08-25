#!/usr/bin/env bash
# vaultkit installer - copies skills and commands into a Claude Code config dir.
# No network, no package manager. Usage:
#   ./install.sh            # installs to ~/.claude
#   ./install.sh <dir>      # installs to <dir>/.claude (e.g. a project root)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$HOME}/.claude"

mkdir -p "$TARGET/skills" "$TARGET/commands"

for skill in "$SRC"/skills/*/; do
  name="$(basename "$skill")"
  mkdir -p "$TARGET/skills/$name"
  cp -r "$skill"/. "$TARGET/skills/$name/"
  echo "skill:   $name"
done

for cmd in "$SRC"/commands/*.md; do
  cp "$cmd" "$TARGET/commands/"
  echo "command: /$(basename "$cmd" .md)"
done

echo
echo "Installed to $TARGET. Scripts stay in this repo - run them by path:"
echo "  node $SRC/scripts/vault-lint/cli.js --vault <vault>"
echo "  node $SRC/scripts/notion-sync/cli.js status --vault <vault>"
