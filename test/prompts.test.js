import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kickoffPrompt,
  handoffRequestPrompt,
  reviewPrompt,
} from '../src/core/prompts.js';

test('kickoffPrompt frames Pro as PI and asks for an AI4S-HANDOFF-V1', () => {
  const p = kickoffPrompt({
    goal: 'improve small-data generalization',
    repoSummary: 'a GNN training repo',
    constraints: { compute_budget: 'CPU only' },
  });
  assert.match(p, /research PI/i);
  assert.ok(p.includes('AI4S-HANDOFF-V1'));
  assert.ok(p.includes('improve small-data generalization'));
  assert.ok(p.includes('CPU only'));
  // it should defer the final block until the user says so
  assert.match(p, /produce handoff/i);
});

test('kickoffPrompt works without optional fields', () => {
  const p = kickoffPrompt({ goal: 'study X' });
  assert.ok(p.includes('study X'));
  assert.ok(p.includes('AI4S-HANDOFF-V1'));
});

test('handoffRequestPrompt asks for the block only', () => {
  const p = handoffRequestPrompt();
  assert.ok(p.includes('AI4S-HANDOFF-V1'));
  assert.match(p, /only/i);
});

test('reviewPrompt renders results and asks for the next handoff', () => {
  const p = reviewPrompt({
    researchQuestion: 'does reg help?',
    hypothesis: 'reg lowers rmse',
    commandsRun: ['python run.py --seed 0'],
    changedFiles: ['experiments/run_e001.py'],
    metricsTable: 'method,val_rmse\nbaseline,0.5\nproposed,0.4',
    failures: ['seed 2 crashed on OOM'],
    supported: ['proposed beat baseline on 2/3 seeds'],
    contradicted: [],
    uncertain: ['seed variance high'],
  });
  assert.ok(p.includes('does reg help?'));
  assert.ok(p.includes('val_rmse'));
  assert.ok(p.includes('seed 2 crashed on OOM'));
  assert.ok(p.includes('seed variance high'));
  assert.match(p, /next AI4S-HANDOFF-V1/i);
});

test('reviewPrompt omits empty sections gracefully', () => {
  const p = reviewPrompt({
    researchQuestion: 'q',
    hypothesis: 'h',
    metricsTable: 'a,b',
  });
  assert.ok(p.includes('q'));
  assert.ok(!/failure logs/i.test(p) || !p.includes('undefined'));
  assert.ok(!p.includes('undefined'));
});
