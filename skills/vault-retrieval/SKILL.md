---
name: vault-retrieval
description: Retrieve from a markdown vault at minimum token cost - index-first navigation, search-before-read, tiered loading with a budget, and never re-deriving what a note already holds. Use whenever answering from a vault, loading context at session start, or noticing context growing faster than understanding. Trigger on "check the vault", "what do we know about", "load context", "token cost", "context is getting long", "search my notes".
---

# Vault retrieval

The vault saves tokens only if you read it like an index, not like a book. The failure
mode is loading folders "for context"; the discipline is three tiers:

| Tier | What | When loaded | Budget |
|---|---|---|---|
| **HOT** | `VAULT.md` + `INDEX.md` | every session, first | ~500 tokens each, enforced by keeping the files that size |
| **WARM** | notes the current task names | on demand, after search | only what the question needs |
| **COLD** | sources, archive, everything else | explicit search hit only | never bulk-loaded |

## The retrieval sequence

1. **Read the index, not the folder.** `INDEX.md` → the one relevant MOC → the note.
   Three hops, three small files.
2. **Search before reading.** Grep/filename/frontmatter search across the vault costs
   almost nothing and tells you *which* note to open. Opening five notes to find the
   right one costs five notes.
3. **Read the section, not the file.** If the note is long and you need one section,
   fetch that section. (With the Obsidian REST/MCP layer, prefer targeted reads over
   whole-file dumps; with plain files, read with offset/limit.)
4. **Stop at the first sufficient note.** The goal is the answer with a citation, not a
   literature review. If one note answers with a source link, you are done.
5. **Never re-derive what a note holds.** If the vault records a decision, a threshold,
   a mapping — quote it. Re-deriving silently produces a *different* answer that looks
   equally confident (see `vault-checkpoint` for why this is the expensive failure).

## Reducing before loading

Never put data into context that a script could reduce first:

- A question over many notes ("how many open projects?") is a one-line script or a
  saved Base view, not a folder read.
- Web content headed for the vault gets extracted to clean markdown first (readability
  extraction), not fetched raw — raw HTML is mostly token-shaped noise.
- Long tool output goes to a file; the conversation gets the distilled conclusion.

## Indexes are caches

Any index — `INDEX.md`, a search index, embeddings if you add them — is a **rebuildable
cache over the markdown, never the truth**. This has a practical edge: when an index
disagrees with a note, the note wins, and the index gets rebuilt. Never patch the index
to match a conclusion.

## Measured limits of structure-only retrieval

The numbers in `docs/EVIDENCE.md` cut both ways and belong here: on a real ~2,350-note
vault, keyword recall@10 was 100% — but **paraphrase recall@10 was 77%**, and
non-English recall@5 was 13% until a multilingual embedding model lifted it to 63%.
Translation: roughly one in four questions phrased differently from the notes' own
words will come back "not in the vault" when it is. Treat a failed lookup on a
paraphrased question as *unproven absence*: retry with the vault's own vocabulary
(check the index and MOC headings for the terms the notes actually use). A local
hybrid search index (BM25 + small embeddings) is a **legitimate optional layer** for
vaults where this bites — it stays a rebuildable cache over the markdown, never the
truth, exactly like every other index.

## What this skill does NOT claim

Community posts advertise specific savings ("94% reduction", "71x fewer tokens").
Treat all such magnitudes as unverified marketing — see `docs/EVIDENCE.md` in this
repo for which numbers actually have methodology behind them. The *direction* is
unanimous and mechanical: index-first beats bulk-load because you pay only for what
you open. Measure your own sessions if you need a number.

## Degraded mode

No search tooling: the index IS the search. This is why the index and MOC files exist
even though they are "redundant" with the folder tree — on the most locked-down seat,
navigation by small curated files is the whole retrieval system, and it still works.

## Related skills

- `vault-blueprint` — the structure that makes index-first possible
- `vault-checkpoint` — externalizing state so context can be cleared freely
- `grounded-claims` — what to do with the note once retrieved
