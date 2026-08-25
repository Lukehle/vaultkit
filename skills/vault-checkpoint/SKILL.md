---
name: vault-checkpoint
description: Survive context loss during long work - externalize state to a checkpoint note before it can evaporate, detect that a compaction or session break already happened, and recover from disk instead of from a summary. Use before any long loop over many items, before ending a session mid-task, and immediately when you cannot recall a specific figure or decision you clearly established earlier. Trigger on "where was I", "did I already do", "resume", "continue where we left off", "long session", "compact".
---

# Vault checkpoint

Long sessions get compacted: earlier conversation becomes a summary. Summaries keep
conclusions and drop bookkeeping — and the bookkeeping is the part you need:

> **Re-deriving lost state does not fail loudly. It silently produces a different
> answer that looks exactly as confident as the first one.**

So the rule is not "avoid compaction" (you can't). It is:

> **Anything you would have to re-derive must be on disk before you need it again.
> Externalize state, then clear context freely.**

These two goals — keep context small, never lose state — look opposed until you
checkpoint first. A checkpoint on disk is what makes context disposable.

## What reliably evaporates

Scope decisions stated but not written down; exclusions applied ("skipped X and Y"
becomes "skipped X"); the already-done list of a long loop; running totals; why an
alternative was rejected; which actions were already staged (worst case: staging the
same action twice). Conclusions survive; **the scope that made them true does not.**

## The checkpoint note

`_drafts/CHECKPOINT <task>.md` in the vault (or the project folder). Small, updated
often:

```markdown
# CHECKPOINT | <task> | written 2026-08-25T15:04Z

## Scope  (STATED BEFORE RESULTS — do not restate from memory)
Included: <what>       Excluded: <what, and why>
Thresholds/criteria:   <stated up front>

## Done  (do not redo — redoing may not be idempotent)
- [x] item 1 → artifact: runs/item1.json
- [x] item 2 → artifact: runs/item2.json

## In progress
item 3: at step 2 of 4, resume at <exact point>

## Open
- [ ] items 4–9

## Running figures  (recompute ONLY from the named artifacts, never from memory)
count so far: 14   (source: runs/tally.json)
```

Two properties matter more than the format: **scope sits at the top, stated before
results** (so post-compaction you cannot quietly reconstruct a friendlier scope), and
**every figure names the artifact it came from** (an unsourced number in a checkpoint
is just one more thing to re-derive).

## When to checkpoint

Before starting a loop over many items (write the full work list, not the current
item). Every ~10 items. Before any large read. Before ending a session — especially
mid-task. The checkpoint costs a few hundred tokens; re-deriving costs a session and
maybe a wrong answer.

## Detecting that it already happened

You will not always be told. Evidence: you can't recall a specific figure or path you
clearly established; you are about to ask something you already knew; a summary block
sits where an exchange used to be; your memory of the work list is suspiciously tidy.
**When in doubt, assume it happened** — an unnecessary checkpoint read is trivial;
continuing on reconstructed scope is not.

## Recovery protocol

1. **Stop.** The instinct to press on from what the summary implies is the failure mode.
2. Read the checkpoint **from disk** — the file, not the summary of it.
3. Re-read scope verbatim. If scope was never written down, everything computed under
   it is UNVERIFIED — restate scope explicitly before continuing.
4. Verify the frontier: for the last item marked done, confirm its artifact exists and
   matches. A "done" you cannot verify gets reopened.
5. Resume at the first not-done item. Never re-run a completed step whose effects
   persist (staged writes, sent messages, sync pushes).
6. Say in the deliverable that recovery happened and what was re-verified.

No checkpoint and no artifacts? The honest position is that in-flight work is lost.
Restart with explicit scope — reconstructing from a summary and presenting it as
continuous is the one unforgivable move.

## Degraded mode

Nothing to install — a checkpoint is a markdown file, and on a seat with no file
writes it is a message the human holds. If nothing at all can be written, keep work
units small enough to finish inside one context, each producing a stated result
before the next begins.

## Related skills

- `vault-retrieval` — clearing freely is safe only because of this skill
- `vault-gardener` — long gardening passes checkpoint their queue position
- `notion-sync` — the sync ledger is this pattern applied to two systems
