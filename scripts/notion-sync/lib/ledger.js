'use strict';

const fs = require('fs');
const path = require('path');

// The sync ledger: one JSON file per vault recording, for every synced note,
// what both sides looked like at the last successful sync.
//
// The ledger is the arbiter of change state. Timestamps are advisory only
// (clock skew, and Notion touches last_edited_time on non-content operations);
// the hash pair is what decides. `notion_page_id` is also mirrored into each
// note's frontmatter for human visibility, but if ledger and frontmatter ever
// disagree, the ledger wins and the disagreement is reported, not guessed at.

const LEDGER_VERSION = 1;

function emptyLedger() {
  return { version: LEDGER_VERSION, notes: {} };
}

function load(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return emptyLedger();
  const raw = fs.readFileSync(ledgerPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed.version !== LEDGER_VERSION) {
    throw new Error(`ledger version ${parsed.version} not supported (expected ${LEDGER_VERSION})`);
  }
  return parsed;
}

function save(ledgerPath, ledger) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const tmp = `${ledgerPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, ledgerPath);
}

/** Return a NEW ledger with the entry for relPath replaced (never mutates). */
function withEntry(ledger, relPath, entry) {
  return {
    ...ledger,
    notes: { ...ledger.notes, [relPath]: { ...ledger.notes[relPath], ...entry } },
  };
}

/**
 * Classify a note's sync state from current hashes vs the ledger.
 * Every state names exactly one safe action; `conflict` names none on purpose.
 */
function classify(entry, currentLocalHash, currentRemoteHash) {
  if (!entry || !entry.pageId) return 'unlinked';
  const localChanged = currentLocalHash !== entry.lastLocalHash;
  const remoteChanged = currentRemoteHash !== entry.lastRemoteHash;
  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged) return 'push-pending';
  if (remoteChanged) return 'pull-pending';
  return 'in-sync';
}

module.exports = { LEDGER_VERSION, emptyLedger, load, save, withEntry, classify };
