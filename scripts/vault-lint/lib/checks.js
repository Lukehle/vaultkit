'use strict';

// Deterministic vault health checks. Two severities:
//   error   — feeds exit code 1; things that actively corrupt agent grounding
//             (secrets, broken links the agent will follow into nothing)
//   warning — hygiene the gardener pass should look at
//
// Every check is mechanical on purpose. Judgment calls (is this note WRONG?)
// belong to an LLM gardening pass with a human gate — not to a linter.

const SECRET_PATTERNS = [
  { name: 'openai/anthropic-style key', re: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'PEM private key', re: /-----BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /ghp_[A-Za-z0-9]{30,}/ },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'bearer token', re: /bearer\s+[A-Za-z0-9+/=_.-]{30,}/i },
  { name: 'credential assignment', re: /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9+/=_.-]{16,}/i },
];

const DEFAULTS = {
  requiredFrontmatter: ['type'],
  staleDays: 180,
  staleRoots: ['wiki', '04 - Knowledge'],
  maxNoteBytes: 32 * 1024,
  indexCandidates: ['INDEX.md', 'Home.md', 'index.md'],
};

function runChecks(notes, options = {}) {
  const opts = { ...DEFAULTS, ...options, now: options.now || Date.now() };
  const findings = [];
  const nameIndex = buildNameIndex(notes);
  const inbound = countInbound(notes, nameIndex);

  for (const note of notes) {
    checkSecrets(note, findings);
    checkFrontmatter(note, opts, findings);
    checkLinks(note, nameIndex, findings);
    checkOrphan(note, inbound, findings);
    checkStale(note, opts, findings);
    checkSize(note, opts, findings);
  }
  checkIndex(notes, opts, findings);
  return findings;
}

function buildNameIndex(notes) {
  const index = new Map();
  for (const note of notes) {
    index.set(note.name.toLowerCase(), note);
    index.set(note.relPath.replace(/\.md$/, '').toLowerCase(), note);
  }
  return index;
}

function countInbound(notes, nameIndex) {
  const inbound = new Map();
  for (const note of notes) {
    for (const target of note.links) {
      const hit = nameIndex.get(target.toLowerCase());
      if (hit && hit.relPath !== note.relPath) inbound.set(hit.relPath, (inbound.get(hit.relPath) || 0) + 1);
    }
  }
  return inbound;
}

function checkSecrets(note, findings) {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(note.content)) {
      findings.push({ severity: 'error', check: 'secret', relPath: note.relPath, detail: `possible ${name} — a vault is synced, rendered, and quoted; rotate and move to .env` });
    }
  }
}

// VAULT.md is the schema/operating doc: reached by convention (agents read it by
// path), not by links, and it deliberately spends no tokens on frontmatter.
function isOperatingDoc(note) {
  return /(^|\/)VAULT\.md$/.test(note.relPath);
}

function checkFrontmatter(note, opts, findings) {
  if (isOperatingDoc(note)) return;
  if (note.frontmatter === null) {
    findings.push({ severity: 'warning', check: 'frontmatter-missing', relPath: note.relPath, detail: 'no frontmatter block' });
    return;
  }
  for (const key of opts.requiredFrontmatter) {
    if (!(key in note.frontmatter) || note.frontmatter[key] === '') {
      findings.push({ severity: 'warning', check: 'frontmatter-incomplete', relPath: note.relPath, detail: `missing required key: ${key}` });
    }
  }
}

function checkLinks(note, nameIndex, findings) {
  for (const target of note.links) {
    if (isExternalish(target)) continue;
    if (!nameIndex.has(target.toLowerCase())) {
      findings.push({ severity: 'error', check: 'broken-wikilink', relPath: note.relPath, detail: `[[${target}]] resolves to nothing — an agent following it retrieves nothing and may improvise instead` });
    }
  }
}

function isExternalish(target) {
  return /\.(png|jpg|jpeg|gif|svg|pdf|mp4|mp3|webp|canvas|base)$/i.test(target);
}

function checkOrphan(note, inbound, findings) {
  const isIndexish = /(^|\/)(index|home|readme|moc[^/]*)\.md$/i.test(note.relPath) || /^\d{4}-\d{2}-\d{2}/.test(note.name);
  if (isIndexish || isOperatingDoc(note)) return;
  if ((inbound.get(note.relPath) || 0) === 0 && note.links.length === 0) {
    findings.push({ severity: 'warning', check: 'orphan', relPath: note.relPath, detail: 'no links in or out — unreachable by graph traversal, invisible to index-first retrieval' });
  }
}

function checkStale(note, opts, findings) {
  const inStaleScope = opts.staleRoots.some((root) => note.relPath.toLowerCase().startsWith(root.toLowerCase()));
  if (!inStaleScope) return;
  const ageDays = (opts.now - note.mtimeMs) / 86400000;
  if (ageDays > opts.staleDays) {
    findings.push({ severity: 'warning', check: 'stale', relPath: note.relPath, detail: `untouched for ${Math.floor(ageDays)} days — review or mark reviewed; unreviewed facts decay into confident fiction` });
  }
}

function checkSize(note, opts, findings) {
  if (note.sizeBytes > opts.maxNoteBytes) {
    findings.push({ severity: 'warning', check: 'oversized', relPath: note.relPath, detail: `${(note.sizeBytes / 1024).toFixed(0)}KB — too large to be a retrieval unit; split at concept boundaries` });
  }
}

function checkIndex(notes, opts, findings) {
  const hasIndex = notes.some((n) => opts.indexCandidates.includes(n.relPath));
  if (!hasIndex) {
    findings.push({ severity: 'warning', check: 'no-index', relPath: '(vault root)', detail: `no root index found (looked for: ${opts.indexCandidates.join(', ')}) — index-first retrieval has no entry point` });
  }
}

module.exports = { runChecks, SECRET_PATTERNS, DEFAULTS };
