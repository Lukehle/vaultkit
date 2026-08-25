# Notion sync — architecture and failure modes

Design notes for `scripts/notion-sync/`. The skill (`skills/notion-sync/`) covers
operating it; this covers why it is built the way it is.

## Positions taken

**Vault-canonical, scoped mirror.** The vault is the source of truth for structure and
authoring; Notion mirrors an explicitly-listed set of folders (`syncRoots`). Most
conflict surface disappears by construction — a note that only ever changes on one side
cannot conflict. Full bidirectional everything-syncs designs spend their complexity
budget resolving conflicts that scoping would have prevented.

**Native Markdown API, not block JSON.** Notion's Markdown API (pinned version
`2026-03-11`: `GET`/`PATCH /v1/pages/:id/markdown`) lets Notion's own parser own block
conversion. The pre-2026 sync tools all predate it and are built on markdown↔block-JSON
conversion layers, which inherit three documented API problems: `PATCH /v1/blocks` can
change content but never a block's type, there is no reorder operation, and children
append 100-at-a-time with 2 nesting levels — so "push an edit" degenerates into
delete-and-recreate with partial-failure risk on every deep page. The markdown path
sidesteps that class entirely. Cost of the choice: the endpoint is newer, so its shapes
are centralized in `lib/client.js` — if Notion adjusts them, one file changes.

**Hashes decide; timestamps only optimize.** Per note, the ledger stores the content
hash of both sides at last successful sync. Current-hash-vs-ledger classifies each note:
`in-sync`, `push-pending`, `pull-pending`, `conflict` (both moved), `unlinked`,
`missing-local`. Timestamps are unreliable arbiters (clock skew; Notion touches
`last_edited_time` on non-content operations) but fine as a cache key: an unchanged
`last_edited_time` skips the remote markdown fetch.

**Hashing normalizes first** — CRLF→LF, trailing whitespace stripped, single trailing
newline. Windows files and Notion output disagree about all three; without
normalization every note reports a phantom change on every run from a Windows machine,
which buries real changes and trains users to ignore the tool. Test-pinned.

**Conflicts hard-stop.** Both hashes moved → the engine touches nothing on either side
for that note and requires a per-note human decision (`resolve --take-local|--take-remote`).
Last-write-wins is the documented default failure mode of this tool category, not a
strategy. A freshly-`link`ed pair has no baseline and therefore *starts* in conflict on
purpose — someone must pick the first side once.

**Read-back verification.** After every push, the engine GETs the page markdown back and
records the hash of what Notion now serves — not the hash of the payload it sent.
Notion's parser normalizes what it stores, and partial failures happen; "the API
returned 200" is not "the page says the right thing". Test-pinned.

**Body only.** Frontmatter is stripped on push and preserved on pull. Local hashes cover
the body only, so a tag/status edit never burns rate budget or rewrites a page.
Notion-properties ↔ frontmatter mapping is deliberately out of scope for v1 — it is
where sync tools go to die; if a property matters, put it in the body.

**Ledger + frontmatter, redundantly.** `notion_page_id` lives in the note's frontmatter
(human-visible, survives file moves) AND in the ledger (auditable, holds the hash
history frontmatter can't). Ledger wins on disagreement, and the disagreement is
reported, not guessed at. Ledger writes are atomic (temp file + rename).

**Rate limiting**: ~2.5 req/s spacing (headroom under Notion's ~3/s), `Retry-After`
honored on 429/529, exponential backoff otherwise, capped retries. The workspace-wide
1,000-requests-per-5-minutes cap is shared across all integrations — a bulk first sync
should be run off-hours.

## Known limitations (deliberate)

- **One sync process per vault.** The ledger and the re-read guards protect against an *editor*
  racing the sync; they do not make two concurrent sync processes safe against each other. Run
  syncs from one scheduler, serially.
- **No file watcher.** The engine reads the disk fresh on every invocation and is poll-based by
  design — a background watcher daemon would break the zero-dependency, locked-seat contract and
  adds nothing an invocation-driven reader doesn't already get.
- **No webhooks.** Push-based Notion→vault would need a public HTTPS receiver; this tool
  targets locked-down machines. Polling `status` on a schedule is the design. (Webhook
  payloads are signal-only, unordered, at-most-once anyway — a poll-with-hash-check is
  the verification step regardless.)
- **No auto-merge, no line-level merge UI.** Page-level take-one-side only. The scoped
  mirror keeps conflicts rare enough that per-note human decisions are cheaper than
  trusting a merge.
- **No Notion databases / data sources.** Pages only. Database rows are structured data
  with different ownership semantics; mirroring them as markdown invites the
  copied-value-rot problem (`grounded-claims`: pointers, not copies).
- **Doesn't round-trip**: dataview blocks (frozen as code), Obsidian embeds (visible
  placeholder + warning), underline/colors (dropped by markdown itself), H4+ (Notion
  has three heading levels). Every degradation is surfaced as a warning, never silent.

## Failure recovery

Every mutation is per-note and the ledger is written after each success, so a run killed
mid-batch resumes cleanly: already-synced notes classify `in-sync`, the interrupted note
re-classifies from real state and re-runs. The one non-atomic window (Notion PATCH
succeeded, ledger write lost) self-heals as a spurious `pull-pending` whose pull is a
no-op content-wise. Nothing in the design requires the ledger to be right — it only has
to be *conservative*, and a stale ledger always fails toward conflict, never toward
overwrite.
