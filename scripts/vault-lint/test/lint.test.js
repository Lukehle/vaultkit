'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanVault, extractWikilinks } = require('../lib/scan');
const { runChecks } = require('../lib/checks');

function makeVault(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultkit-lint-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}

function findingsFor(files, options) {
  const root = makeVault(files);
  return runChecks(scanVault(root), options);
}

const OK_NOTE = '---\ntype: wiki\n---\nLinks to [[Other]].\n';

test('clean vault with index produces no findings', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\n[[Other]] and [[Third]]\n',
    'Other.md': '---\ntype: wiki\n---\nSee [[Third]]\n',
    'Third.md': '---\ntype: wiki\n---\nBack to [[Other]]\n',
  });
  assert.deepEqual(findings, []);
});

test('broken wikilink is an ERROR, resolved links are not', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\n[[Other]] and [[Ghost Note]]\n',
    'Other.md': OK_NOTE.replace('[[Other]]', '[[INDEX]]'),
  });
  const broken = findings.filter((f) => f.check === 'broken-wikilink');
  assert.equal(broken.length, 1);
  assert.equal(broken[0].severity, 'error');
  assert.match(broken[0].detail, /Ghost Note/);
});

test('wikilink resolution is case-insensitive and accepts full paths', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\n[[other]] and [[sub/Deep Note]]\n',
    'Other.md': '---\ntype: wiki\n---\n[[INDEX]]\n',
    'sub/Deep Note.md': '---\ntype: wiki\n---\n[[INDEX]]\n',
  });
  assert.equal(findings.filter((f) => f.check === 'broken-wikilink').length, 0);
});

test('heading and block references resolve to their base note', () => {
  assert.deepEqual(extractWikilinks('[[Note#Section]] [[Note^block-id]] [[Note#Sec|alias]]'), ['Note', 'Note', 'Note']);
});

// Regression guard: image/asset embeds must not count as broken wikilinks —
// early version flagged every ![[diagram.png]] and buried real breaks in noise.
test('asset embeds are not treated as broken links', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\n![[diagram.png]] and [[Other]]\n',
    'Other.md': '---\ntype: wiki\n---\n[[INDEX]]\n',
  });
  assert.equal(findings.filter((f) => f.check === 'broken-wikilink').length, 0);
});

test('secrets are ERRORS: key-like strings in notes are flagged', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\n[[Config]]\n',
    'Config.md': '---\ntype: wiki\n---\n[[INDEX]]\napi_key = abcd1234efgh5678ijkl\n',
  });
  const secrets = findings.filter((f) => f.check === 'secret');
  assert.equal(secrets.length, 1);
  assert.equal(secrets[0].severity, 'error');
});

test('missing and incomplete frontmatter are warnings', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\n[[Bare]] [[Untyped]]\n',
    'Bare.md': 'No frontmatter at all, links [[INDEX]]\n',
    'Untyped.md': '---\nstatus: draft\n---\n[[INDEX]]\n',
  });
  assert.equal(findings.filter((f) => f.check === 'frontmatter-missing').length, 1);
  assert.equal(findings.filter((f) => f.check === 'frontmatter-incomplete').length, 1);
});

test('orphans are warned; index files and daily notes are exempt', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\nNo links here\n',
    '2026-01-15.md': '---\ntype: daily\n---\nDaily log, no links\n',
    'Lonely.md': '---\ntype: wiki\n---\nNo links either\n',
  });
  const orphans = findings.filter((f) => f.check === 'orphan');
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].relPath, 'Lonely.md');
});

test('stale check applies only inside stale roots and respects the threshold', () => {
  const root = makeVault({
    'INDEX.md': '---\ntype: index\n---\n[[wiki/Old Fact]] [[Old Project]]\n',
    'wiki/Old Fact.md': '---\ntype: fact\n---\n[[INDEX]]\n',
    'Old Project.md': '---\ntype: project\n---\n[[INDEX]]\n',
  });
  const old = new Date(Date.now() - 400 * 86400000);
  fs.utimesSync(path.join(root, 'wiki/Old Fact.md'), old, old);
  fs.utimesSync(path.join(root, 'Old Project.md'), old, old);
  const findings = runChecks(scanVault(root), { staleDays: 180, staleRoots: ['wiki'] });
  const stale = findings.filter((f) => f.check === 'stale');
  assert.equal(stale.length, 1);
  assert.equal(stale[0].relPath, 'wiki/Old Fact.md');
});

test('oversized notes are warned at the configured threshold', () => {
  const big = `---\ntype: wiki\n---\n[[INDEX]]\n${'x'.repeat(3000)}\n`;
  const findings = findingsFor(
    { 'INDEX.md': '---\ntype: index\n---\n[[Big]]\n', 'Big.md': big },
    { maxNoteBytes: 1024 }
  );
  assert.equal(findings.filter((f) => f.check === 'oversized').length, 1);
});

test('a vault with no root index is warned', () => {
  const findings = findingsFor({
    'Some Note.md': '---\ntype: wiki\n---\n[[Other Note]]\n',
    'Other Note.md': '---\ntype: wiki\n---\n[[Some Note]]\n',
  });
  assert.equal(findings.filter((f) => f.check === 'no-index').length, 1);
});

test('dot-directories and sync state are never scanned', () => {
  const root = makeVault({
    'INDEX.md': '---\ntype: index\n---\n[[Other]]\n',
    'Other.md': '---\ntype: wiki\n---\n[[INDEX]]\n',
    '.obsidian/workspace.md': 'app internals',
    '_sync-conflicts/old.md': 'conflict remnant with api_key = abcd1234efgh5678ijkl',
  });
  const notes = scanVault(root);
  assert.deepEqual(notes.map((n) => n.relPath).sort(), ['INDEX.md', 'Other.md']);
});

test('VAULT.md operating doc is exempt from frontmatter and orphan checks', () => {
  const findings = findingsFor({
    'INDEX.md': '---\ntype: index\n---\n[[Other]]\n',
    'Other.md': '---\ntype: wiki\n---\n[[INDEX]]\n',
    'VAULT.md': '# VAULT.md — operating manual\nNo frontmatter, no links, on purpose.\n',
  });
  assert.deepEqual(findings, []);
});
