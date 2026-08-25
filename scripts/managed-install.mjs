#!/usr/bin/env node
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptFile), '..');
const pack = 'vaultkit';

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

function safeTarget(target) {
  const resolved = path.resolve(target);
  if (resolved === path.parse(resolved).root || resolved.split(path.sep).filter(Boolean).length < 2) {
    throw new Error(`refusing broad install target: ${resolved}`);
  }
  return resolved;
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (['.git', 'logs', '__pycache__'].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function addTree(entries, sourceRoot, destinationRoot) {
  for (const source of walk(sourceRoot)) {
    entries.push({ source, destination: path.join(destinationRoot, path.relative(sourceRoot, source)) });
  }
}

function relativeTarget(target, destination) {
  const relative = path.relative(target, path.resolve(destination));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`destination escapes install target: ${destination}`);
  }
  return relative;
}

function copyAtomic(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp = `${destination}.vaultkit-tmp-${process.pid}`;
  fs.copyFileSync(source, temp);
  if (fs.existsSync(destination)) fs.rmSync(destination);
  fs.renameSync(temp, destination);
}

function entriesFor(target) {
  const entries = [];
  addTree(entries, path.join(repoRoot, 'skills'), path.join(target, 'skills'));
  addTree(entries, path.join(repoRoot, 'commands'), path.join(target, 'commands'));
  addTree(entries, path.join(repoRoot, 'scripts', 'notion-sync'), path.join(target, 'vaultkit', 'scripts', 'notion-sync'));
  addTree(entries, path.join(repoRoot, 'scripts', 'vault-lint'), path.join(target, 'vaultkit', 'scripts', 'vault-lint'));
  entries.push({ source: scriptFile, destination: path.join(target, 'vaultkit', 'scripts', 'managed-install.mjs') });
  return entries;
}

export function install(target, { dryRun = false } = {}) {
  target = safeTarget(target);
  const ledgerPath = path.join(target, '.vaultkit-install-ledger.json');
  const previous = readJson(ledgerPath, { version: 1, entries: {} });
  const desired = new Map(entriesFor(target).map((entry) => [relativeTarget(target, entry.destination), entry]));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(target, '.vaultkit-backups', stamp);
  const added = [];
  const next = {};
  let changed = 0;

  const preserve = (destination) => {
    const backup = path.join(backupRoot, 'files', relativeTarget(target, destination));
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(destination, backup);
  };

  for (const [relative, entry] of desired) {
    const sourceHash = hash(entry.source);
    next[relative] = { source: path.relative(repoRoot, entry.source), sha256: sourceHash };
    if (fs.existsSync(entry.destination) && hash(entry.destination) === sourceHash) continue;
    changed += 1;
    if (!fs.existsSync(entry.destination)) added.push(relative);
    console.log(`${dryRun ? '[dry-run] ' : ''}install ${relative}`);
    if (dryRun) continue;
    if (fs.existsSync(entry.destination)) preserve(entry.destination);
    copyAtomic(entry.source, entry.destination);
  }

  for (const [relative, owned] of Object.entries(previous.entries || {})) {
    if (desired.has(relative)) continue;
    const destination = path.join(target, relative);
    if (!fs.existsSync(destination)) continue;
    if (hash(destination) !== owned.sha256) {
      console.warn(`preserved modified retired file (ownership released): ${relative}`);
      continue;
    }
    changed += 1;
    console.log(`${dryRun ? '[dry-run] ' : ''}prune ${relative}`);
    if (!dryRun) { preserve(destination); fs.rmSync(destination); }
  }

  if (!dryRun) {
    fs.mkdirSync(target, { recursive: true });
    if (changed) {
      fs.mkdirSync(backupRoot, { recursive: true });
      fs.writeFileSync(path.join(backupRoot, 'backup.json'), `${JSON.stringify({
        version: 1, pack, target, added, previousLedger: previous,
      }, null, 2)}\n`, 'utf8');
      console.log(`rollback point: ${backupRoot}`);
    }
    fs.writeFileSync(ledgerPath, `${JSON.stringify({
      version: 1, pack, installedAt: new Date().toISOString(), entries: next,
    }, null, 2)}\n`, 'utf8');
  }
  return { backupRoot: changed ? backupRoot : null };
}

export function rollback(target, backup = 'latest', { dryRun = false } = {}) {
  target = safeTarget(target);
  const root = path.join(target, '.vaultkit-backups');
  if (backup === 'latest') {
    const choices = fs.existsSync(root)
      ? fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, entry.name)).sort()
      : [];
    backup = choices.at(-1);
  } else backup = path.resolve(backup);
  const meta = backup && readJson(path.join(backup, 'backup.json'), null);
  if (!meta || meta.pack !== pack || path.resolve(meta.target) !== target) {
    throw new Error(`invalid rollback point: ${backup || '(none)'}`);
  }
  const current = readJson(path.join(target, '.vaultkit-install-ledger.json'), { entries: {} });
  for (const relative of meta.added || []) {
    const destination = path.join(target, relative);
    if (!fs.existsSync(destination) || !current.entries?.[relative]) continue;
    if (hash(destination) !== current.entries[relative].sha256) continue;
    console.log(`${dryRun ? '[dry-run] ' : ''}remove added ${relative}`);
    if (!dryRun) fs.rmSync(destination);
  }
  const filesRoot = path.join(backup, 'files');
  for (const source of walk(filesRoot)) {
    const relative = path.relative(filesRoot, source);
    console.log(`${dryRun ? '[dry-run] ' : ''}restore ${relative}`);
    if (!dryRun) copyAtomic(source, path.join(target, relative));
  }
  if (!dryRun) {
    fs.writeFileSync(
      path.join(target, '.vaultkit-install-ledger.json'),
      `${JSON.stringify(meta.previousLedger, null, 2)}\n`,
      'utf8',
    );
  }
}

function parseArgs(argv) {
  const args = { target: path.join(os.homedir(), '.claude'), dryRun: false, rollback: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target') args.target = argv[(index += 1)];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--rollback') args.rollback = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[(index += 1)] : 'latest';
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.rollback) rollback(args.target, args.rollback, { dryRun: args.dryRun });
    else install(args.target, { dryRun: args.dryRun });
  } catch (error) {
    console.error(`vaultkit install error: ${error.message}`);
    process.exit(1);
  }
}
