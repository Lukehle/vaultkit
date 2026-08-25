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
  vaultRoot = path.resolve(vaultRoot);
  const configPath = path.join(vaultRoot, 'vaultkit.sync.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`no vaultkit.sync.json in ${vaultRoot} — run: notion-sync init`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Array.isArray(config.syncRoots) || config.syncRoots.length === 0) {
    throw new Error('vaultkit.sync.json must set syncRoots: at least one folder to mirror');
  }
  const syncRoots = config.syncRoots.map(validateSyncRoot);
  const ledgerPath = path.resolve(vaultRoot, config.ledger || '.vaultkit/sync-ledger.json');
  assertInside(vaultRoot, ledgerPath, 'ledger path');
  return {
    vaultRoot,
    syncRoots,
    ledgerPath,
    tokenEnv: config.tokenEnv || 'NOTION_TOKEN',
    parentPageId: config.parentPageId || null,
  };
}

function validateSyncRoot(root) {
  if (typeof root !== 'string' || !root.trim()) {
    throw new Error('each syncRoot must be a non-empty relative folder');
  }
  const normalized = root.replace(/\\/g, '/').replace(/\/$/, '');
  const segments = normalized.split('/');
  if (path.isAbsolute(root) || normalized === '.' || segments.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`unsafe syncRoot ${JSON.stringify(root)}: use a relative folder inside the vault`);
  }
  if (segments.some((part) => ['sources', '_drafts'].includes(part.toLowerCase()))) {
    throw new Error(`unsafe syncRoot ${JSON.stringify(root)}: sources/ and _drafts/ are never syncable`);
  }
  return segments.join('/');
}

function assertInside(root, candidate, label = 'path') {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(`${label} escapes the vault: ${candidate}`);
}

function resolveNote(config, relPath, { requireSyncRoot = true } = {}) {
  if (typeof relPath !== 'string' || !relPath.trim()) throw new Error('note path is required');
  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (path.isAbsolute(relPath) || segments.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`unsafe note path: ${relPath}`);
  }
  if (segments.some((part) => ['sources', '_drafts'].includes(part.toLowerCase()))) {
    throw new Error(`protected note path is never syncable: ${relPath}`);
  }
  const canonical = segments.join('/');
  if (requireSyncRoot && !config.syncRoots.some((root) => canonical === root || canonical.startsWith(`${root}/`))) {
    throw new Error(`${canonical} is outside configured syncRoots`);
  }
  const absPath = path.resolve(config.vaultRoot, ...segments);
  assertInside(config.vaultRoot, absPath, 'note path');
  return { relPath: canonical, absPath };
}

function localBody(config, relPath) {
  const { absPath } = resolveNote(config, relPath);
  const content = fs.readFileSync(absPath, 'utf8');
  return fm.split(content).body;
}

function listSyncableNotes(config) {
  const found = [];
  const realVault = fs.realpathSync(config.vaultRoot);
  for (const root of config.syncRoots) {
    const abs = path.resolve(config.vaultRoot, ...root.split('/'));
    if (!fs.existsSync(abs)) continue;
    const realRoot = fs.realpathSync(abs);
    assertInside(realVault, realRoot, `syncRoot ${root}`);
    walk(abs, (file) => {
      if (file.endsWith('.md')) found.push(path.relative(config.vaultRoot, file).split(path.sep).join('/'));
    });
  }
  return found.sort();
}

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
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
  const syncable = listSyncableNotes(config);
  const syncableSet = new Set(syncable);
  for (const relPath of syncable) {
    const entry = ledger.notes[relPath];
    if (!entry || !entry.pageId) {
      rows.push({ relPath, state: 'unlinked' });
      continue;
    }
    const { absPath } = resolveNote(config, relPath);
    const content = fs.readFileSync(absPath, 'utf8');
    const currentLocalHash = hash(fm.split(content).body);
    const frontmatterPageId = fm.get(content, 'notion_page_id');
    const linkIssue = frontmatterPageId === entry.pageId
      ? null
      : `ledger pageId=${entry.pageId}; frontmatter notion_page_id=${frontmatterPageId || '(missing)'}`;
    if (entry.creationPending) {
      rows.push({ relPath, state: 'creation-pending', linkIssue });
      continue;
    }
    const remote = await remoteState(client, entry);
    rows.push({
      relPath,
      state: ledgerLib.classify(entry, currentLocalHash, remote.remoteHash),
      linkIssue,
    });
  }
  for (const relPath of Object.keys(ledger.notes)) {
    if (syncableSet.has(relPath)) continue;
    let resolved;
    try { resolved = resolveNote(config, relPath, { requireSyncRoot: false }); }
    catch (error) { rows.push({ relPath, state: 'invalid-ledger-path', linkIssue: error.message }); continue; }
    rows.push({ relPath, state: fs.existsSync(resolved.absPath) ? 'out-of-scope' : 'missing-local' });
  }
  return rows;
}

/** Push one note. Refuses conflicts unless force === 'take-local'. */
async function pushNote(config, client, relPath, { force = null } = {}) {
  let ledger = ledgerLib.load(config.ledgerPath);
  const entry = ledger.notes[relPath];
  if (!entry || !entry.pageId) throw new Error(`${relPath} is not linked to a Notion page — run: link or push --new`);

  const body = localBody(config, relPath);
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

  const { absPath } = resolveNote(config, relPath);
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

  // Re-read-and-rehash guard: the network round-trips above are a window in
  // which an editor save (Obsidian autosave, a human mid-keystroke) can land.
  // Writing over it would be silent data loss — the one failure the hash
  // ledger cannot see, because it happens between our read and our write.
  const current = fs.readFileSync(absPath, 'utf8');
  if (hash(fm.split(current).body) !== currentLocalHash) {
    return { relPath, action: 'conflict', reason: 'file changed on disk during the pull (editor save mid-sync); nothing written — re-run' };
  }
  const { frontmatterText } = fm.split(current);
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
  const existing = ledger.notes[relPath];
  if (existing && existing.pageId && !existing.creationPending) {
    return { relPath, action: 'skip', reason: 'already linked' };
  }
  const { absPath } = resolveNote(config, relPath);
  const original = fs.readFileSync(absPath, 'utf8');
  const body = fm.split(original).body;
  const title = path.basename(relPath, '.md');
  const { byName } = idMaps(ledger);
  const { markdown, warnings } = toNotion(body, byName);

  let page = existing && existing.pageId ? { id: existing.pageId } : null;
  if (!page) {
    page = await client.createPage(config.parentPageId, title);
    ledger = ledgerLib.withEntry(ledger, relPath, {
      pageId: page.id,
      creationPending: true,
    });
    ledgerLib.save(config.ledgerPath, ledger);
  }
  await client.patchPageMarkdown(page.id, markdown);
  const readBack = await client.getPageMarkdown(page.id);
  const meta = await client.retrievePage(page.id);

  ledger = ledgerLib.withEntry(ledger, relPath, {
    pageId: page.id,
    creationPending: false,
    lastLocalHash: hash(body),
    lastRemoteHash: hash(readBack),
    lastRemoteEditedTime: meta.last_edited_time,
    lastSyncedAt: new Date().toISOString(),
  });
  ledgerLib.save(config.ledgerPath, ledger);

  // Same re-read guard as pullNote: page creation is several network calls,
  // and the frontmatter write must not clobber an edit that landed meanwhile.
  // The ledger (authoritative) already holds the link either way.
  const current = fs.readFileSync(absPath, 'utf8');
  if (current !== original) {
    return {
      relPath, action: 'conflict', pageId: page.id,
      reason: 'file changed on disk during page creation; frontmatter left untouched — the ledger holds the link, and status will reconcile on the next run',
    };
  }
  let next = fm.set(current, 'notion_page_id', page.id);
  next = fm.set(next, 'notion_url', notionPageUrl(page.id));
  fs.writeFileSync(absPath, next, 'utf8');
  return { relPath, action: 'created', pageId: page.id, warnings };
}

/** Degraded mode: no token. Emit paste-ready Notion markdown for a human to paste. */
function emitNote(config, relPath, outDir) {
  const ledger = ledgerLib.load(config.ledgerPath);
  const body = localBody(config, relPath);
  const { byName } = idMaps(ledger);
  const { markdown, warnings } = toNotion(body, byName);
  const outPath = path.join(outDir, `${path.basename(relPath, '.md')}.notion.md`);
  fs.mkdirSync(outDir, { recursive: true });
  const header = `<!-- vaultkit: paste-ready for Notion | source: ${relPath} | generated: ${new Date().toISOString()} -->\n\n`;
  fs.writeFileSync(outPath, header + markdown, 'utf8');
  return { relPath, action: 'emitted', outPath, warnings };
}

/** Report or repair ledger/frontmatter page-link drift. The ledger is authoritative. */
function reconcileLinks(config, { apply = false, notes = [] } = {}) {
  const ledger = ledgerLib.load(config.ledgerPath);
  const wanted = new Set(notes);
  const results = [];
  for (const [relPath, entry] of Object.entries(ledger.notes)) {
    if (!entry.pageId || (wanted.size && !wanted.has(relPath))) continue;
    let resolved;
    try { resolved = resolveNote(config, relPath); }
    catch (error) { results.push({ relPath, action: 'skip', reason: error.message }); continue; }
    if (!fs.existsSync(resolved.absPath)) {
      results.push({ relPath, action: 'skip', reason: 'local note missing' });
      continue;
    }
    const original = fs.readFileSync(resolved.absPath, 'utf8');
    const currentId = fm.get(original, 'notion_page_id');
    const currentUrl = fm.get(original, 'notion_url');
    const expectedUrl = notionPageUrl(entry.pageId);
    if (currentId === entry.pageId && currentUrl === expectedUrl) {
      results.push({ relPath, action: 'skip', reason: 'link metadata already matches ledger' });
      continue;
    }
    if (apply) {
      let next = fm.set(original, 'notion_page_id', entry.pageId);
      next = fm.set(next, 'notion_url', expectedUrl);
      fs.writeFileSync(resolved.absPath, next, 'utf8');
    }
    results.push({ relPath, action: apply ? 'reconciled' : 'would-reconcile' });
  }
  return results;
}

module.exports = {
  loadConfig,
  listSyncableNotes,
  status,
  pushNote,
  pullNote,
  createAndLink,
  emitNote,
  reconcileLinks,
  resolveNote,
  idMaps,
};
