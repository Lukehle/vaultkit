#!/usr/bin/env node
'use strict';

// vaultkit notion-sync — vault-canonical two-way mirror between a markdown
// vault and Notion. Zero dependencies; Node >= 18.
//
//   node cli.js init                 [--vault <dir>]
//   node cli.js link <note> <pageId> [--vault <dir>]
//   node cli.js status               [--vault <dir>]
//   node cli.js push  [note ...]     [--vault <dir>] [--apply] [--new] [--emit <outDir>]
//   node cli.js pull  [note ...]     [--vault <dir>] [--apply]
//   node cli.js resolve <note> (--take-local | --take-remote) [--vault <dir>] [--apply]
//
// Dry-run is the DEFAULT for every mutating command; nothing changes on either
// side without --apply. Degraded mode (no NOTION_TOKEN): push --emit <dir>
// writes paste-ready markdown instead of calling the API.

const fs = require('fs');
const path = require('path');
const fm = require('./lib/frontmatter');
const { createClient } = require('./lib/client');
const ledgerLib = require('./lib/ledger');
const sync = require('./lib/sync');

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--vault' || a === '--emit') args.flags[a.slice(2)] = argv[(i += 1)];
    else if (a.startsWith('--')) args.flags[a.slice(2)] = true;
    else args._.push(a);
  }
  return args;
}

const CONFIG_TEMPLATE = {
  syncRoots: ['projects'],
  ledger: '.vaultkit/sync-ledger.json',
  tokenEnv: 'NOTION_TOKEN',
  parentPageId: '',
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const vaultRoot = path.resolve(args.flags.vault || process.cwd());

  if (!command || command === 'help') return usage();

  if (command === 'init') {
    const configPath = path.join(vaultRoot, 'vaultkit.sync.json');
    if (fs.existsSync(configPath)) return console.log(`already exists: ${configPath}`);
    fs.writeFileSync(configPath, `${JSON.stringify(CONFIG_TEMPLATE, null, 2)}\n`, 'utf8');
    console.log(`wrote ${configPath} — edit syncRoots and parentPageId, then: status`);
    return;
  }

  const config = sync.loadConfig(vaultRoot);
  const apply = Boolean(args.flags.apply);

  if (command === 'link') {
    const [, relPath, pageId] = args._;
    if (!relPath || !pageId) throw new Error('usage: link <note.md> <notionPageId>');
    let ledger = ledgerLib.load(config.ledgerPath);
    ledger = ledgerLib.withEntry(ledger, relPath, { pageId });
    ledgerLib.save(config.ledgerPath, ledger);
    const absPath = path.join(vaultRoot, relPath);
    fs.writeFileSync(absPath, fm.set(fs.readFileSync(absPath, 'utf8'), 'notion_page_id', pageId), 'utf8');
    console.log(`linked ${relPath} <-> ${pageId}`);
    console.log('note: a fresh link has no sync baseline, so it reports as a conflict until you');
    console.log('pick a side once:  resolve <note> --take-local  or  --take-remote');
    return;
  }

  // Degraded mode needs no client at all.
  if (command === 'push' && args.flags.emit) {
    const notes = args._.length > 1 ? args._.slice(1) : sync.listSyncableNotes(config);
    for (const relPath of notes) report(sync.emitNote(config, relPath, args.flags.emit));
    return;
  }

  const token = process.env[config.tokenEnv];
  if (!token) {
    throw new Error(
      `no token in $${config.tokenEnv}. Either export it, or use degraded mode: push --emit <outDir>`
    );
  }
  const client = createClient({ token });

  if (command === 'status') {
    const rows = await sync.status(config, client);
    for (const row of rows) console.log(`${row.state.padEnd(13)} ${row.relPath}`);
    const conflicts = rows.filter((r) => r.state === 'conflict');
    if (conflicts.length) {
      console.log(`\n${conflicts.length} conflict(s). Resolve each explicitly:`);
      console.log('  resolve <note> --take-local   (vault version wins, pushed to Notion)');
      console.log('  resolve <note> --take-remote  (Notion version wins, pulled into vault)');
    }
    return;
  }

  if (command === 'push' || command === 'pull') {
    const named = args._.slice(1);
    const rows = await sync.status(config, client);
    const wanted = command === 'push' ? ['push-pending'] : ['pull-pending'];
    let targets = rows.filter((r) => wanted.includes(r.state)).map((r) => r.relPath);
    if (command === 'push' && args.flags.new) {
      targets = targets.concat(rows.filter((r) => r.state === 'unlinked').map((r) => r.relPath));
    }
    if (named.length) targets = targets.filter((t) => named.includes(t));

    if (!apply) {
      console.log(`dry-run (pass --apply to execute). Would ${command}:`);
      targets.forEach((t) => console.log(`  ${t}`));
      rows.filter((r) => r.state === 'conflict').forEach((r) => console.log(`  CONFLICT (skipped): ${r.relPath}`));
      return;
    }
    for (const relPath of targets) {
      const state = rows.find((r) => r.relPath === relPath).state;
      const result = state === 'unlinked'
        ? await sync.createAndLink(config, client, relPath)
        : command === 'push'
          ? await sync.pushNote(config, client, relPath)
          : await sync.pullNote(config, client, relPath);
      report(result);
    }
    return;
  }

  if (command === 'resolve') {
    const relPath = args._[1];
    const takeLocal = Boolean(args.flags['take-local']);
    const takeRemote = Boolean(args.flags['take-remote']);
    if (!relPath || takeLocal === takeRemote) {
      throw new Error('usage: resolve <note.md> (--take-local | --take-remote) [--apply]');
    }
    if (!apply) return console.log(`dry-run: would resolve ${relPath} by ${takeLocal ? 'pushing the vault version' : 'pulling the Notion version'}. Pass --apply.`);
    const result = takeLocal
      ? await sync.pushNote(config, client, relPath, { force: 'take-local' })
      : await sync.pullNote(config, client, relPath, { force: 'take-remote' });
    report(result);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

function report(result) {
  const warn = result.warnings && result.warnings.length ? `  [${result.warnings.length} warning(s)]` : '';
  console.log(`${result.action.padEnd(9)} ${result.relPath}${result.reason ? ` — ${result.reason}` : ''}${warn}`);
  (result.warnings || []).forEach((w) => console.log(`  warning: ${w}`));
}

function usage() {
  console.log('vaultkit notion-sync — commands: init | link | status | push | pull | resolve');
  console.log('Dry-run by default; every mutation requires --apply. See scripts/notion-sync/README.md');
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
