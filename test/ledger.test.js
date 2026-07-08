import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scaffold,
  readState,
  writeState,
  saveHandoff,
  recordRun,
  readRuns,
  makeExists,
} from '../src/core/ledger.js';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'ai4s-'));
}

test('scaffold creates the ledger tree and initial state', () => {
  const root = tmp();
  try {
    scaffold(root, { goal: 'improve X', now: '2026-07-09T00:00:00Z' });
    for (const p of [
      '.ai4science/state.json',
      '.ai4science/run_registry.jsonl',
      '.ai4science/lab_notebook.md',
      '.ai4science/results',
      '.ai4science/reports',
      '.ai4science/pro_prompts',
    ]) {
      assert.ok(existsSync(join(root, p)), `expected to exist: ${p}`);
    }
    const state = readState(root);
    assert.equal(state.state, 'initialized');
    assert.equal(state.goal, 'improve X');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scaffold is idempotent and preserves existing state', () => {
  const root = tmp();
  try {
    scaffold(root, { goal: 'first', now: '2026-07-09T00:00:00Z' });
    writeState(root, 'validated', { now: '2026-07-09T01:00:00Z' });
    scaffold(root, { goal: 'second', now: '2026-07-09T02:00:00Z' });
    const state = readState(root);
    // does not clobber an advanced state or the original goal
    assert.equal(state.state, 'validated');
    assert.equal(state.goal, 'first');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeState records history', () => {
  const root = tmp();
  try {
    scaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    writeState(root, 'handoff_imported', { now: '2026-07-09T00:10:00Z' });
    const state = readState(root);
    assert.equal(state.state, 'handoff_imported');
    assert.ok(Array.isArray(state.history));
    assert.ok(state.history.some((h) => h.state === 'handoff_imported'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saveHandoff writes handoff.yaml and provenance.json', () => {
  const root = tmp();
  try {
    scaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    saveHandoff(root, 'schema: AI4S-HANDOFF-V1\n', {
      shared_link: 'https://chatgpt.com/share/abc',
      imported_at: '2026-07-09T00:20:00Z',
      import_method: 'manual_paste',
    });
    assert.ok(existsSync(join(root, '.ai4science/handoff.yaml')));
    const prov = JSON.parse(readFileSync(join(root, '.ai4science/provenance.json'), 'utf8'));
    assert.equal(prov.shared_link, 'https://chatgpt.com/share/abc');
    assert.equal(prov.import_method, 'manual_paste');
    assert.ok(prov.content_hash, 'provenance should hash the pasted content');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recordRun appends JSONL and readRuns reads it back', () => {
  const root = tmp();
  try {
    scaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    recordRun(root, { run_id: 'E1_seed0', command: 'python run.py', exit_code: 0, status: 'success' });
    recordRun(root, { run_id: 'E1_seed1', command: 'python run.py', exit_code: 1, status: 'failed' });
    const runs = readRuns(root);
    assert.equal(runs.length, 2);
    assert.equal(runs[0].run_id, 'E1_seed0');
    assert.equal(runs[1].status, 'failed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('makeExists reflects real files under the root', () => {
  const root = tmp();
  try {
    scaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const exists = makeExists(root);
    assert.equal(exists('.ai4science/state.json'), true);
    assert.equal(exists('.ai4science/handoff.yaml'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
