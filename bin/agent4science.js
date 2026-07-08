#!/usr/bin/env node
/**
 * agent4science CLI.
 *
 * Two roles:
 *  1) Installer — copy the plugin/agents/commands into a coding agent's config directory
 *     (OpenCode, Claude Code, Codex). See `agent4science install`.
 *  2) Pipeline driver — thin subcommands over the same core the OpenCode plugin uses, so
 *     ANY coding agent (Claude Code, Codex, …) can run the pipeline by shelling out to this
 *     CLI. See scaffold / import / ingest / state / record-run / pro-prompt / safety-check.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  actScaffold,
  actIngest,
  actImportConversation,
  actState,
  actRecordRun,
  actProPrompt,
  actSafetyCheck,
} from '../src/core/actions.js';
import { robustFetch } from '../src/core/fetch.js';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];

/** Parse `--key value` / `--flag` options and positionals from an argv slice. */
function parseArgs(list) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = list[i + 1];
      if (next === undefined || next.startsWith('--')) opts[key] = true;
      else {
        opts[key] = next;
        i++;
      }
    } else pos.push(a);
  }
  return { opts, pos };
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function done(result) {
  if (typeof result === 'string') console.log(result);
  else console.log(JSON.stringify(result, null, 2));
}

function usage() {
  console.log(`agent4science — AI4Science research pipeline for coding agents

Install (registers agents/commands into a coding agent's config):
  agent4science install [DIR] [--global] [--target opencode|claude|codex|all] [--singular]

Drive the pipeline (usable from any coding agent via bash; --dir defaults to cwd):
  agent4science scaffold [--goal "..."] [--dir DIR]
  agent4science import <share-url> [--dir DIR]        # ChatGPT or Claude share link
  agent4science ingest [--file F | --stdin] [--share-url U] [--dir DIR]
  agent4science state [get|advance|force --target S --note N] [--dir DIR]
  agent4science record-run --json '{"run_id":...}' [--dir DIR]
  agent4science pro-prompt <kickoff|handoff-request|review> [--dir DIR]
  agent4science safety-check "<shell command>"

After installing, use the /ai4s-* commands (and the ai4science agent) in your coding agent.`);
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  // Installer delegates to install.sh.
  if (cmd === 'install') {
    const res = spawnSync('bash', [join(pkgRoot, 'install.sh'), ...argv.slice(1)], {
      stdio: 'inherit',
    });
    process.exit(res.status ?? 1);
  }

  const { opts, pos } = parseArgs(argv.slice(1));
  const dir = resolve(opts.dir || process.cwd());

  switch (cmd) {
    case 'scaffold':
      return done(actScaffold(dir, { goal: opts.goal === true ? '' : opts.goal }).message);

    case 'import': {
      const url = pos[0];
      if (!url) return fail('import requires a share URL');
      const r = await actImportConversation(dir, url, { fetchImpl: robustFetch });
      return done(r.message || r);
    }

    case 'ingest': {
      let text = '';
      if (opts.file) text = readFileSync(resolve(opts.file), 'utf8');
      else text = readStdin();
      if (!text.trim()) return fail('ingest requires a handoff via --file or stdin');
      const r = actIngest(dir, text, { sharedLink: opts['share-url'] });
      const out = [r.message];
      if (r.patchRequest) out.push('\n--- PASTE INTO YOUR RESEARCH MODEL ---\n', r.patchRequest);
      return done(out.join('\n'));
    }

    case 'state': {
      const action = pos[0] || 'get';
      return done(actState(dir, { action, target: opts.target, note: opts.note }));
    }

    case 'record-run': {
      if (!opts.json) return fail('record-run requires --json \'{...}\'');
      let record;
      try {
        record = JSON.parse(opts.json);
      } catch (e) {
        return fail(`invalid --json: ${e.message}`);
      }
      return done(actRecordRun(dir, record).message);
    }

    case 'pro-prompt': {
      const kind = pos[0] || 'kickoff';
      const r = actProPrompt(dir, { kind });
      return done(`Saved to ${r.path}\n\n${r.prompt}`);
    }

    case 'safety-check': {
      const command = pos.join(' ');
      if (!command) return fail('safety-check requires a command');
      return done(actSafetyCheck(command));
    }

    default:
      usage();
      process.exit(1);
  }
}

function fail(msg) {
  console.error(`agent4science: ${msg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`agent4science: ${e.message}`);
  process.exit(1);
});
