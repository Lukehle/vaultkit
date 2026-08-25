---
name: grounded-claims
description: Keep agent output grounded in the vault - cite the note behind every claim, refuse gracefully when the vault is silent, label the epistemic status of synthesized statements, and date facts that can rot. Use when answering questions from vault content, writing wiki notes, or reviewing agent-written notes for trustworthiness. Trigger on "is that actually true", "source?", "hallucination", "where did that come from", "verify this note", "cite".
---

# Grounded claims

The vault reduces hallucination through one enforceable rule:

> **Cite the note or don't make the claim. If the vault is silent, say so.**

A grounded refusal — "the vault has nothing on X" — is a correct, useful answer. An
invented citation is the worst possible output, because it wears the costume of the
system working.

## The four disciplines

**1. Every claim names its note.** When answering from the vault, quote or link the
specific note (`[[Quarterly accrual runs day 3]]`), not "the vault" in general. If you
cannot point at the note, you are recalling, not retrieving — stop and search, and if
the search comes up empty, report the gap instead of filling it.

**2. Label what kind of statement you are making.** Wiki notes tag every non-trivial
claim with its epistemic status:

| Label | Meaning | Requirement |
|---|---|---|
| **fact** | corroborated | ≥2 independent sources, or 1 authoritative system-of-record |
| **interpretation** | synthesis + judgment | names the facts it builds on |
| **hypothesis** | untested belief | states what evidence would settle it |
| **question** | open | nothing — it is honest about being open |

An LLM-curated wiki without these labels drifts into uniform confidence — every
sentence sounds equally true, which is exactly how readers get misled.

**3. Date facts bi-temporally.** For anything that can change, record *when it was true*
and *when it was learned*: "ARR definition per [[Metrics source doc]], as of 2026-08."
Volatile values (counts, statuses, prices) are stored as **pointers to their live
source, never as copied numbers** — a copied number is stale the moment it lands and
will be quoted back with confidence a year later. Facts with a shelf life get
`valid_until:` in frontmatter so the health pass can flag them at expiry.

**4. Supersede, never silently correct.** When a source note turns out wrong, the fix
is a new note with `supersedes: "[[old note]]"` and the old note marked
`status: superseded` — not an edit that rewrites history. Provenance is only worth
something if it cannot be quietly repainted.

## Reviewing an agent-written note

Before a synthesized note is promoted out of `_drafts/` (see `vault-gardener`), check:

- [ ] Every claim traces to a source note or is labeled interpretation/hypothesis
- [ ] No claim cites a source that doesn't actually support it (spot-check the worst one)
- [ ] Volatile values are pointers, not copies
- [ ] `source:` and `created:` frontmatter present; `valid_until:` where it applies
- [ ] Nothing in it contradicts an existing note — and if it does, the contradiction is
      surfaced as a question, not silently resolved by the newer note winning

## Honest limits

Grounding discipline makes fabrication *visible and checkable*; it does not make it
impossible. A well-organized vault does not by itself prove the agent used what it
retrieved — the citation-per-claim rule is what closes that gap, because it turns every
answer into something a human can audit in one click. Percentage claims about
hallucination reduction from any memory product are marketing until they cite a study
(see `docs/EVIDENCE.md`).

## Degraded mode

Needs nothing. This is entirely a writing discipline — it works in a chat message with
no tools at all: name your source or name your uncertainty.

## Related skills

- `vault-blueprint` — the immutable-sources layer these citations point into
- `vault-capture` — getting sources into the vault with provenance attached
- `vault-health` — the lint pass that finds uncited and expired claims
- `vault-gardener` — the promotion gate where this checklist runs
