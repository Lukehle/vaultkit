---
name: zone-writer
description: Write to shared surfaces (vault notes, Notion pages, wiki pages, spreadsheets) without destroying human edits - one writer per zone, marker-delimited sections, content fingerprints for idempotency, and read-before-write. Use whenever an automation or agent writes into a document a human also edits, or when two automations might touch the same file. Trigger on "update the note", "append to the daily note", "publish to the page", "sync this section", "the automation overwrote my edits".
---

# Zone writer

Shared documents — vault notes a human edits in the app, Notion pages a team reads,
spreadsheets — are non-transactional: last write wins, silently. The contract that makes
automated writes safe on such surfaces is:

> **One writer per zone. The zone is marked in the document itself. Replace only
> between the markers. Everything outside them is read-only to you.**

## The zone

```markdown
## Sync status

<!-- vaultkit:zone:sync-status START — auto-generated, do not edit by hand -->
Last run: 2026-08-25 | 14 pushed, 0 conflicts
<!-- vaultkit:zone:sync-status END -->

## Notes
<!-- human zone — automation never writes below this line -->
```

Rules, none optional:

1. **Replace between the markers, touch nothing else.** Not the heading above, not the
   blank line after.
2. **Markers missing? Stop.** Do not guess where the zone was — a wrong guess overwrites
   human writing. Ask, or append a fresh zone at the end of the document.
3. **One automation owns a zone.** Two writers on one zone is the forbidden
   configuration; give the second writer its own zone.
4. **Human zones are read-only to automation. Always.** If a human edited inside YOUR
   zone despite the marker, preserve their text (move it just below the zone) and flag
   it — never delete it.
5. **Record the zone map** in one `ZONES.md` per surface set, so the next automation
   author can see what is already owned.

## Fingerprints: idempotency and the clobber guard

Alongside the zone marker, stamp a content fingerprint:

```markdown
<!-- vaultkit:fingerprint:sha256:9f2c…a1 -->
```

Two checks fall out of it:

- **Idempotency** — if the fingerprint of what you are about to write equals the one in
  the document, skip the write. Re-runs become no-ops instead of churn (and on synced
  surfaces, churn is diff noise, notification spam, and rate-limit burn).
- **Clobber guard** — if the document's current zone content does NOT match the
  fingerprint you last stamped, someone edited inside your zone. Stop and surface it;
  proceed only on an explicit force.

**Normalize before hashing** — CRLF→LF, strip trailing whitespace. Windows files and
web APIs disagree about line endings, and an un-normalized hash reports a phantom edit
on every run, which trains everyone to ignore the clobber guard. (The `notion-sync`
script in this repo does exactly this; its tests pin the behavior.)

## Read before write, verify after

- **Read the current document first.** Every time. The state you remember is not the
  state on disk; a human may have edited since.
- **Verify by reading back.** "The API returned 200" is not "the page says the right
  thing" — partial failures are routine on block-based APIs. The read-back, not the
  write payload, is what you record as the new known state.

## One surface-specific trap (Obsidian Local REST API / MCP)

The local REST port serves **whichever vault's plugin bound the port** — with two
Obsidian windows open, that can silently be the wrong vault. Before any write through
it, list the vault root and check it matches the vault you intend (a known fingerprint
file like `VAULT.md` is enough). A write to the wrong vault passes every other check.

## Degraded mode

No API access to the surface: emit the zone content **with its markers and fingerprint
included** as paste-ready text. The human pastes it; the contract survives because it
is written into the document, not into the tooling.

## Related skills

- `notion-sync` — this contract applied across two systems, with a ledger
- `vault-safety` — the pre-write gate that runs before any vault mutation
- `vault-gardener` — zone discipline for the agent's own maintenance writes
