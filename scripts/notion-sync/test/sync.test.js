'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../lib/sync');
const ledgerLib = require('../lib/ledger');
const { hash } = require('../lib/normalize');

// Integration tests against a temp vault and a fake Notion. The fake applies
// the same normalization a real Notion round-trip applies (LF, trimmed), so
// read-back verification is exercised for real.

function makeVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultkit-test-'));
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(
    path.join(root, 'vaultkit.sync.json'),
    JSON.stringify({ syncRoots: ['projects'], parentPageId: 'parent-1' }),
    'utf8'
  );
  return root;
}

function writeNote(root, relPath, content) {
  fs.writeFileSync(path.join(root, relPath), content, 'utf8');
}

function fakeNotion(initialPages = {}) {
  const pages = { ...initialPages }; // pageId -> { markdown, lastEditedTime }
  let created = 0;
  const touch = (id) => { pages[id].lastEditedTime = `2026-01-01T00:00:0${(created += 1) % 10}Z`; };
  return {
    pages,
    async retrievePage(pageId) {
      return { id: pageId, last_edited_time: pages[pageId].lastEditedTime };
    },
    async getPageMarkdown(pageId) {
      return pages[pageId].markdown;
    },
    async patchPageMarkdown(pageId, markdown) {
      pages[pageId] = pages[pageId] || {};
      // What Notion stores is its own rendering, not the exact payload bytes.
      pages[pageId].markdown = `${String(markdown).replace(/\r\n?/g, '\n').trimEnd()}\n`;
      touch(pageId);
    },
    async createPage(parentPageId, title, markdown) {
      const id = `created-${(created += 1)}`;
      pages[id] = { markdown: '', lastEditedTime: 'never' };
      if (markdown) await this.patchPageMarkdown(id, markdown);
      return { id };
    },
  };
}

function seedLedger(root, relPath, entry) {
  const config = sync.loadConfig(root);
  let ledger = ledgerLib.load(config.ledgerPath);
  ledger = ledgerLib.withEntry(ledger, relPath, entry);
  ledgerLib.save(config.ledgerPath, ledger);
  return config;
}

test('push: writes to Notion, then records the READ-BACK hash, not the payload hash', async () => {
  const root = makeVault();
  writeNote(root, 'projects/alpha.md', '---\ntype: project\n---\nLocal body line\n');
  const notion = fakeNotion({ p1: { markdown: 'old remote\n', lastEditedTime: 't0' } });
  const config = seedLedger(root, 'projects/alpha.md', {
    pageId: 'p1', lastLocalHash: 'stale', lastRemoteHash: hash('old remote\n'), lastRemoteEditedTime: 't0',
  });

  const result = await sync.pushNote(config, notion, 'projects/alpha.md');
  assert.equal(result.action, 'pushed');
  assert.equal(notion.pages.p1.markdown, 'Local body line\n');

  const ledger = ledgerLib.load(config.ledgerPath);
  const entry = ledger.notes['projects/alpha.md'];
  assert.equal(entry.lastRemoteHash, hash(notion.pages.p1.markdown), 'ledger must record what Notion serves');
  assert.equal(entry.lastLocalHash, hash('Local body line\n'));
  // And a follow-up status must now say in-sync.
  const rows = await sync.status(config, notion);
  assert.equal(rows.find((r) => r.relPath === 'projects/alpha.md').state, 'in-sync');
});

// Regression guard: local hashes cover the body only. Editing frontmatter
// (tags, status) must NOT mark the note push-pending — otherwise every tag
// edit burns Notion rate budget and rewrites the page for no content change.
test('status: frontmatter-only edits do not trigger a push', async () => {
  const root = makeVault();
  writeNote(root, 'projects/alpha.md', '---\ntags: [a]\n---\nSame body\n');
  const notion = fakeNotion({ p1: { markdown: 'Same body\n', lastEditedTime: 't0' } });
  const config = seedLedger(root, 'projects/alpha.md', {
    pageId: 'p1', lastLocalHash: hash('Same body\n'), lastRemoteHash: hash('Same body\n'), lastRemoteEditedTime: 't0',
  });

  writeNote(root, 'projects/alpha.md', '---\ntags: [a, b, c]\nstatus: active\n---\nSame body\n');
  const rows = await sync.status(config, notion);
  assert.equal(rows.find((r) => r.relPath === 'projects/alpha.md').state, 'in-sync');
});

test('pull: replaces the body but preserves local frontmatter untouched', async () => {
  const root = makeVault();
  writeNote(root, 'projects/alpha.md', '---\ntype: project\ntags: [keep, me]\n---\nOld local body\n');
  const notion = fakeNotion({ p1: { markdown: 'New remote body\n', lastEditedTime: 't1' } });
  const config = seedLedger(root, 'projects/alpha.md', {
    pageId: 'p1', lastLocalHash: hash('Old local body\n'), lastRemoteHash: hash('stale'), lastRemoteEditedTime: 't0',
  });

  const result = await sync.pullNote(config, notion, 'projects/alpha.md');
  assert.equal(result.action, 'pulled');
  const next = fs.readFileSync(path.join(root, 'projects/alpha.md'), 'utf8');
  assert.match(next, /tags: \[keep, me\]/);
  assert.match(next, /New remote body/);
  assert.doesNotMatch(next, /Old local body/);
});

test('conflict: both sides changed is a hard stop for push AND pull', async () => {
  const root = makeVault();
  writeNote(root, 'projects/alpha.md', 'Local edit\n');
  const notion = fakeNotion({ p1: { markdown: 'Remote edit\n', lastEditedTime: 't1' } });
  const config = seedLedger(root, 'projects/alpha.md', {
    pageId: 'p1', lastLocalHash: hash('original\n'), lastRemoteHash: hash('original\n'), lastRemoteEditedTime: 't0',
  });

  const pushResult = await sync.pushNote(config, notion, 'projects/alpha.md');
  assert.equal(pushResult.action, 'conflict');
  assert.equal(notion.pages.p1.markdown, 'Remote edit\n', 'push must not touch Notion on conflict');

  const pullResult = await sync.pullNote(config, notion, 'projects/alpha.md');
  assert.equal(pullResult.action, 'conflict');
  assert.match(fs.readFileSync(path.join(root, 'projects/alpha.md'), 'utf8'), /Local edit/, 'pull must not touch the vault on conflict');
});

test('conflict: explicit take-local wins and re-baselines the ledger', async () => {
  const root = makeVault();
  writeNote(root, 'projects/alpha.md', 'Local edit\n');
  const notion = fakeNotion({ p1: { markdown: 'Remote edit\n', lastEditedTime: 't1' } });
  const config = seedLedger(root, 'projects/alpha.md', {
    pageId: 'p1', lastLocalHash: hash('original\n'), lastRemoteHash: hash('original\n'), lastRemoteEditedTime: 't0',
  });

  const result = await sync.pushNote(config, notion, 'projects/alpha.md', { force: 'take-local' });
  assert.equal(result.action, 'pushed');
  assert.equal(notion.pages.p1.markdown, 'Local edit\n');
  const rows = await sync.status(config, notion);
  assert.equal(rows.find((r) => r.relPath === 'projects/alpha.md').state, 'in-sync');
});

test('createAndLink: creates the page, links ledger AND frontmatter, verifies by read-back', async () => {
  const root = makeVault();
  writeNote(root, 'projects/beta.md', 'Brand new note\n');
  const notion = fakeNotion();
  const config = sync.loadConfig(root);

  const result = await sync.createAndLink(config, notion, 'projects/beta.md');
  assert.equal(result.action, 'created');
  const note = fs.readFileSync(path.join(root, 'projects/beta.md'), 'utf8');
  assert.match(note, /notion_page_id: created-/);
  assert.match(note, /notion_url: https:\/\/www\.notion\.so\//);

  const rows = await sync.status(config, notion);
  assert.equal(rows.find((r) => r.relPath === 'projects/beta.md').state, 'in-sync');
});

test('status: unlinked and missing-local notes are reported, never guessed at', async () => {
  const root = makeVault();
  writeNote(root, 'projects/new.md', 'Not yet linked\n');
  const notion = fakeNotion({ p9: { markdown: 'x\n', lastEditedTime: 't' } });
  const config = seedLedger(root, 'projects/deleted.md', {
    pageId: 'p9', lastLocalHash: 'h', lastRemoteHash: hash('x\n'), lastRemoteEditedTime: 't',
  });

  const rows = await sync.status(config, notion);
  assert.equal(rows.find((r) => r.relPath === 'projects/new.md').state, 'unlinked');
  assert.equal(rows.find((r) => r.relPath === 'projects/deleted.md').state, 'missing-local');
});

test('emitNote (degraded mode): writes paste-ready markdown with provenance header, no API involved', () => {
  const root = makeVault();
  writeNote(root, 'projects/alpha.md', '---\ntype: project\n---\n> [!tip] Works offline\n> Yes it does\n');
  const config = sync.loadConfig(root);
  const outDir = path.join(root, 'out');

  const result = sync.emitNote(config, 'projects/alpha.md', outDir);
  const emitted = fs.readFileSync(result.outPath, 'utf8');
  assert.match(emitted, /vaultkit: paste-ready for Notion/);
  assert.match(emitted, /source: projects\/alpha\.md/);
  assert.match(emitted, /<callout icon="💡">/);
  assert.doesNotMatch(emitted, /type: project/, 'frontmatter must not leak into the emitted page');
});

test('status: skips the markdown fetch when last_edited_time is unchanged', async () => {
  const root = makeVault();
  writeNote(root, 'projects/alpha.md', 'Body\n');
  let markdownFetches = 0;
  const notion = {
    async retrievePage() { return { id: 'p1', last_edited_time: 't0' }; },
    async getPageMarkdown() { markdownFetches += 1; return 'Body\n'; },
  };
  const config = seedLedger(root, 'projects/alpha.md', {
    pageId: 'p1', lastLocalHash: hash('Body\n'), lastRemoteHash: hash('Body\n'), lastRemoteEditedTime: 't0',
  });

  const rows = await sync.status(config, notion);
  assert.equal(rows[0].state, 'in-sync');
  assert.equal(markdownFetches, 0, 'unchanged last_edited_time must not burn a markdown fetch');
});

// Regression guard for the pull-write TOCTOU window: an editor save landing
// during the pull's network round-trip must abort the write, not lose the edit.
test('pull: a file edit landing mid-pull aborts as conflict, nothing written', async () => {
  const root = makeVault();
  const notePath = path.join(root, 'projects/alpha.md');
  writeNote(root, 'projects/alpha.md', '---\ntags: [keep]\n---\nOld local body\n');
  const notion = fakeNotion({ p1: { markdown: 'New remote body\n', lastEditedTime: 't1' } });
  // The fake's metadata fetch simulates the human saving during the round-trip.
  const sneaky = {
    ...notion,
    async retrievePage(id) {
      fs.writeFileSync(notePath, '---\ntags: [keep]\n---\nEdit that landed mid-sync\n', 'utf8');
      return notion.retrievePage(id);
    },
  };
  const config = seedLedger(root, 'projects/alpha.md', {
    pageId: 'p1', lastLocalHash: hash('Old local body\n'), lastRemoteHash: hash('stale'), lastRemoteEditedTime: 't0',
  });

  const result = await sync.pullNote(config, sneaky, 'projects/alpha.md');
  assert.equal(result.action, 'conflict');
  assert.match(result.reason, /changed on disk during/);
  assert.match(fs.readFileSync(notePath, 'utf8'), /Edit that landed mid-sync/, 'the human edit must survive');
});
