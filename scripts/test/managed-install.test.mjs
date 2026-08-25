import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { install, rollback } from '../managed-install.mjs';

const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('managed install includes runtimes, backs up changes, and rolls back', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultkit-install-'));
  const target = path.join(root, 'seat', '.claude');
  install(target);
  const runtime = path.join(target, 'vaultkit', 'scripts', 'notion-sync', 'cli.js');
  assert.equal(fs.existsSync(runtime), true);

  fs.writeFileSync(runtime, 'user customization\n', 'utf8');
  const update = install(target);
  assert.notEqual(fs.readFileSync(runtime, 'utf8'), 'user customization\n');
  rollback(target, update.backupRoot);
  assert.equal(fs.readFileSync(runtime, 'utf8'), 'user customization\n');
});

test('managed install prunes only unchanged retired files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultkit-prune-'));
  const target = path.join(root, 'seat', '.claude');
  install(target);
  const ledgerPath = path.join(target, '.vaultkit-install-ledger.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  const cleanPath = path.join(target, 'vaultkit', 'retired-clean.txt');
  const modifiedPath = path.join(target, 'vaultkit', 'retired-modified.txt');
  fs.writeFileSync(cleanPath, 'managed\n', 'utf8');
  fs.writeFileSync(modifiedPath, 'user edit\n', 'utf8');
  ledger.entries['vaultkit/retired-clean.txt'] = { source: 'retired', sha256: digest('managed\n') };
  ledger.entries['vaultkit/retired-modified.txt'] = { source: 'retired', sha256: digest('managed\n') };
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

  install(target);
  assert.equal(fs.existsSync(cleanPath), false);
  assert.equal(fs.readFileSync(modifiedPath, 'utf8'), 'user edit\n');
});
