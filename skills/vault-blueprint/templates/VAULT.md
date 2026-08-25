# VAULT.md — operating manual for agents

<!-- Copy this file to your vault root and edit. Keep it under ~500 tokens:
     it is loaded every session, so every word here is paid on every turn. -->

**Mode:** para  <!-- flat | ace | para | zettelkasten — governs where NEW notes go -->

## Map

| Path | What | Agent may |
|---|---|---|
| `INDEX.md` | root index — read this first | update |
| `sources/` | immutable captures (web, meetings, docs) | create only — NEVER edit |
| `wiki/` | synthesized notes citing sources | create/edit via promotion gate |
| `projects/` | active work, one note per project | edit own zones |
| `daily/` | `YYYY-MM-DD.md` logs | append only |
| `_drafts/` | agent scratch space | anything |
| `archive/` | retired notes | move things here — never delete |

## Rules

1. Answer from the vault; cite the note. If the vault doesn't cover it, say so —
   a grounded refusal beats an invented citation.
2. Read `INDEX.md`, then fetch only the notes you need. Never bulk-load folders.
3. Sources are immutable. To correct one, add a new note with `supersedes:` set.
4. Draft in `_drafts/`; promotion into `wiki/` requires human approval.
5. Never delete — move to `archive/`. Never rename folders.
6. No secrets in any note, ever. Reference `.env` slot names instead.
7. Frontmatter contract: `type`, `status`, `created`, `source`, `related` — no new
   fields without editing this file.
