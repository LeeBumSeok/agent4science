import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATES,
  ORDER,
  nextState,
  requiredArtifacts,
  canAdvance,
} from '../src/core/state.js';

test('ORDER lists every state exactly once, in pipeline order', () => {
  assert.equal(ORDER[0], 'initialized');
  assert.equal(ORDER[ORDER.length - 1], 'pro_feedback_ready');
  assert.equal(new Set(ORDER).size, ORDER.length);
  for (const s of ORDER) assert.ok(STATES[s], `missing state def: ${s}`);
});

test('nextState returns the following state, or null at the end', () => {
  assert.equal(nextState('initialized'), 'handoff_imported');
  assert.equal(nextState('analyzed'), 'pro_feedback_ready');
  assert.equal(nextState('pro_feedback_ready'), null);
});

test('nextState throws on an unknown state', () => {
  assert.throws(() => nextState('bogus'), /unknown state/i);
});

test('requiredArtifacts lists the files a transition needs', () => {
  assert.deepEqual(requiredArtifacts('handoff_imported'), ['.ai4science/provenance.json']);
  assert.ok(requiredArtifacts('validated').includes('.ai4science/validation_report.md'));
});

test('canAdvance to handoff_imported accepts a handoff OR a conversation', () => {
  const viaHandoff = (p) =>
    ['.ai4science/handoff.yaml', '.ai4science/provenance.json'].includes(p);
  const viaConvo = (p) =>
    ['.ai4science/pro_conversation.md', '.ai4science/provenance.json'].includes(p);
  assert.equal(canAdvance('initialized', viaHandoff).ok, true);
  assert.equal(canAdvance('initialized', viaConvo).ok, true);
});

test('canAdvance reports the requiresAny group when neither source exists', () => {
  const onlyProvenance = (p) => p === '.ai4science/provenance.json';
  const r = canAdvance('initialized', onlyProvenance);
  assert.equal(r.ok, false);
  assert.equal(r.target, 'handoff_imported');
  assert.ok(r.missing.some((m) => /one of:.*handoff\.yaml.*pro_conversation\.md/.test(m)));
});

test('canAdvance refuses when nothing exists', () => {
  const r = canAdvance('initialized', () => false);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('.ai4science/provenance.json'));
});

test('canAdvance at the terminal state has no target', () => {
  const r = canAdvance('pro_feedback_ready', () => true);
  assert.equal(r.ok, false);
  assert.equal(r.target, null);
  assert.match(r.reason, /terminal|final|last/i);
});
