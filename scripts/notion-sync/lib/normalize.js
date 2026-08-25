'use strict';

const crypto = require('crypto');

// Content hashing for change detection.
//
// Hashes are compared across two systems that disagree about whitespace:
// local files may be CRLF (Windows) while Notion always emits LF, and Notion's
// markdown renderer trims trailing spaces. An un-normalized hash reports a
// phantom "change" on every run from a Windows machine — so normalization is
// not cosmetic, it is what makes the ledger's no-op detection work at all.

/** Canonical form used for all hashing: LF newlines, no trailing whitespace, single trailing \n. */
function normalize(text) {
  const lf = String(text).replace(/\r\n?/g, '\n');
  const trimmed = lf
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
  return trimmed.replace(/\n*$/, '\n');
}

/** SHA-256 of the normalized text, hex. */
function hash(text) {
  return crypto.createHash('sha256').update(normalize(text), 'utf8').digest('hex');
}

module.exports = { normalize, hash };
