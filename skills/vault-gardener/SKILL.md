---
name: vault-gardener
description: The self-updating loop - periodic prune, merge, and refresh passes over agent-maintained notes, with drafts promoted to canonical only through a human gate, and git as the audit trail. Use on a schedule (weekly/monthly), after a vault-health run, or when the wiki layer has accumulated overlapping or outdated notes. Trigger on "maintain the vault", "self update", "prune old notes", "merge duplicates", "gardening pass", "memory maintenance".
---

# Vault gardener

A vault that no one maintains becomes noise within weeks; a vault an agent rewrites
freely converges on confident mush. The gardener threads between the two: **the agent
proposes, in batch, on a schedule; a human approves; git records.**

## The loop

```
vault-health lint  →  gardening queue  →  agent drafts changes in _drafts/
        →  human reviews the diff  →  approved changes land  →  git commit with rationale
```

Three operations, run in this order:

| Operation | What | Guardrail |
|---|---|---|
| **Prune** | Mark superseded/dead notes for archive | Archive, never delete. Age alone is not evidence of death — check inbound links and whether anything still cites it. |
| **Merge** | Fold overlapping notes into one accurate note | The merged note cites ALL original sources; originals get `status: superseded` pointing at it. Watch for detail-flattening — a merge that loses the one exception clause is worse than the duplication was. |
| **Refresh** | Update stale-but-relevant notes; re-describe old notes that new notes contradict | Contradictions are surfaced as questions in the draft, not auto-resolved toward the newer note. Newer is not truer. |

## The promotion gate

Agent-written changes never land directly in canonical folders:

1. Agent writes the proposed new/changed notes in `_drafts/`, each with a one-line
   rationale at top (`<!-- gardener: merging [[A]] + [[B]], overlap on X -->`).
2. Human reviews **the artifact, not the plan** — the actual diff/draft, not the
   agent's description of it. Approve, edit, or reject per note.
3. Approved notes move to their canonical location; superseded notes get their status
   flipped; the whole pass lands as one git commit whose message says what and why.

This gate is the difference between a self-updating vault and a self-corrupting one.
Two failure modes it specifically blocks: **silent overwrite of human corrections**
(a human fixed a note last month; an unsupervised refresh regenerates it from sources
and the fix evaporates — the gate catches it in the diff), and **model collapse**
(each unsupervised rewrite pass flattens detail and homogenizes voice until the wiki
is smooth, uniform, and subtly wrong).

## Cadence and scope

- **Weekly**: lint + prune queue review. Minutes of human time.
- **Monthly**: merge + refresh over ONE topic area, not the whole vault. Small scoped
  passes get actually reviewed; a 200-note diff gets rubber-stamped, and a rubber
  stamp is no gate at all.
- **Never mid-task**: gardening is its own session. An agent that "tidies while it
  works" mixes maintenance writes into task writes and neither gets reviewed properly.

## No automatic cascades

When a source note changes, do NOT auto-propagate through everything that cites it.
Flag the citing notes for the next refresh pass instead. Cascade rewrites are how one
bad edit metastasizes through a vault at machine speed.

## Honest note on automation

The strongest voice in this space runs his own review ritual **by hand, by choice** —
the review is where the thinking happens, and automating it away can cost you the very
understanding the vault exists to build. The gardener automates the *inventory* (what
needs looking at) and the *drafting* (proposed fixes); keep the *judgment* human. If
you find yourself approving without reading, shrink the batch until you read again.

## Degraded mode

No file writes: the gardener emits its queue and proposed changes as a message — a
prioritized list with drafted replacements inline — and the human applies what they
accept. Slower, same loop, same gate.

## Related skills

- `vault-health` — produces the queue this loop consumes
- `vault-safety` — every landed change passes the pre-write gate
- `grounded-claims` — the review checklist for each promoted note
- `zone-writer` — maintenance writes into shared notes stay inside owned zones
