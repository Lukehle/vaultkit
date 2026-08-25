---
description: Run the vault-to-Notion mirror - status, push, pull, and conflict resolution
---

# /vault-sync

$ARGUMENTS

Run the **notion-sync** skill for the vault named in the arguments (default: current
directory).

1. Pre-flight: `node scripts/vault-lint/cli.js --vault <vault>` — a secret error blocks
   the sync entirely (rotating comes before syncing).
2. `node scripts/notion-sync/cli.js status --vault <vault>` and show the per-note table.
3. Push and pull the pending notes: dry-run first, show the plan, then `--apply` on the
   user's confirmation (or without asking if this session was told to run the routine).
4. Conflicts: never resolve unilaterally. Show both versions' differences per note and
   ask which side wins; if a human's Notion edit loses, carry its substance into the
   vault note before resolving.
5. No `NOTION_TOKEN` available: degrade to `push --emit <dir>` and hand the user
   paste-ready files with their target pages named.
6. Close with the one-line summary: pushed / pulled / conflicts open / warnings.
