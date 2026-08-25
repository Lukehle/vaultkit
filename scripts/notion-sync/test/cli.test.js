'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const CLI = path.resolve(__dirname, '..', 'cli.js');

function run(root, ...args) {
  return spawnSync(process.execPath, [CLI, ...args, '--vault', root], {
    encoding: 'utf8',
    env: { ...process.env, NOTION_TOKEN: '' },
  });
}

test('init and link are dry-run by default; apply is explicit and scope checked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultkit-cli-'));
  const configPath = path.join(root, 'vaultkit.sync.json');

  let result = run(root, 'init');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/);
  assert.equal(fs.existsSync(configPath), false);

  result = run(root, 'init', '--apply');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(configPath), true);
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'projects', 'alpha.md'), 'Body\n', 'utf8');

  result = run(root, 'link', 'projects/alpha.md', 'page-1');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'projects', 'alpha.md'), 'utf8'), /notion_page_id/);

  result = run(root, 'link', 'projects/alpha.md', 'page-1', '--apply');
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(path.join(root, 'projects', 'alpha.md'), 'utf8'), /notion_page_id: page-1/);

  fs.mkdirSync(path.join(root, 'private'));
  fs.writeFileSync(path.join(root, 'private', 'hidden.md'), 'Private\n', 'utf8');
  result = run(root, 'link', 'private/hidden.md', 'page-2', '--apply');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside configured syncRoots/);
});
