'use strict';

const fs = require('fs');
const path = require('path');

// Vault scanner: one pass over every .md file, producing the model the checks
// run against. Read-only by design — lint reports, it never fixes.

const DEFAULT_IGNORE = new Set(['.git', '.obsidian', '.vaultkit', 'node_modules', '_sync-conflicts']);

function scanVault(vaultRoot, { ignore = DEFAULT_IGNORE } = {}) {
  const notes = [];
  walk(vaultRoot, vaultRoot, ignore, notes);
  return notes;
}

function walk(root, dir, ignore, notes) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, ignore, notes);
    } else if (entry.name.endsWith('.md')) {
      notes.push(readNote(root, full));
    }
  }
}

function readNote(root, absPath) {
  const content = fs.readFileSync(absPath, 'utf8');
  const stat = fs.statSync(absPath);
  const relPath = path.relative(root, absPath).split(path.sep).join('/');
  return {
    relPath,
    name: path.basename(relPath, '.md'),
    content,
    frontmatter: parseFrontmatterKeys(content),
    links: extractWikilinks(content),
    mtimeMs: stat.mtimeMs,
    sizeBytes: stat.size,
  };
}

/** Top-level frontmatter keys -> raw string values (tolerant, read-only). */
function parseFrontmatterKeys(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const keys = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kv) keys[kv[1]] = kv[2].trim();
  }
  return keys;
}

/** All wikilink targets in the body (embeds included), heading/block refs stripped. */
function extractWikilinks(content) {
  const targets = [];
  const re = /!?\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) targets.push(m[1].trim());
  return targets;
}

module.exports = { scanVault, parseFrontmatterKeys, extractWikilinks };
