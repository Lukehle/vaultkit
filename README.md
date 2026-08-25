# vaultkit

Run a plain-markdown vault (Obsidian-compatible, no app required) as an AI agent's
grounding memory — **cut token cost** with index-first tiered retrieval, **cut
hallucination** with citation-to-note discipline, **mirror to Notion** through a tested
conflict-safe sync engine, and **keep the vault healthy** with an approval-gated
self-maintenance loop.

`AGENTS.md` gave repos a plain-markdown grounding file at a predictable path. vaultkit
is the same idea at knowledge-base scale: a `VAULT.md` operating manual, a structure
agents can navigate cheaply, and the write disciplines that keep an agent from
corrupting the memory it depends on.

Built for the least-privileged environment: a managed Enterprise seat with no MCP
servers, no npm installs, and admin-controlled permissions. Everything here degrades
deliberately (see [ENTERPRISE.md](ENTERPRISE.md)); the scripts are zero-dependency
Node ≥ 18.

## The ideas, in one pass

1. **Three layers** (after Karpathy's LLM-wiki pattern): immutable `sources/` humans
   and clippers feed → an agent-maintained `wiki/` that must cite them → a ≤500-token
   `VAULT.md` schema doc loaded every session. Sources never drift; the wiki has
   receipts; the schema makes the agent a disciplined maintainer.
2. **Index-first retrieval**: a lean root index → domain MOC → note, three hops, search
   before reading, budget on what returns. You pay only for what you open. Every index
   is a rebuildable cache; the markdown is the truth.
3. **Cite or say so**: every claim names its note; the vault being silent is a
   reportable answer ("grounded refusal beats invented citation"); claims carry
   epistemic labels (fact / interpretation / hypothesis / question) and bi-temporal
   dates; volatile values are pointers, never copies.
4. **Agents draft, humans promote**: agent writes land in `_drafts/`; promotion to the
   canonical tree is a reviewed, gated, git-committed step. This one gate is the
   difference between a self-updating vault and a self-corrupting one.
5. **One writer per zone** on every shared surface (vault notes, Notion pages):
   marker-delimited sections, content fingerprints for idempotency and clobber
   detection, read-before-write, verify-by-read-back.
6. **Vault-canonical Notion mirror**: an explicitly-scoped folder set syncs; hashes
   (not timestamps) decide state; both-sides-changed is a hard stop, never a merge;
   dry-run is the default for everything.

## What's in the box

**10 skills** (`skills/`) — each with a degraded mode for locked-down seats:

| Skill | One line |
|---|---|
| `vault-blueprint` | Three-layer structure, pluggable taxonomy (flat / ace / para / zettelkasten), minimal frontmatter, `VAULT.md` + `INDEX.md` templates |
| `vault-retrieval` | HOT/WARM/COLD tiered loading, search-first, never re-derive what a note holds |
| `grounded-claims` | Citation discipline, epistemic labels, bi-temporal dating, supersede-not-edit |
| `zone-writer` | The single-writer-zone contract for any shared document |
| `vault-safety` | Pre-write gate: no deletes, no blind overwrites, no folder renames, no secrets |
| `vault-health` | Running and interpreting the lint; staleness is a review flag, not a delete signal |
| `vault-gardener` | The prune/merge/refresh loop with the human promotion gate |
| `vault-capture` | Source-then-synthesis capture flow with provenance intact |
| `vault-checkpoint` | Externalize state so context can be cleared or compacted freely |
| `notion-sync` | Operating the mirror: scoping, the loop, conflicts, degraded paste mode |

**2 tested scripts** (`scripts/`, zero dependencies, Node ≥ 18):

- `notion-sync/` — the two-way mirror engine. 32 tests pin the safety behaviors:
  normalized hashing (no phantom changes from CRLF), conflict hard-stops, read-back
  verification, frontmatter-only edits never push, fresh links start in conflict on
  purpose. Design rationale in [docs/NOTION-SYNC.md](docs/NOTION-SYNC.md).
- `vault-lint/` — deterministic health checks (secrets, broken wikilinks, orphans,
  stale, oversized, missing frontmatter/index). 12 tests. Read-only, CI-friendly exit
  codes.

**3 commands** (`commands/`): `/vault-init`, `/vault-health`, `/vault-sync`.

**Evidence, honestly graded** ([docs/EVIDENCE.md](docs/EVIDENCE.md)): which practices
have measured backing, which are corroborated-but-unmeasured, which circulating numbers
are marketing — and the four genuine disagreements among the community's top voices
(folders vs flat, atomic vs deep-context notes, auto vs hand-curated indexes, how much
maintenance to automate) with vaultkit's default and the dissent both stated.

## Quickstart

```bash
# As a Claude Code plugin
/plugin marketplace add Lukehle/vaultkit

# Or copy the tree (no network, no package manager)
./install.sh          # or install.ps1 on Windows

# Scaffold a vault
/vault-init ~/vault

# Health check
node scripts/vault-lint/cli.js --vault ~/vault

# Notion mirror (token in .env as NOTION_TOKEN; dry-run by default)
node scripts/notion-sync/cli.js init   --vault ~/vault
node scripts/notion-sync/cli.js status --vault ~/vault
node scripts/notion-sync/cli.js push   --vault ~/vault --apply
```

Run the tests:

```bash
node --test scripts/notion-sync/test/unit.test.js scripts/notion-sync/test/sync.test.js
node --test scripts/vault-lint/test/lint.test.js
```

## Security

A vault that an agent writes to, that ingests untrusted web content, and that syncs
outward is the textbook data-exfiltration shape ("lethal trifecta"). vaultkit's three
standing controls: `sources/` is quarantined data (cited, never obeyed), nothing
reaches the canonical tree without human promotion, and outbound sync is scoped to
promoted folders only — never `sources/`, never `_drafts/`. Weakening any one re-opens
the path. Secrets never enter notes at all; `vault-lint` errors on key patterns as a
backstop.

## License

MIT
