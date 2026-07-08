import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  actScaffold,
  actIngest,
  actState,
  actRecordRun,
  actProPrompt,
  actSafetyCheck,
  safetyHook,
  actImportConversation,
} from '../src/core/actions.js';

const here = new URL('.', import.meta.url).pathname;
const fixture = (n) => readFileSync(join(here, '..', 'fixtures', n), 'utf8');

function tmp() {
  return mkdtempSync(join(tmpdir(), 'ai4s-act-'));
}
function withTmp(fn) {
  const root = tmp();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('actScaffold initializes the ledger', () => {
  withTmp((root) => {
    const r = actScaffold(root, { goal: 'improve X', now: '2026-07-09T00:00:00Z' });
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(root, '.ai4science/state.json')));
    assert.match(r.message, /initialized/i);
  });
});

test('actIngest on a valid handoff saves it and advances to handoff_imported', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const r = actIngest(root, fixture('handoff-valid.yaml'), {
      sharedLink: 'https://chatgpt.com/share/abc',
      now: '2026-07-09T00:10:00Z',
    });
    assert.equal(r.status, 'valid');
    assert.ok(existsSync(join(root, '.ai4science/handoff.yaml')));
    assert.ok(existsSync(join(root, '.ai4science/provenance.json')));
    const prov = JSON.parse(readFileSync(join(root, '.ai4science/provenance.json'), 'utf8'));
    assert.equal(prov.shared_link, 'https://chatgpt.com/share/abc');
    assert.equal(prov.import_method, 'manual_paste');
    assert.equal(actState(root, { action: 'get' }).state, 'handoff_imported');
  });
});

test('actIngest on needs_revision does not save or advance, returns patch request', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const r = actIngest(root, fixture('handoff-missing-fields.yaml'), {});
    assert.equal(r.status, 'needs_revision');
    assert.ok(r.patchRequest.includes('project.research_question'));
    assert.equal(existsSync(join(root, '.ai4science/handoff.yaml')), false);
    assert.equal(actState(root, { action: 'get' }).state, 'initialized');
  });
});

test('actIngest on a dangerous handoff is blocked and does not save', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const r = actIngest(root, fixture('handoff-dangerous.yaml'), {});
    assert.equal(r.status, 'blocked');
    assert.ok(r.patchRequest);
    assert.equal(existsSync(join(root, '.ai4science/handoff.yaml')), false);
  });
});

test('actIngest surfaces a parse error', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const r = actIngest(root, 'schema: [broken', {});
    assert.equal(r.status, 'parse_error');
    assert.ok(r.message);
  });
});

test('actState advance moves forward only when artifacts exist', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    actIngest(root, fixture('handoff-valid.yaml'), { now: '2026-07-09T00:10:00Z' });
    // now at handoff_imported; advancing to validated needs validation_report.md
    let r = actState(root, { action: 'advance', now: '2026-07-09T00:20:00Z' });
    assert.equal(r.ok, false);
    assert.ok(r.missing.includes('.ai4science/validation_report.md'));

    writeFileSync(join(root, '.ai4science/validation_report.md'), '# ok\n');
    r = actState(root, { action: 'advance', now: '2026-07-09T00:30:00Z' });
    assert.equal(r.ok, true);
    assert.equal(r.state, 'validated');
  });
});

test('actState force overrides the guard and notes it', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const r = actState(root, {
      action: 'force',
      target: 'validated',
      note: 'manual override',
      now: '2026-07-09T00:40:00Z',
    });
    assert.equal(r.ok, true);
    assert.equal(actState(root, { action: 'get' }).state, 'validated');
  });
});

test('actRecordRun appends to the registry', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const r = actRecordRun(root, { run_id: 'E1_s0', command: 'python run.py', exit_code: 0, status: 'success' });
    assert.equal(r.ok, true);
    const lines = readFileSync(join(root, '.ai4science/run_registry.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
  });
});

test('actProPrompt writes a kickoff prompt to pro_prompts/', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'improve X', now: '2026-07-09T00:00:00Z' });
    const r = actProPrompt(root, { kind: 'kickoff', now: '2026-07-09T00:00:00Z' });
    assert.equal(r.ok, true);
    assert.ok(r.prompt.includes('AI4S-HANDOFF-V1'));
    assert.ok(existsSync(join(root, r.path)));
  });
});

test('actProPrompt review pulls from the saved handoff and runs', () => {
  withTmp((root) => {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    actIngest(root, fixture('handoff-valid.yaml'), { now: '2026-07-09T00:10:00Z' });
    actRecordRun(root, { run_id: 'E1_s0', command: 'python run.py', exit_code: 0, status: 'success' });
    const r = actProPrompt(root, { kind: 'review', now: '2026-07-09T00:20:00Z' });
    assert.equal(r.ok, true);
    assert.match(r.prompt, /next AI4S-HANDOFF-V1/i);
  });
});

// A minimal share-page HTML whose turbo-stream encodes a 2-turn conversation.
function fakeSharePage() {
  const A = [null];
  const push = (v) => A.push(v) - 1;
  const kLinear = push('linear_conversation');
  const kMessage = push('message');
  const kAuthor = push('author');
  const kContent = push('content');
  const kRole = push('role');
  const kParts = push('parts');
  const mk = (role, text) => {
    const roleI = push(role);
    const textI = push(text);
    const partsI = push([textI]);
    const authorI = push({ ['_' + kRole]: roleI });
    const contentI = push({ ['_' + kParts]: partsI });
    const msgI = push({ ['_' + kAuthor]: authorI, ['_' + kContent]: contentI });
    return push({ ['_' + kMessage]: msgI });
  };
  const nodes = [mk('user', 'design an ai4science agent'), mk('assistant', 'here is a plan')];
  const linearI = push(nodes);
  A[0] = { ['_' + kLinear]: linearI };
  const turbo = JSON.stringify(A);
  return `<html><head><title>ChatGPT - Fake Chat</title></head><body>
<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(turbo)});</script>
</body></html>`;
}

test('actImportConversation fetches, saves the transcript, and advances state', async () => {
  await (async () => {
    const root = tmp();
    try {
      actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
      const fetchImpl = async () => ({ ok: true, status: 200, text: async () => fakeSharePage() });
      const r = await actImportConversation(
        root,
        'https://chatgpt.com/share/00000000-0000-4000-8000-000000000001',
        { fetchImpl, now: '2026-07-09T00:10:00Z' },
      );
      assert.equal(r.status, 'imported');
      assert.equal(r.messageCount, 2);
      assert.ok(existsSync(join(root, '.ai4science/pro_conversation.md')));
      const prov = JSON.parse(readFileSync(join(root, '.ai4science/provenance.json'), 'utf8'));
      assert.equal(prov.import_method, 'share_fetch');
      assert.ok(prov.shared_link.includes('00000000'));
      assert.equal(actState(root, { action: 'get' }).state, 'handoff_imported');
      // and with a conversation present, we can advance to validated once a report exists
      writeFileSync(join(root, '.ai4science/validation_report.md'), '# ok\n');
      const adv = actState(root, { action: 'advance', now: '2026-07-09T00:20:00Z' });
      assert.equal(adv.ok, true);
      assert.equal(adv.state, 'validated');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  })();
});

test('actImportConversation rejects a bad link and a bot-blocked fetch', async () => {
  const root = tmp();
  try {
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    const bad = await actImportConversation(root, 'not-a-link', {});
    assert.equal(bad.status, 'error');
    const blocked = await actImportConversation(
      root,
      'https://chatgpt.com/share/00000000-0000-4000-8000-000000000001',
      { fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'nope' }) },
    );
    assert.equal(blocked.status, 'error');
    assert.equal(existsSync(join(root, '.ai4science/pro_conversation.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('actSafetyCheck reports a verdict for an arbitrary command', () => {
  assert.equal(actSafetyCheck('pytest -q').safe, true);
  assert.equal(actSafetyCheck('sudo rm -rf /').safe, false);
});

test('safetyHook throws on a dangerous command only inside an ai4science project', () => {
  withTmp((root) => {
    // no .ai4science yet: hook is a no-op
    assert.doesNotThrow(() => safetyHook(root, 'sudo rm -rf /'));
    actScaffold(root, { goal: 'g', now: '2026-07-09T00:00:00Z' });
    assert.throws(() => safetyHook(root, 'sudo rm -rf /'), /blocked/i);
    assert.doesNotThrow(() => safetyHook(root, 'pytest -q'));
  });
});
