---
name: notion-sync
description: Operate the vault-to-Notion two-way mirror safely - scope what syncs, run the tested sync script, handle conflicts explicitly, and fall back to paste-ready markdown when there is no API access. Use when publishing vault notes to Notion, pulling Notion edits back, setting up the mirror for the first time, or resolving a sync conflict. Trigger on "sync to Notion", "publish to Notion", "pull from Notion", "Notion says something different", "set up the Notion mirror".
---

# Notion sync

The vault is canonical; Notion is a **mirror of an explicitly-scoped subset** — the
notes teammates need to read and occasionally edit. This is not a general bidirectional
merge engine, on purpose: narrowing what syncs removes most conflict surface by
construction instead of resolving it after the fact.

The installed engine is `~/.claude/vaultkit/scripts/notion-sync/` (or the equivalent
under a custom Claude config root) — zero dependencies (Node ≥ 18), tested, and
dry-run by default. A repo clone can use its own `scripts/notion-sync/` path. It uses
Notion's native Markdown API (version 2026-03-11), so there is no block-JSON conversion
layer to corrupt formatting.

## Setup, once

1. Create a Notion **internal integration** (token, `ntn_*`), share the target parent
   page with it. Token goes in `.env` as `NOTION_TOKEN` — never in the vault, never in
   the config file.
2. `node ~/.claude/vaultkit/scripts/notion-sync/cli.js init --vault <vault> --apply`
   → edit `vaultkit.sync.json`:
   `syncRoots` (which folders mirror — start with one), `parentPageId`.
3. Existing Notion pages pair with existing notes via `link --apply`. A fresh link deliberately
   reports as a **conflict** until you pick a side once (`resolve --take-local` or
   `--take-remote`) — there is no baseline yet, and guessing one would silently
   overwrite somebody.

## The operating loop

```
status   → see state plus link drift: in-sync | push/pull-pending | conflict | unlinked | creation-pending | out-of-scope | missing-local
reconcile → dry-run or repair frontmatter page ids from the authoritative ledger
push     → vault → Notion   (only push-pending; --new creates pages for unlinked notes)
pull     → Notion → vault   (only pull-pending; replaces body, preserves local frontmatter)
resolve  → conflicts, one note at a time, explicitly
```

Everything is dry-run until `--apply`. What the engine guarantees (test-pinned):

- **The hash pair decides state, not timestamps** — normalized content hashes on both
  sides in a ledger; timestamps only skip redundant fetches.
- **Conflict = hard stop.** Both sides changed → neither side is touched, ever, until a
  human picks a side per note. Last-write-wins is the failure mode, not a strategy.
- **Every remote write is verified by read-back** — the ledger records what Notion now
  actually serves, not what was sent.
- **Frontmatter never syncs**: pushes strip it, pulls preserve it. A tag edit costs
  zero API calls.
- Wikilinks to co-synced notes become Notion page links (and come back); links to
  unsynced notes degrade to plain text **with a warning, never silently**. Callouts
  round-trip. Embeds become visible placeholders.

## What belongs in the mirror

| Sync | Do not sync |
|---|---|
| Runbooks, process docs, definitions | Anything from `sources/` (unreviewed captures) |
| Project status notes teammates read | `_drafts/` (nothing unpromoted leaves the vault) |
| Decision records | Notes with secrets — run `vault-lint` first; it errors on key patterns |
| | Personal/private notes; volatile data dumps (link the system of record instead) |

Notion **databases** are out of the mirror's scope (pages only — property mapping is
where sync tools go to die). When a database view matters to the vault, snapshot it:
export the view as a markdown table into a normal synced page on a cadence, clearly
stamped as-of. The database stays the live surface; the vault gets an auditable copy.

**The outbound gate is a security control, not just tidiness.** A vault that (a) an
agent writes to, (b) ingests untrusted web content, and (c) syncs outward is the
textbook exfiltration shape — the "lethal trifecta." Sync only promoted, human-reviewed
folders; never add `sources/` or `_drafts/` to `syncRoots`.
The engine enforces that boundary: absolute/traversing roots, `sources/`, `_drafts/`,
and links outside `syncRoots` fail closed rather than relying on this instruction.

## Conflicts

`status` names them; nothing auto-resolves. Per note: open both versions, decide, then
`resolve <note> --take-local --apply` (vault wins, pushed) or `--take-remote --apply`
(Notion wins, pulled). If a teammate's Notion edit loses, carry the substance of their
edit into the vault note by hand first — the resolve command settles the transport,
not the content.

## Cadence

Run `status` + `push`/`pull` as a routine (daily or per-publish). On a schedule, run
with `--apply` for push/pull but let conflicts accumulate for a human — the engine
already refuses them, so a scheduled run is safe by construction. Keep the sync run
and the gardening pass separate jobs: transport wants zero judgment, maintenance wants
judgment plus a gate.

## Degraded mode

**No token / no API access:** `push --emit <dir>` converts notes to paste-ready Notion
markdown with a provenance header — a human pastes into the page. **Read-only
integration:** same, plus paste the diff. The scoping and review rules hold either
way, because they live in the workflow, not the API.

## Related skills

- `zone-writer` — the shared-surface contract this engine implements across systems
- `vault-gardener` — only promoted notes reach `syncRoots`
- `vault-health` — the pre-sync secret/link check
- `vault-safety` — pull writes into the vault pass the same gate as any write
