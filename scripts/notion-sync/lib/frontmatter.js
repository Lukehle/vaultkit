'use strict';

// Minimal, lossless frontmatter handling.
//
// Design constraint: vaultkit only OWNS a handful of frontmatter keys
// (notion_page_id, notion_url). Everything else in the frontmatter block is
// user territory, so we never parse-and-reserialize the whole block (lossy).
// Reads are a tolerant parse; writes are surgical text edits that leave every
// other line byte-for-byte intact.

const FM_OPEN = /^---\r?\n/;

/** Split a note into { frontmatterText, body }. frontmatterText is null when absent. */
function split(content) {
  if (!FM_OPEN.test(content)) return { frontmatterText: null, body: content };
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatterText: null, body: content };
  return { frontmatterText: m[1], body: content.slice(m[0].length) };
}

/** Tolerant scalar read: returns the raw string value for a top-level key, or null. */
function get(content, key) {
  const { frontmatterText } = split(content);
  if (frontmatterText === null) return null;
  const re = new RegExp(`^${key}\\s*:\\s*(.*)$`, 'm');
  const m = frontmatterText.match(re);
  if (!m) return null;
  const raw = m[1].trim();
  return stripQuotes(raw) || null;
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Set (or insert) a top-level scalar key, returning new content.
 * Creates a frontmatter block if the note has none. Never touches other lines.
 */
function set(content, key, value) {
  const line = `${key}: ${value}`;
  const { frontmatterText, body } = split(content);
  if (frontmatterText === null) {
    return `---\n${line}\n---\n${content}`;
  }
  const re = new RegExp(`^${key}\\s*:.*$`, 'm');
  const nextFm = re.test(frontmatterText)
    ? frontmatterText.replace(re, line)
    : `${frontmatterText}\n${line}`;
  return `---\n${nextFm}\n---\n${body}`;
}

/** Remove a top-level scalar key, returning new content. */
function remove(content, key) {
  const { frontmatterText, body } = split(content);
  if (frontmatterText === null) return content;
  const lines = frontmatterText.split(/\r?\n/).filter((l) => !new RegExp(`^${key}\\s*:`).test(l));
  if (lines.length === 0) return body;
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

module.exports = { split, get, set, remove };
