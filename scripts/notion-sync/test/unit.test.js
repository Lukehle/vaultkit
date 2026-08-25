'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fm = require('../lib/frontmatter');
const { normalize, hash } = require('../lib/normalize');
const { toNotion, fromNotion } = require('../lib/preprocess');
const ledgerLib = require('../lib/ledger');
const { createClient } = require('../lib/client');

// ---------------------------------------------------------------- frontmatter

test('frontmatter: get reads scalar values, quoted or bare', () => {
  const note = '---\ntype: wiki\nnotion_page_id: "abc-123"\n---\nBody\n';
  assert.equal(fm.get(note, 'type'), 'wiki');
  assert.equal(fm.get(note, 'notion_page_id'), 'abc-123');
  assert.equal(fm.get(note, 'missing'), null);
});

test('frontmatter: set replaces only the owned key, leaves everything else byte-identical', () => {
  const note = '---\ntype: wiki\ntags: [a, b]\nnotion_page_id: old\n---\nBody with [[link]]\n';
  const next = fm.set(note, 'notion_page_id', 'new-id');
  assert.match(next, /notion_page_id: new-id/);
  assert.match(next, /tags: \[a, b\]/);
  assert.match(next, /Body with \[\[link\]\]/);
  assert.equal(fm.split(next).body, fm.split(note).body);
});

test('frontmatter: set creates a block when the note has none', () => {
  const next = fm.set('Just a body\n', 'notion_page_id', 'x');
  assert.equal(next, '---\nnotion_page_id: x\n---\nJust a body\n');
});

test('frontmatter: handles CRLF notes', () => {
  const note = '---\r\ntype: wiki\r\n---\r\nBody\r\n';
  assert.equal(fm.get(note, 'type'), 'wiki');
  assert.equal(fm.split(note).body, 'Body\r\n');
});

test('frontmatter: remove deletes the key and can drop an emptied block', () => {
  const one = '---\nnotion_page_id: x\n---\nBody\n';
  assert.equal(fm.remove(one, 'notion_page_id'), 'Body\n');
  const two = '---\ntype: wiki\nnotion_page_id: x\n---\nBody\n';
  assert.equal(fm.remove(two, 'notion_page_id'), '---\ntype: wiki\n---\nBody\n');
});

// ------------------------------------------------------------------ normalize

// Regression guard: local files on Windows are CRLF, Notion emits LF. Without
// newline normalization before hashing, every note reports a phantom change on
// every run — the same class of bug as hashing inline scripts pre-normalization.
test('normalize: CRLF and LF content hash identically', () => {
  assert.equal(hash('a\r\nb\r\n'), hash('a\nb\n'));
});

test('normalize: trailing spaces and extra trailing newlines do not change the hash', () => {
  assert.equal(hash('line  \nnext\t\n\n\n'), hash('line\nnext\n'));
});

test('normalize: real content changes DO change the hash', () => {
  assert.notEqual(hash('total: 100\n'), hash('total: 101\n'));
});

test('normalize: canonical form is LF with single trailing newline', () => {
  assert.equal(normalize('a\r\nb'), 'a\nb\n');
});

// ----------------------------------------------------------------- preprocess

test('preprocess: callout converts to Notion tag and round-trips back', () => {
  const obsidian = '> [!warning] Check this\n> First line\n> Second line\n';
  const { markdown, warnings } = toNotion(obsidian);
  assert.equal(warnings.length, 0);
  assert.match(markdown, /<callout icon="⚠️">/);
  assert.match(markdown, /\*\*Check this\*\*/);
  const back = fromNotion(markdown);
  assert.match(back.body, /> \[!warning\] Check this/);
  assert.match(back.body, /> First line/);
});

test('preprocess: mapped wikilink becomes a Notion page link and round-trips', () => {
  const id = '12345678123412341234123456789012';
  const { markdown } = toNotion('See [[Roadmap]] for details\n', { roadmap: id });
  assert.match(markdown, /\[Roadmap\]\(https:\/\/www\.notion\.so\/12345678123412341234123456789012\)/);
  const back = fromNotion(markdown, { [id]: 'Roadmap' });
  assert.match(back.body, /\[\[Roadmap\]\]/);
});

test('preprocess: aliased wikilink keeps its alias through the round-trip', () => {
  const id = 'abcdefabcdefabcdefabcdefabcdefab';
  const { markdown } = toNotion('See [[Roadmap|the plan]]\n', { roadmap: id });
  assert.match(markdown, /\[the plan\]/);
  const back = fromNotion(markdown, { [id]: 'Roadmap' });
  assert.match(back.body, /\[\[Roadmap\|the plan\]\]/);
});

test('preprocess: unmapped wikilink degrades to plain text WITH a warning, never silently', () => {
  const { markdown, warnings } = toNotion('See [[Unsynced Note]]\n');
  assert.match(markdown, /See Unsynced Note/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unsynced Note/);
});

test('preprocess: embeds become visible placeholders with a warning', () => {
  const { markdown, warnings } = toNotion('![[Chart.png]]\n');
  assert.match(markdown, /\[embed from vault: Chart\.png\]/);
  assert.equal(warnings.length, 1);
});

test('preprocess: plain markdown passes through untouched', () => {
  const md = '# Title\n\nA paragraph with **bold** and a [link](https://example.com).\n\n- item\n';
  assert.equal(toNotion(md).markdown, md);
  assert.equal(fromNotion(md).body, md);
});

// --------------------------------------------------------------------- ledger

test('ledger: classify covers all five states', () => {
  const entry = { pageId: 'p', lastLocalHash: 'L', lastRemoteHash: 'R' };
  assert.equal(ledgerLib.classify(undefined, 'L', 'R'), 'unlinked');
  assert.equal(ledgerLib.classify(entry, 'L', 'R'), 'in-sync');
  assert.equal(ledgerLib.classify(entry, 'L2', 'R'), 'push-pending');
  assert.equal(ledgerLib.classify(entry, 'L', 'R2'), 'pull-pending');
  assert.equal(ledgerLib.classify(entry, 'L2', 'R2'), 'conflict');
});

// Regression guard: a freshly-linked note has no baseline hashes. It must
// classify as CONFLICT (forcing an explicit --take-local/--take-remote choice),
// never as in-sync or as a silent one-way copy.
test('ledger: fresh link with no baseline is a conflict, forcing an explicit first sync', () => {
  assert.equal(ledgerLib.classify({ pageId: 'p' }, 'anyLocal', 'anyRemote'), 'conflict');
});

test('ledger: withEntry returns a new object and never mutates', () => {
  const before = ledgerLib.emptyLedger();
  const after = ledgerLib.withEntry(before, 'a.md', { pageId: 'p' });
  assert.equal(Object.keys(before.notes).length, 0);
  assert.equal(after.notes['a.md'].pageId, 'p');
});

// --------------------------------------------------------------------- client

function fakeResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] || null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

test('client: honors Retry-After on 429, then succeeds', async () => {
  const calls = [];
  const sleeps = [];
  const responses = [
    fakeResponse(429, { message: 'rate_limited' }, { 'retry-after': '2' }),
    fakeResponse(200, { id: 'page-1' }, { 'content-type': 'application/json' }),
  ];
  const client = createClient({
    token: 't',
    fetchImpl: async (url) => { calls.push(url); return responses.shift(); },
    sleepImpl: async (ms) => sleeps.push(ms),
    minIntervalMs: 0,
  });
  const page = await client.retrievePage('page-1');
  assert.equal(page.id, 'page-1');
  assert.equal(calls.length, 2);
  assert.ok(sleeps.includes(2000), `expected a 2000ms Retry-After sleep, got ${JSON.stringify(sleeps)}`);
});

test('client: non-retryable 400 fails immediately with the API detail', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () => fakeResponse(400, { message: 'validation_error' }),
    sleepImpl: async () => {},
    minIntervalMs: 0,
  });
  await assert.rejects(() => client.retrievePage('x'), /HTTP 400/);
});

test('client: getPageMarkdown accepts both a JSON envelope and a raw text body', async () => {
  const asJson = createClient({
    token: 't',
    fetchImpl: async () => fakeResponse(200, { markdown: '# Hi' }, { 'content-type': 'application/json' }),
    sleepImpl: async () => {},
    minIntervalMs: 0,
  });
  assert.equal(await asJson.getPageMarkdown('p'), '# Hi');
  const asText = createClient({
    token: 't',
    fetchImpl: async () => fakeResponse(200, '# Hi', { 'content-type': 'text/markdown' }),
    sleepImpl: async () => {},
    minIntervalMs: 0,
  });
  assert.equal(await asText.getPageMarkdown('p'), '# Hi');
});

test('client: spaces consecutive requests by the configured interval', async () => {
  const sleeps = [];
  const client = createClient({
    token: 't',
    fetchImpl: async () => fakeResponse(200, {}, { 'content-type': 'application/json' }),
    sleepImpl: async (ms) => sleeps.push(ms),
    minIntervalMs: 400,
  });
  await client.retrievePage('a');
  await client.retrievePage('b');
  assert.ok(sleeps.some((ms) => ms > 0 && ms <= 400), `expected a pacing sleep, got ${JSON.stringify(sleeps)}`);
});

test('client: refuses to construct without a token', () => {
  assert.throws(() => createClient({ token: '' }), /token required/);
});
