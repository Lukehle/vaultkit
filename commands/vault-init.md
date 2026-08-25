---
description: Scaffold a new agent-ready markdown vault (or retrofit an existing one)
---

# /vault-init

$ARGUMENTS

Run the **vault-blueprint** skill to set up the vault named in the arguments (default:
current directory).

1. Ask which taxonomy mode fits — flat, ace, para, or zettelkasten — with one line on
   each; do not lecture. If retrofitting an existing vault, detect what is already there
   and propose the smallest change, never a bulk restructure (**vault-safety** governs).
2. Create the three layers regardless of mode: `sources/` (immutable), `wiki/`,
   `_drafts/`, plus `archive/` and the mode's own folders.
3. Copy `templates/VAULT.md` and `templates/INDEX.md` from the vault-blueprint skill,
   filled in for this vault. Keep VAULT.md under ~500 tokens — cut, don't add.
4. If the vault should mirror to Notion, run `notion-sync` setup
   (`~/.claude/vaultkit/scripts/notion-sync/cli.js init --apply`) and put the chosen folder in `syncRoots`.
5. If the vault is under git (recommended: it is the audit trail), commit the scaffold
   as its own commit.
6. Finish by running the health lint (`~/.claude/vaultkit/scripts/vault-lint/cli.js --vault <vault>`) so
   the baseline is clean, and report what was created.
