---
description: Run the vault health lint and turn findings into a prioritized fix queue
---

# /vault-health

$ARGUMENTS

Run the **vault-health** skill against the vault named in the arguments (default:
current directory).

1. `node scripts/vault-lint/cli.js --vault <vault> --json` — check the exit code
   itself, never a filtered echo of the output.
2. Report errors first (secrets, broken wikilinks) with the specific fix for each;
   secrets found in notes also mean: rotate the credential, then remove it.
3. Group warnings into a gardening queue by check type; distinguish broken links that
   are renames (fix now) from deliberate breadcrumbs (leave).
4. Do NOT auto-fix anything beyond unambiguous link renames the user approves —
   judgment fixes go through **vault-gardener**'s promotion gate.
5. If this is a scheduled/CI run, the deliverable is the report and exit code, nothing
   else.
