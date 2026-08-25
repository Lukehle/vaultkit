'use strict';

const fs = require('fs');
const path = require('path');
const fm = require('./frontmatter');
const { hash } = require('./normalize');
const { toNotion, fromNotion, notionPageUrl } = require('./preprocess');
const ledgerLib = require('./ledger');

// Sync engine. Vault-canonical: the vault is the source of truth for structure
// and authoring; Notion is a mirror of an explicitly-scoped subset.
//
// Rules the engine enforces (not merely documents):
//   1. The hash pair decides state; timestamps only skip redundant fetches.
//   2. A conflict (both sides changed) is a hard stop for that note. No merge.
//   3. Local hashes cover the BODY only, so frontmatter edits never push.
//   4. Every remote write is verified by reading the page back; the read-back,
//      not the write payload, is what the ledger records as remote state.
//   5. Pull replaces the body and preserves local frontmatter untouched.

function loadConfig(vaultRoot) {
  const configPath = path.join(vaultRoot, 'vaultkit.sync.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`no vaultkit.sync.json in ${vaultRoot} — run: notion-sync init`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Array.isArray(config.syncRoots) || config.syncRoots.length === 0) {
    throw new Error('vaultkit.sync.json must set syncRoots: at least one folder to mirror');
  }
  return {
    vaultRoot,
    syncRoots: config.syncRoots,
    ledgerPath: path.join(vaultRoot, config.ledger || '.vaultkit/sync-ledger.json'),
    tokenEnv: config.tokenEnv || 'NOTION_TOKEN',
    parentPageId: config.parentPageId || null,
  };
}

function localBody(vaultRoot, relPath) {
  const content = fs.readFileSync(path.join(vaultRoot, relPath), 'utf8');
  return fm.split(content).body;
}

function listSyncableNotes(config) {
  const found = [];
  for (const root of config.syncRoots) {
    const abs = path.join(config.vaultRoot, root);
    if (!fs.existsSync(abs)) continue;
    walk(abs, (file) => {
      if (file.endsWith('.md')) found.push(path.relative(config.vaultRoot, file).split(path.sep).join('/'));
    });
  }
  return found.sort();
}

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== '_sync-conflicts') walk(full, onFile);
    } else {
      onFile(full);
    }
  }
}

function idMaps(ledger) {
  const byName = {};
  const nameById = {};
  for (const [relPath, entry] of Object.entries(ledger.notes)) {
    if (!entry.pageId) continue;
    const name = path.basename(relPath, '.md');
    byName[name.toLowerCase()] = entry.pageId;
    nameById[entry.pageId.replace(/-/g, '')] = name;
  }
  return { byName, nameById };
}

/** Fetch remote hash, using last_edited_time to skip the markdown fetch when possible. */
async function remoteState(client, entry) {
  const page = await client.retrievePage(entry.pageId);
  if (page.last_edited_time && page.last_edited_time === entry.lastRemoteEditedTime) {
    return { remoteHash: entry.lastRemoteHash, lastEditedTime: page.last_edited_time, markdown: null };
  }
  const markdown = await client.getPageMarkdown(entry.pageId);
  return { remoteHash: hash(markdown), lastEditedTime: page.last_edited_time, markdown };
}

/** Compute per-note states. Read-only; safe to run any time. */
async function status(config, client) {
  const ledger = ledgerLib.load(config.ledgerPath);
  const rows = [];
  for (const relPath of listSyncableNotes(config)) {
    const entry = ledger.notes[relPath];
    if (!entry || !entry.pageId) {
      rows.push({ relPath, state: 'unlinked' });
      continue;
    }
    const currentLocalHash = hash(localBody(config.vaultRoot, relPath));
    const remote = await remoteState(client, entry);
    rows.push({ relPath, state: ledgerLib.classify(entry, currentLocalHash, remote.remoteHash) });
  }
  for (const relPath of Object.keys(ledger.notes)) {
    if (!fs.existsSync(path.join(config.vaultRoot, relPath))) {
      rows.push({ relPath, state: 'missing-local' });
    }
  }
  return rows;
}

/** Push one note. Refuses conflicts unless force === 'take-local'. */
async function pushNote(config, client, relPath, { force = null } = {}) {
  let ledger = ledgerLib.load(config.ledgerPath);
  const entry = ledger.notes[relPath];
  if (!entry || !entry.pageId) throw new Error(`${relPath} is not linked to a Notion page — run: link or push --new`);

  const body = localBody(config.vaultRoot, relPath);
  const currentLocalHash = hash(body);
  const remote = await remoteState(client, entry);
  const state = ledgerLib.classify(entry, currentLocalHash, remote.remoteHash);

  if (state === 'in-sync') return { relPath, action: 'skip', reason: 'in-sync' };
  if (state === 'pull-pending') return { relPath, action: 'skip', reason: 'remote is newer — pull first' };
  if (state === 'conflict' && force !== 'take-local') {
    return { relPath, action: 'conflict', reason: 'both sides changed since last sync; resolve explicitly' };
  }

  const { byName } = idMaps(ledger);
  const { markdown, warnings } = toNotion(body, byName);
  await client.patchPageMarkdown(entry.pageId, markdown);

  // Read-back verification: the ledger records what Notion now actually serves.
  const readBack = await client.getPageMarkdown(entry.pageId);
  const page = await client.retrievePage(entry.pageId);
  ledger = ledgerLib.withEntry(ledger, relPath, {
    lastLocalHash: currentLocalHash,
    lastRemoteHash: hash(readBack),
    lastRemoteEditedTime: page.last_edited_time,
    lastSyncedAt: new Date().toISOString(),
  });
  ledgerLib.save(config.ledgerPath, ledger);
  return { relPath, action: 'pushed', warnings };
}

/** Pull one note. Replaces body, preserves frontmatter. Refuses conflicts unless force === 'take-remote'. */
async function pullNote(config, client, relPath, { force = null } = {}) {
  let ledger = ledgerLib.load(config.ledgerPath);
  const entry = ledger.notes[relPath];
  if (!entry || !entry.pageId) throw new Error(`${relPath} is not linked to a Notion page`);

  const absPath = path.join(config.vaultRoot, relPath);
  const original = fs.readFileSync(absPath, 'utf8');
  const currentLocalHash = hash(fm.split(original).body);
  const remote = await remoteState(client, entry);
  const state = ledgerLib.classify(entry, currentLocalHash, remote.remoteHash);

  if (state === 'in-sync') return { relPath, action: 'skip', reason: 'in-sync' };
  if (state === 'push-pending') return { relPath, action: 'skip', reason: 'local is newer — push instead' };
  if (state === 'conflict' && force !== 'take-remote') {
    return { relPath, action: 'conflict', reason: 'both sides changed since last sync; resolve explicitly' };
  }

  const markdown = remote.markdown === null ? await client.getPageMarkdown(entry.pageId) : remote.markdown;
  const { nameById } = idMaps(ledger);
  const { body, warnings } = fromNotion(markdown, nameById);
  const { frontmatterText } = fm.split(original);
  const next = frontmatterText === null ? body : `---\n${frontmatterText}\n---\n${body}`;
  fs.writeFileSync(absPath, next, 'utf8');

  ledger = ledgerLib.withEntry(ledger, relPath, {
    lastLocalHash: hash(body),
    lastRemoteHash: hash(markdown),
    lastRemoteEditedTime: remote.lastEditedTime,
    lastSyncedAt: new Date().toISOString(),
  });
  ledgerLib.save(config.ledgerPath, ledger);
  return { relPath, action: 'pulled', warnings };
}

/** Create a Notion page for an unlinked note and record the link in ledger + frontmatter. */
async function createAndLink(config, client, relPath) {
  if (!config.parentPageId) throw new Error('set parentPageId in vaultkit.sync.json to create new pages');
  let ledger = ledgerLib.load(config.ledgerPath);
  if (ledger.notes[relPath] && ledger.notes[relPath].pageId) {
    return { relPath, action: 'skip', reason: 'already linked' };
  }
  const absPath = path.join(config.vaultRoot, relPath);
  const original = fs.readFileSync(absPath, 'utf8');
  const body = fm.split(original).body;
  const title = path.basename(relPath, '.md');
  const { byName } = idMaps(ledger);
  const { markdown, warnings } = toNotion(body, byName);

  const page = await client.createPage(config.parentPageId, title, markdown);
  const readBack = await client.getPageMarkdown(page.id);
  const meta = await client.retrievePage(page.id);

  ledger = ledgerLib.withEntry(ledger, relPath, {
    pageId: page.id,
    lastLocalHash: hash(body),
    lastRemoteHash: hash(readBack),
    lastRemoteEditedTime: meta.last_edited_time,
    lastSyncedAt: new Date().toISOString(),
  });
  ledgerLib.save(config.ledgerPath, ledger);

  let next = fm.set(original, 'notion_page_id', page.id);
  next = fm.set(next, 'notion_url', notionPageUrl(page.id));
  fs.writeFileSync(absPath, next, 'utf8');
  return { relPath, action: 'created', pageId: page.id, warnings };
}

/** Degraded mode: no token. Emit paste-ready Notion markdown for a human to paste. */
function emitNote(config, relPath, outDir) {
  const ledger = ledgerLib.load(config.ledgerPath);
  const body = localBody(config.vaultRoot, relPath);
  const { byName } = idMaps(ledger);
  const { markdown, warnings } = toNotion(body, byName);
  const outPath = path.join(outDir, `${path.basename(relPath, '.md')}.notion.md`);
  fs.mkdirSync(outDir, { recursive: true });
  const header = `<!-- vaultkit: paste-ready for Notion | source: ${relPath} | generated: ${new Date().toISOString()} -->\n\n`;
  fs.writeFileSync(outPath, header + markdown, 'utf8');
  return { relPath, action: 'emitted', outPath, warnings };
}

module.exports = { loadConfig, listSyncableNotes, status, pushNote, pullNote, createAndLink, emitNote, idMaps };
