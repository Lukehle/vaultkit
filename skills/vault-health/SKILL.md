---
name: vault-health
description: Run and interpret the vault health lint - broken wikilinks, orphans, missing frontmatter, stale notes, oversized notes, secret leaks - and turn findings into a prioritized fix list. Use on a schedule (weekly), before a gardening pass, or when retrieval starts feeling unreliable. Trigger on "vault health", "lint the vault", "broken links", "is the vault in good shape", "audit my notes".
---

# Vault health

A vault decays silently: links break as notes move, facts pass their shelf life, orphans
accumulate where retrieval can't reach them. Nothing errors — the agent just starts
grounding itself in a slightly rotten map. The health pass makes the decay visible on a
schedule instead of at the moment of failure.

## Running it

```
node scripts/vault-lint/cli.js --vault <vault> [--json] [--stale-days 180] [--max-note-kb 32]
```

Read-only, zero dependencies, exit 1 only on errors. Two severities, deliberately:

| Severity | Checks | Why this severity |
|---|---|---|
| **error** | secrets in notes; broken wikilinks | These corrupt grounding actively — a secret in a synced vault is published, and a broken link sends an agent to nothing, where it improvises. |
| **warning** | missing/incomplete frontmatter; orphans; stale notes; oversized notes; no root index | Hygiene. Feeds the gardening queue, doesn't block work. |

The linter is **mechanical on purpose**. It never judges whether a note is *wrong* —
that requires reading and reasoning, which is the gardener's job with a human gate.
A linter that "fixes" content is an unsupervised editor of your memory.

## Interpreting the report

- **Broken wikilinks** — first, check for a rename/move (the note exists under a new
  name: fix the link). A link to a note that never existed is different — it may be a
  deliberate breadcrumb marking a note worth writing. Fix the first kind; leave the
  second kind visible, or create the stub if it has earned existence.
- **Orphans** — unreachable by graph traversal, invisible to index-first retrieval.
  Either link them from the relevant MOC (they matter) or archive them (they don't).
  Not linked and not archived is the one wrong state.
- **Stale** — untouched past threshold inside knowledge folders. Staleness is a review
  flag, NOT a deletion signal: reviewing can end in "still true, touched the date",
  "superseded by [[X]]", or "archive". Deleting stale notes on age alone throws away
  your rarest asset — old decisions with their reasoning attached.
- **Oversized** — split at concept boundaries, unless it is a deliberate deep-context
  file (mark it `type: project` and move on).
- **Contradictions between notes** — the linter cannot see these; the gardening pass
  looks for them within each topic area it reviews, and surfaces them as questions
  rather than auto-resolving toward the newer note.

## Cadence

Weekly, and always immediately before a `vault-gardener` pass (the lint report IS the
gardener's work queue). On a vault under git, run it in CI on push — the exit code is
designed for it. Check the exit code itself, never a filtered echo of the output.

## Degraded mode

No script execution: run the two error-class checks by hand at reduced scope — search
for secret patterns, and spot-check links in the notes the current task touches. Say
that the full pass didn't run; a partial audit reported as partial is fine, reported as
complete is a lie in the ledger.

## Related skills

- `vault-gardener` — consumes this report as its work queue
- `grounded-claims` — the per-claim discipline the lint's uncited/expired checks backstop
- `vault-safety` — any fix the report inspires still goes through the pre-write gate
