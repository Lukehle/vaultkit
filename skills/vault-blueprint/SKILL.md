---
name: vault-blueprint
description: Design or restructure a plain-markdown vault so an AI agent can ground itself in it cheaply and accurately - the three-layer architecture (immutable sources, agent-owned wiki, schema doc), a pluggable folder taxonomy, minimal frontmatter, and a lean root index. Use when creating a vault, onboarding an agent to an existing vault, or deciding where a note belongs. Trigger on "set up a vault", "vault structure", "where should this note go", "new knowledge base", "organize my notes", "second brain structure".
---

# Vault blueprint

A vault an agent can trust has three layers, in the pattern Karpathy called the LLM Wiki
(and half the ecosystem now implements):

| Layer | Folder | Who writes it | Mutability |
|---|---|---|---|
| **Sources** | `sources/` | humans + clippers | **Immutable after capture.** Never edited, only superseded. |
| **Wiki** | `wiki/` | the agent (gated) | Synthesized notes that cite sources. Rewritten as understanding improves. |
| **Schema** | `VAULT.md` (root) | humans | The operating manual: what lives where, what the agent may touch, the frontmatter contract. |

The split is the hallucination control. Sources are ground truth and never drift; the wiki
must cite them; the schema doc makes the agent a disciplined maintainer instead of a
freestyle note-taker. An agent that edits a source note to "fix" it has destroyed
provenance — that is the one unrecoverable mistake this structure exists to prevent.

`VAULT.md` is to a vault what `AGENTS.md` is to a repo: one plain-markdown file at a
predictable path that any agent reads first. Copy `templates/VAULT.md` and edit it —
keep it under ~500 tokens. It is loaded every session; every token in it is paid on
every turn forever.

---

## Taxonomy is a mode, not a doctrine

The community's top voices genuinely disagree about folders, so vaultkit does not pick a
winner. Pick one mode in `VAULT.md`, and know that switching modes later changes where
NEW notes go — it never silently reorganizes old ones.

| Mode | Shape | Strongest advocate | Best when |
|---|---|---|---|
| **flat** | Nearly no folders; a `categories` frontmatter property + index views replace folder membership | kepano (Obsidian's CEO runs his own vault this way) | Notes belong to more than one area; you query by property |
| **ace** | Three folders by cognitive mode: `atlas/` (understanding), `calendar/` (time-bound), `efforts/` (action) | Nick Milo (LYT) | You think in "what am I doing right now" terms |
| **para** | Numbered lifecycle folders: inbox, daily, projects, knowledge, templates, archive | Tiago Forte lineage; the most-cloned shape on GitHub | Teams, and agents that route by folder rules |
| **zettelkasten** | Atomic notes, dense links, IDs | classic PKM | Research-heavy corpora |

Whatever the mode, three locations always exist: **`sources/` (immutable), `wiki/` (agent
workspace), and a scratch zone `_drafts/`** where the agent writes freely before anything
is promoted to the canonical tree (see `vault-gardener` for the promotion gate).

## Frontmatter: minimal, closed, boring

Every agent-created note carries exactly this — and resists growing more fields, because
every field is a token tax on every retrieval and an invitation to inconsistency:

```yaml
---
type: source | wiki | project | daily | decision
status: draft | active | verified | superseded
created: 2026-08-25
source: <url or [[source-note]], required for type: source and any wiki claim-bearer>
related: ["[[Sibling]]", "[[Parent topic]]"]
---
```

`related` duplicates 3–5 key links into frontmatter so an agent can walk the graph
without reading bodies. Dates are always `YYYY-MM-DD`. Tags are optional; if used, they
are a list even when single-valued, so queries never special-case.

## Naming

- Note titles are **declarative and self-standing**: `Quarterly accrual runs day 3.md`,
  not `Accruals.md`. A title an agent can quote as a claim is a title that retrieves well.
- Daily notes: `YYYY-MM-DD.md`. Sources keep capture date in frontmatter, not filename.
- One concept per note, roughly 200–800 words. A note too big to be a retrieval unit
  gets split at concept boundaries (`vault-lint` flags oversized notes).
- The size rule is a default, not a law: a deliberately large "deep context" file (a
  project charter, a persona doc) is legitimate — mark it `type: project` and link it
  from the index rather than splitting it artificially.

## The root index

One `INDEX.md` (or `Home.md`) at the vault root: a short annotated map — one line per
area, linking to domain MOCs, which link to notes. Three hops maximum from index to any
note. The index is a **disposable cache over the markdown, never the truth**: if it
burns down, the notes rebuild it. That is also the answer to "why not a vector DB" —
plain files are the source of truth; any index (this file, search, embeddings) must be
rebuildable from them. Structure-only retrieval has measured limits on paraphrased
questions — see `vault-retrieval` for the numbers and the optional hybrid-index layer.

## Obsidian-app-native layer (optional)

Everything above works on a bare folder. If the Obsidian app is available, add — don't
depend on:
- **Bases** (`.base` files): saved filtered views that auto-maintain what a hand-curated
  MOC does manually (a "stale notes" view, an "active projects" view). Note the honest
  dissent: the LYT school holds that hand-curating MOCs is where the thinking happens.
  Automate the inventory views; keep judgment MOCs by hand if they earn their upkeep.
- **Canvas** for spatial maps; the graph view for link inspection.
- The Local REST API / MCP plugins for programmatic access — see `zone-writer` for the
  multi-instance port gotcha before trusting them with writes.

## Degraded mode

No file-write access: produce the blueprint as a message — the folder list, the
`VAULT.md` text, and the first index — for the user to create by hand. The architecture
is conventions, not tooling; it works pasted.

## Related skills

- `vault-capture` — how notes enter the structure
- `vault-retrieval` — how the index and layers keep context small
- `grounded-claims` — the citation discipline the wiki layer enforces
- `vault-gardener` — the promotion gate between `_drafts/` and canonical folders
- `vault-health` — the lint pass that keeps the structure true
