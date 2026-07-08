/**
 * ledger.js — the research ledger under `.ai4science/`.
 *
 * The ledger is the single source of truth: state, imported handoff, provenance, run
 * registry, and the lab notebook. All I/O lives here so the rest of the core stays pure.
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DIR = '.ai4science';

/** Absolute path of a ledger-relative path (which may or may not start with `.ai4science/`). */
function abs(root, rel) {
  return join(root, rel);
}

function nowStamp(opts) {
  return (opts && opts.now) || new Date().toISOString();
}

/**
 * Create the ledger tree if missing. Idempotent: never clobbers an existing state.json
 * (so re-running keeps the recorded state and original goal).
 * @param {string} root  project root
 * @param {{goal?: string, now?: string}} opts
 * @returns {{created: string[], statePath: string}}
 */
export function scaffold(root, opts = {}) {
  const created = [];
  for (const d of [DIR, `${DIR}/results`, `${DIR}/reports`, `${DIR}/pro_prompts`]) {
    const p = abs(root, d);
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true });
      created.push(d);
    }
  }

  const registry = abs(root, `${DIR}/run_registry.jsonl`);
  if (!existsSync(registry)) {
    writeFileSync(registry, '');
    created.push(`${DIR}/run_registry.jsonl`);
  }

  const notebook = abs(root, `${DIR}/lab_notebook.md`);
  if (!existsSync(notebook)) {
    writeFileSync(
      notebook,
      `# Lab Notebook\n\nAppend-only record of decisions, state transitions, and notes.\n\n`,
    );
    created.push(`${DIR}/lab_notebook.md`);
  }

  const statePath = abs(root, `${DIR}/state.json`);
  if (!existsSync(statePath)) {
    const state = {
      state: 'initialized',
      goal: opts.goal || '',
      created_at: nowStamp(opts),
      updated_at: nowStamp(opts),
      history: [{ state: 'initialized', at: nowStamp(opts) }],
    };
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
    created.push(`${DIR}/state.json`);
  }

  return { created, statePath };
}

/**
 * Read the current state object.
 * @param {string} root
 * @returns {{state: string, goal: string, history: Array, [k:string]: any}}
 */
export function readState(root) {
  const p = abs(root, `${DIR}/state.json`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Set the current state and append to history.
 * @param {string} root
 * @param {string} newState
 * @param {{now?: string, note?: string}} opts
 */
export function writeState(root, newState, opts = {}) {
  const state = readState(root);
  state.state = newState;
  state.updated_at = nowStamp(opts);
  state.history = state.history || [];
  const entry = { state: newState, at: nowStamp(opts) };
  if (opts.note) entry.note = opts.note;
  state.history.push(entry);
  writeFileSync(abs(root, `${DIR}/state.json`), JSON.stringify(state, null, 2) + '\n');
  return state;
}

/**
 * Persist the imported handoff and its provenance metadata (never the scraped content of
 * the shared link — only the URL and a hash of what the user pasted).
 * @param {string} root
 * @param {string} yamlText  the raw handoff YAML the user pasted
 * @param {{shared_link?: string, imported_at?: string, import_method?: string, [k:string]: any}} provenance
 */
export function saveHandoff(root, yamlText, provenance = {}) {
  writeFileSync(abs(root, `${DIR}/handoff.yaml`), yamlText);
  const prov = {
    ...provenance,
    content_hash: 'sha256:' + createHash('sha256').update(yamlText).digest('hex'),
  };
  writeFileSync(abs(root, `${DIR}/provenance.json`), JSON.stringify(prov, null, 2) + '\n');
  return prov;
}

/**
 * Persist a full imported conversation (replaces a compact handoff) and its provenance.
 * @param {string} root
 * @param {string} markdown  the rendered transcript
 * @param {object} provenance
 */
export function saveConversation(root, markdown, provenance = {}) {
  writeFileSync(abs(root, `${DIR}/pro_conversation.md`), markdown);
  const prov = {
    ...provenance,
    content_hash: 'sha256:' + createHash('sha256').update(markdown).digest('hex'),
  };
  writeFileSync(abs(root, `${DIR}/provenance.json`), JSON.stringify(prov, null, 2) + '\n');
  return prov;
}

/**
 * Append a run record to the registry (append-only; failed runs are never removed).
 * @param {string} root
 * @param {object} record
 */
export function recordRun(root, record) {
  appendFileSync(abs(root, `${DIR}/run_registry.jsonl`), JSON.stringify(record) + '\n');
}

/**
 * Read all run records.
 * @param {string} root
 * @returns {object[]}
 */
export function readRuns(root) {
  const p = abs(root, `${DIR}/run_registry.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
}

/**
 * Build an `exists(relPath)` predicate for the state machine, rooted at `root`.
 * @param {string} root
 * @returns {(relPath: string) => boolean}
 */
export function makeExists(root) {
  return (relPath) => existsSync(abs(root, relPath));
}
