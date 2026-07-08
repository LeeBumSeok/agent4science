import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHandoff, validateHandoff, ingest } from '../src/core/handoff.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8');

test('parseHandoff reads raw YAML with no fence', () => {
  const r = parseHandoff(fixture('handoff-valid.yaml'));
  assert.equal(r.ok, true);
  assert.equal(r.data.schema, 'AI4S-HANDOFF-V1');
});

test('parseHandoff extracts a fenced block from surrounding prose', () => {
  const wrapped = [
    'Here is your handoff:',
    '```yaml',
    'schema: AI4S-HANDOFF-V1',
    'project:',
    '  name: x',
    '```',
    'Let me know if you need changes.',
  ].join('\n');
  const r = parseHandoff(wrapped);
  assert.equal(r.ok, true);
  assert.equal(r.data.schema, 'AI4S-HANDOFF-V1');
  assert.equal(r.data.project.name, 'x');
});

test('parseHandoff extracts a block fenced with the AI4S-HANDOFF-V1 label', () => {
  const wrapped = '```AI4S-HANDOFF-V1\nschema: AI4S-HANDOFF-V1\nproject:\n  name: y\n```';
  const r = parseHandoff(wrapped);
  assert.equal(r.ok, true);
  assert.equal(r.data.project.name, 'y');
});

test('parseHandoff reports a parse error for malformed YAML', () => {
  const r = parseHandoff('schema: [unterminated');
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('validateHandoff accepts the valid fixture', () => {
  const { data } = parseHandoff(fixture('handoff-valid.yaml'));
  const v = validateHandoff(data);
  assert.equal(v.status, 'valid');
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.dangerousCommands, []);
  assert.deepEqual(v.pathIssues, []);
  assert.equal(v.patchRequest, null);
});

test('validateHandoff blocks a wrong schema string', () => {
  const v = validateHandoff({ schema: 'SOMETHING-ELSE' });
  assert.equal(v.status, 'blocked');
  assert.equal(v.schemaMismatch, true);
  assert.ok(v.patchRequest.includes('AI4S-HANDOFF-V1'));
});

test('validateHandoff flags missing required fields as needs_revision', () => {
  const { data } = parseHandoff(fixture('handoff-missing-fields.yaml'));
  const v = validateHandoff(data);
  assert.equal(v.status, 'needs_revision');
  assert.ok(v.missing.includes('project.research_question'));
  assert.ok(v.missing.includes('experiment.baselines'));
  assert.ok(v.missing.includes('experiment.metrics.primary.name'));
  assert.ok(v.missing.includes('experiment.success_criteria'));
  assert.ok(v.missing.includes('experiment.seeds'));
  assert.ok(v.missing.includes('implementation.tasks'));
  assert.ok(v.missing.includes('analysis_plan.required_checks'));
  assert.ok(v.missing.includes('safety.risk_level'));
  assert.ok(v.missing.includes('cli_must_not'));
  // patch request names the missing fields for pasting back into ChatGPT Pro
  assert.ok(v.patchRequest.includes('project.research_question'));
});

test('validateHandoff blocks dangerous commands and path escapes', () => {
  const { data } = parseHandoff(fixture('handoff-dangerous.yaml'));
  const v = validateHandoff(data);
  assert.equal(v.status, 'blocked');
  const cmds = v.dangerousCommands.map((d) => d.command);
  assert.ok(cmds.some((c) => c.includes('rm -rf')));
  assert.ok(cmds.some((c) => c.includes('curl')));
  assert.ok(cmds.some((c) => c.includes('git push --force')));
  assert.ok(cmds.some((c) => c.includes('aws')));
  assert.ok(v.pathIssues.includes('/etc/ai4science-results'));
  assert.ok(v.pathIssues.includes('../../outside/metrics.csv'));
});

test('validateHandoff flags per-task missing subfields', () => {
  const data = {
    schema: 'AI4S-HANDOFF-V1',
    project: { name: 'p', domain: 'ml', research_question: 'q' },
    hypothesis: { id: 'H1', statement: 's' },
    experiment: {
      id: 'E1',
      baselines: [{ name: 'b' }],
      metrics: { primary: { name: 'm' } },
      success_criteria: ['ok'],
      failure_criteria: ['no'],
      seeds: [0],
    },
    implementation: { language: 'Python', tasks: [{ id: 'T1', title: 'do' }] }, // no acceptance
    analysis_plan: { required_checks: ['c'] },
    safety: { risk_level: 'low' },
    cli_must_not: ['x'],
  };
  const v = validateHandoff(data);
  assert.equal(v.status, 'needs_revision');
  assert.ok(v.missing.includes('implementation.tasks[0].acceptance'));
});

test('validateHandoff downgrades high risk to needs_human_review', () => {
  const { data } = parseHandoff(fixture('handoff-valid.yaml'));
  data.safety.risk_level = 'high';
  const v = validateHandoff(data);
  assert.equal(v.status, 'needs_human_review');
  assert.ok(v.patchRequest === null || typeof v.patchRequest === 'string');
});

test('blocked takes precedence over needs_revision', () => {
  const { data } = parseHandoff(fixture('handoff-missing-fields.yaml'));
  data.commands = { run: ['sudo rm -rf /'] };
  const v = validateHandoff(data);
  assert.equal(v.status, 'blocked');
});

test('ingest parses and validates in one call', () => {
  const r = ingest(fixture('handoff-valid.yaml'));
  assert.equal(r.parsed, true);
  assert.equal(r.validation.status, 'valid');
  assert.equal(r.data.schema, 'AI4S-HANDOFF-V1');
});

test('ingest surfaces a parse failure without throwing', () => {
  const r = ingest('schema: [unterminated');
  assert.equal(r.parsed, false);
  assert.ok(r.error);
});
