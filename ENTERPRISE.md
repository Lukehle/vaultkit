# Running vaultkit on a managed / locked-down seat

vaultkit assumes the least-privileged environment by default: a managed Claude
Enterprise seat where an admin controls tool permissions, file access, MCP servers, and
network installs. Everything degrades deliberately rather than breaking.

## What each piece needs

| Piece | Needs | Degraded mode (built in, not an afterthought) |
|---|---|---|
| All 10 skills | nothing — they are conventions | Work as writing/working discipline even with zero tools; each SKILL.md ends with its degraded mode |
| `vault-lint` | Node ≥ 18, read access to the vault | No script execution → run the two error-class checks by hand at reduced scope, and say the pass was partial |
| `notion-sync` | Node ≥ 18, outbound HTTPS to api.notion.com, a Notion internal-integration token | No token/network → `push --emit <dir>` produces paste-ready markdown; a human pastes. Read-only token → same plus a diff |
| Obsidian app layer | the Obsidian app | Entirely optional — the vault is a folder of .md files; git + any editor is a full substitute |

Both scripts are **zero-dependency on purpose**: no `npm install`, no lockfile, no
postinstall hooks — the whole supply chain is the Node runtime the machine already has.

## Tokens and secrets on a work machine

- The Notion token is a workspace credential. It goes in `.env` (gitignored) or the
  OS credential store — never in the vault, never in `vaultkit.sync.json`, never in a
  note. `vault-lint` errors on secret patterns in notes as a backstop, but the backstop
  is not the control.
- Prefer a **dedicated internal integration** shared with only the mirror's parent
  page, so the blast radius of a leaked token is the mirror, not the workspace.
- If your org provides Notion through a claude.ai connector instead: the connector is
  account-bound and fine for interactive reads, but scheduled/headless sync needs the
  API token. Ask your admin which is sanctioned before wiring either.

## Policy questions to settle with your admin before adopting

1. May an agent write to a shared Notion workspace at all? (The promotion gate and
   scoped `syncRoots` are your answer to "under what controls.")
2. Where may the vault live — local disk, corporate OneDrive/Drive sync, a git remote?
   (git is the audit trail vaultkit assumes; a corporate GitHub/GitLab is ideal.)
3. Is web clipping into `sources/` acceptable? (See the lethal-trifecta note in
   `docs/EVIDENCE.md` — quarantined sources + gated promotion + scoped outbound sync
   are the three controls that make the answer defensibly yes.)

## Installing without a plugin marketplace

If `/plugin marketplace add` is blocked, copy the tree: `skills/` into
`~/.claude/skills/` (or the project's `.claude/skills/`), `commands/` likewise, and run
scripts by path. `install.sh` / `install.ps1` do exactly this and nothing else — no
network, no package manager.
