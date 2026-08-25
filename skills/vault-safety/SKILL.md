---
name: vault-safety
description: Pre-write audit for any vault-touching action - block deletes, unbacked overwrites, folder renames, and secret leaks before they happen. Run before every write, edit, move, or bulk operation against a vault a human curates. Trigger on "clean up the vault", "delete these notes", "rename the folder", "reorganize", or any write to a note the agent did not create this session.
---

# Vault safety

A curated vault is a human's memory. The agent is a guest with write access. Before any
mutation, run this audit — it is read-only and costs seconds; the mistakes it prevents
are mostly unrecoverable.

## The gate

For each intended write, answer all five. Any ✗ blocks the action.

| Check | Rule |
|---|---|
| **Delete?** | Never. Move to `archive/` instead. Deletion destroys context you cannot see the value of; the archive costs nothing. Actual deletion only on explicit, per-file human confirmation. |
| **Overwrite?** | Only after reading the current content this session, and only if the file is agent-owned (created by you, or inside your marked zone per `zone-writer`). A human-authored note gets a superseding note, not an in-place rewrite. |
| **Folder rename / bulk restructure?** | Never without an explicit human request naming the folders. Structure is user-curated; links, sync ledgers, and muscle memory all break. |
| **Secrets?** | Scan the payload for key patterns (API keys, tokens, PEM blocks, `password=`). Vaults sync, render, and get quoted — a secret written to a note is published. Reference `.env` slot names instead. `vault-lint` carries the pattern list. |
| **Right vault?** | If writing through a REST/MCP layer, confirm the vault identity first (list the root, check for the expected `VAULT.md`). Ports get rebound; the wrong vault accepts your write without complaint. |

## Why the rules are absolute rather than judgment calls

Judgment fails precisely when it matters: the note that "looks abandoned" is the one the
human needs next week; the folder rename that "obviously improves things" breaks fifty
wikilinks and a sync ledger. Every rule here exists because the mistake it blocks was
made by a well-reasoning agent that was confident at the time. The rules are cheap;
their exceptions go through a human.

**The scope hint is not a boundary.** Telling an agent "only touch vault X" does not
sandbox it — an agent with filesystem access and a discoverable second vault on the same
machine will eventually touch it. If isolation matters (an always-on agent, a shared
machine), enforce it physically: run the agent where only the intended vault is
reachable (container bind-mount, separate user account). Prompts scope intentions;
filesystems scope capability.

## Bulk operations

Anything touching more than ~5 notes gets: a dry-run list of every file and the change
to it, shown to the human, **before** the first write. Mid-bulk is the worst place to
discover a wrong assumption, and "I'll show a sample" hides exactly the outliers that
break.

## Degraded mode

Needs nothing — this is a checklist, and on the most restricted seat it degrades to its
purest form: describe the intended writes and let the human make them.

## Related skills

- `zone-writer` — what a legal write looks like once this gate passes
- `vault-gardener` — maintenance passes run this gate on every proposed change
- `notion-sync` — the sync engine encodes these rules (dry-run default, no deletes, conflict hard-stop)
