# Evidence

What in this repo is backed by measurement, what is well-corroborated practice, and what
is marketing. Most token-savings and hallucination-reduction numbers circulating in the
vault-as-agent-memory space have **no shown methodology** — this file exists so vaultkit
never quotes one as fact.

Survey date: August 2026.

## Measured (methodology shown, reproducible)

| Finding | Source |
|---|---|
| A-MEM (atomic memory notes + links + memory evolution) scored F1 45.85 vs MemGPT 25.52 on multi-hop reasoning (GPT-4o-mini), while using 1,200–2,500 tokens vs 16,900 — better accuracy AND ~7–14x fewer tokens, across six foundation models | [A-MEM, NeurIPS 2025](https://arxiv.org/html/2502.12110v2) |
| Hybrid BM25 + small-embedding retrieval over a real 16,894-file vault: ~23ms end-to-end query, incremental reindex <10s, results truncated to a hard token budget | [blakecrosley.com/guides/obsidian](https://blakecrosley.com/guides/obsidian) |
| On a real ~2,350-note vault: keyword recall@10 = 100%, paraphrase recall@10 = 77%; multilingual embedding lifted non-English recall@5 from 13%→63% | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) |

## Corroborated practice (multiple independent sources; direction clear, magnitude unmeasured)

- **Lean always-loaded index + on-demand notes** beats a monolithic memory file. Unanimous
  across every efficiency writeup surveyed; mechanically true (you pay only for what you
  open). ([Firecrawl](https://www.firecrawl.dev/blog/claude-code-token-efficiency),
  [obsidian-mind](https://github.com/breferrari/obsidian-mind),
  [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f))
- **Three-layer architecture** — immutable raw sources / agent-owned wiki / schema doc —
  originated with Karpathy's LLM-wiki gist; independently implemented by the most popular
  AI-native vault repos ([claude-obsidian, 12.4k★](https://github.com/AgriciDaniel/claude-obsidian),
  [wuphf](https://github.com/nex-crm/wuphf), multiple llm-wiki reimplementations).
- **Citation-to-note discipline** ("quote the source note or don't claim it") as the core
  grounding rule ([slyapustin.com](https://slyapustin.com/blog/obsidian-llm-memory-organizer.html),
  [turbovault](https://github.com/epistates/turbovault) which tools exactly this).
- **Separate agent workspace from human-curated notes** — two independent failure reports
  of unsegmented vaults becoming noise/contaminated within weeks (Lyapustin;
  [agenticpm](https://agenticpm.substack.com/p/claude-code-obsidian-ai-second-brain) comments).
- **Promotion gate for agent writes** — draft zone → human review → canonical, with git
  as the audit trail ([wuphf](https://github.com/nex-crm/wuphf)'s notebook-promote ladder;
  claude-obsidian's approval hashes; Karpathy's "review the artifact, not the plan").
- **Prune / merge / refresh as the maintenance loop**, run in batch with oversight rather
  than continuously (Claude Code's own memory consolidation; dual-phase memory research,
  [arXiv 2603.10600](https://arxiv.org/pdf/2603.10600)).
- **Bi-temporal provenance** (when true vs when learned) and storing volatile values as
  pointers, not copies ([obsidian-second-brain's OKM spec](https://github.com/eugeniughelbur/obsidian-second-brain)).
- **Plain markdown as source of truth; every index a rebuildable cache** —
  [kepano's "File over app"](https://stephango.com/file-over-app); wuphf's
  "markdown is source of truth, indexes are rebuildable caches"; the
  [AGENTS.md](https://github.com/agentsmd/agents.md) convention (Linux Foundation
  stewarded) as the same idea at repo scale.

## Claimed (single source, no shown methodology — do not repeat as fact)

- "91.9% context reduction with no quality regression", "41% overhead reduction" (Firecrawl roundup)
- "94.5% input volume reduction", "$0.10/session" (Chase AI)
- "65% token reduction" (DEV.to piece — explicitly a projection, not a measurement, by its own text)
- "71.5x fewer tokens" / "499x per query" (claude-code-memory-setup — single case study by its own README)
- "Reduce hallucinations by 95%+" (mem0 marketing — the figure appears only in the page's meta description)
- "65% of enterprise AI agent failures are caused by context drift" (Atlan, uncited)
- "91% token reduction for database operations" (Notion's own MCP release notes, unverified independently)

None of these are necessarily false. They are unaudited, and a repo about grounding
should hold its own claims to the standard it preaches.

## Honest disagreements the community has not settled

vaultkit takes a default on each but documents the dissent; pretending consensus exists
would itself be an ungrounded claim.

| Question | Camp A | Camp B | vaultkit default |
|---|---|---|---|
| Folders | kepano: nearly none — a `categories` property + views; "many of my entries belong to more than one area" | PARA-style folders remain the most-cloned template shape; Nick Milo's ACE uses three cognitive-mode folders | Taxonomy is a **config mode** (per [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian)): switching changes where NEW notes go, never reorganizes old ones |
| Note size | Atomic single-concept notes retrieve better (A-MEM, Zettelkasten camp) | Topic-aggregated wiki pages enable contradiction detection across a topic; a few large "deep context" files (Miessler's Telos) minimize read count | Atomic by default, deliberate deep-context files allowed and marked |
| Indexes | Auto-generated views (Bases, generated MOCs) keep themselves honest | LYT: hand-curating MOCs is where the thinking happens | Automate inventory views; keep judgment MOCs by hand |
| Maintenance automation | Self-updating loops (this repo's gardener) | kepano declines to automate his own review ritual: the review is the point | Automate inventory + drafting; keep judgment + approval human |

## Security note

An agent-writable vault that also ingests untrusted web content and can sync outward
(Notion, Slack, email) is the "lethal trifecta" shape Simon Willison describes:
private-data access + untrusted-content exposure + external communication. vaultkit's
mitigations — immutable quarantined `sources/`, promotion gate before anything becomes
canonical, and outbound sync scoped to promoted folders only — are exactly the three
legs of that stool. Weakening any one of them re-opens the exfiltration path.
