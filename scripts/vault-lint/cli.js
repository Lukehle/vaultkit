#!/usr/bin/env node
'use strict';

// vaultkit vault-lint — deterministic vault health report. Read-only, always.
//
//   node cli.js [--vault <dir>] [--json] [--stale-days N] [--max-note-kb N]
//
// Exit codes: 0 = no errors (warnings allowed), 1 = errors found, 2 = bad invocation.
// Errors are the findings that corrupt agent grounding (secrets, broken links);
// warnings are hygiene for the gardening pass.

const path = require('path');
const { scanVault } = require('./lib/scan');
const { runChecks } = require('./lib/checks');

function parseArgs(argv) {
  const args = { vault: process.cwd(), json: false, options: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--vault') args.vault = argv[(i += 1)];
    else if (a === '--json') args.json = true;
    else if (a === '--stale-days') args.options.staleDays = Number(argv[(i += 1)]);
    else if (a === '--max-note-kb') args.options.maxNoteBytes = Number(argv[(i += 1)]) * 1024;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const vaultRoot = path.resolve(args.vault);
  const notes = scanVault(vaultRoot);
  const findings = runChecks(notes, args.options);
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  if (args.json) {
    console.log(JSON.stringify({ vaultRoot, notes: notes.length, errors, warnings }, null, 2));
  } else {
    console.log(`vault-lint: ${notes.length} notes scanned in ${vaultRoot}`);
    for (const f of errors) console.log(`  ERROR  ${f.check.padEnd(20)} ${f.relPath} — ${f.detail}`);
    for (const f of warnings) console.log(`  warn   ${f.check.padEnd(20)} ${f.relPath} — ${f.detail}`);
    console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  }
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
