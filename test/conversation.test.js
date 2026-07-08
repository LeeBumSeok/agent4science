import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseShareId,
  parseShareUrl,
  extractEnqueues,
  decodeShareHtml,
  extractMessages,
  conversationToMarkdown,
  htmlToConversation,
  claudeSnapshotToConversation,
  decodeConversation,
} from '../src/core/conversation.js';

/**
 * Build a synthetic ChatGPT-share-style HTML page whose embedded React Router turbo-stream
 * encodes a small conversation. Elements are index references into a flat pool, exactly like
 * the real payload.
 */
function makeFixtureHtml(messages, { title = 'Test Conversation' } = {}) {
  // Flat pool with index references. Layout mirrors the real structure:
  // node -> { message: { author: { role }, content: { parts: [text] } } }
  const A = [];
  const push = (v) => A.push(v) - 1;
  // reserve index 0 for root
  A.push(null);
  const kLinear = push('linear_conversation');
  const kMessage = push('message');
  const kAuthor = push('author');
  const kContent = push('content');
  const kRole = push('role');
  const kParts = push('parts');

  const nodeIdx = [];
  for (const m of messages) {
    const roleIdx = push(m.role);
    const textIdx = push(m.text);
    const partsArrIdx = push([textIdx]); // array elements are references
    const authorIdx = push({ ['_' + kRole]: roleIdx });
    const contentIdx = push({ ['_' + kParts]: partsArrIdx });
    const messageIdx = push({ ['_' + kAuthor]: authorIdx, ['_' + kContent]: contentIdx });
    const nIdx = push({ ['_' + kMessage]: messageIdx });
    nodeIdx.push(nIdx);
  }
  const linearArrIdx = push(nodeIdx.slice());
  A[0] = { ['_' + kLinear]: linearArrIdx };

  const turbo = JSON.stringify(A);
  return `<!doctype html><html><head><title>ChatGPT - ${title}</title></head><body>
<script>window.__reactRouterContext = {};</script>
<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(turbo)});</script>
<script>window.__reactRouterContext.streamController.close();</script>
</body></html>`;
}

const SAMPLE = [
  { role: 'user', text: 'Explain multi-agent orchestration?' },
  { role: 'assistant', text: 'It is coordinating several agents as a team.' },
  { role: 'system', text: '' },
  { role: 'user', text: 'Now design an AI4Science agent.' },
  { role: 'assistant', text: 'Here is a plan with hypotheses and experiments.' },
];

test('parseShareId accepts full URLs, /continue, and bare ids', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(parseShareId(`https://chatgpt.com/share/${id}`), id);
  assert.equal(parseShareId(`https://chatgpt.com/share/${id}/continue`), id);
  assert.equal(parseShareId(id), id);
});

test('parseShareId rejects junk', () => {
  assert.throws(() => parseShareId('not a share link'), /share/i);
});

test('extractEnqueues pulls the turbo-stream string(s) from the HTML', () => {
  const html = makeFixtureHtml(SAMPLE);
  const chunks = extractEnqueues(html);
  assert.ok(chunks.length >= 1);
  // each chunk JSON-parses to a string that itself JSON-parses to an array
  const arr = JSON.parse(JSON.parse(chunks[0]));
  assert.ok(Array.isArray(arr));
});

test('decodeShareHtml resolves the flat pool into a linear_conversation', () => {
  const html = makeFixtureHtml(SAMPLE);
  const { root } = decodeShareHtml(html);
  // deep somewhere there is a linear_conversation array
  const found = JSON.stringify(root).includes('linear_conversation');
  assert.equal(found, true);
});

test('extractMessages returns ordered user/assistant turns with text', () => {
  const html = makeFixtureHtml(SAMPLE);
  const { root } = decodeShareHtml(html);
  const msgs = extractMessages(root);
  // system / empty messages dropped
  assert.deepEqual(
    msgs.map((m) => m.role),
    ['user', 'assistant', 'user', 'assistant'],
  );
  assert.equal(msgs[0].text, 'Explain multi-agent orchestration?');
  assert.equal(msgs[3].text, 'Here is a plan with hypotheses and experiments.');
});

test('conversationToMarkdown renders a readable transcript', () => {
  const md = conversationToMarkdown(
    [
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
    ],
    { title: 'My Chat', shareUrl: 'https://chatgpt.com/share/x' },
  );
  assert.ok(md.includes('My Chat'));
  assert.ok(md.includes('https://chatgpt.com/share/x'));
  assert.ok(md.includes('q1'));
  assert.ok(md.includes('a1'));
  assert.match(md, /##\s*(User|Assistant)/i);
});

test('htmlToConversation is an end-to-end convenience', () => {
  const html = makeFixtureHtml(SAMPLE, { title: 'E2E' });
  const r = htmlToConversation(html, { shareUrl: 'https://chatgpt.com/share/x' });
  assert.equal(r.messageCount, 4);
  assert.ok(r.title.includes('E2E'));
  assert.ok(r.markdown.includes('Explain multi-agent orchestration?'));
});

test('htmlToConversation throws a clear error when no conversation is present', () => {
  assert.throws(
    () => htmlToConversation('<html><body>login shell only</body></html>', {}),
    /could not extract|no conversation/i,
  );
});

test('htmlToConversation flags redacted deep-research shares and drops the placeholder', () => {
  const html = makeFixtureHtml([
    { role: 'user', text: 'research agentic RL for me' },
    { role: 'assistant', text: 'The output of this plugin was redacted.' },
  ]);
  const r = htmlToConversation(html, {});
  // the redaction placeholder is dropped; only the real prompt remains
  assert.equal(r.messageCount, 1);
  assert.equal(r.messages[0].role, 'user');
  assert.ok(r.warnings.length >= 1);
  assert.match(r.warnings[0], /deep-research|redacted/i);
});

test('htmlToConversation throws a helpful error when a share is fully redacted', () => {
  const html = makeFixtureHtml([
    { role: 'assistant', text: 'The output of this plugin was redacted.' },
  ]);
  assert.throws(() => htmlToConversation(html, {}), /redacted/i);
});

test('parseShareUrl detects ChatGPT vs Claude and picks the right fetch URL', () => {
  const cg = parseShareUrl('https://chatgpt.com/share/00000000-0000-4000-8000-000000000001');
  assert.equal(cg.provider, 'chatgpt');
  assert.equal(cg.kind, 'html');
  assert.ok(cg.fetchUrl.startsWith('https://chatgpt.com/share/'));

  const cl = parseShareUrl('https://claude.ai/share/00000000-0000-4000-8000-000000000002');
  assert.equal(cl.provider, 'claude');
  assert.equal(cl.kind, 'json');
  assert.equal(cl.fetchUrl, 'https://api.anthropic.com/api/chat_snapshots/00000000-0000-4000-8000-000000000002');

  // bare id defaults to chatgpt for back-compat
  assert.equal(parseShareUrl('00000000-0000-4000-8000-000000000001').provider, 'chatgpt');
});

test('claudeSnapshotToConversation parses the snapshot JSON shape', () => {
  const snapshot = {
    snapshot_name: 'Paper review',
    chat_messages: [
      { sender: 'human', text: 'review this paper?' },
      { sender: 'assistant', text: '', content: [{ type: 'text', text: 'Here is my review.' }] },
      { sender: 'assistant', text: '   ' }, // empty → dropped
    ],
  };
  const r = claudeSnapshotToConversation(JSON.stringify(snapshot), {
    shareUrl: 'https://claude.ai/share/x',
  });
  assert.equal(r.messageCount, 2);
  assert.equal(r.title, 'Paper review');
  assert.deepEqual(r.messages.map((m) => m.role), ['user', 'assistant']);
  assert.ok(r.markdown.includes('review this paper?'));
  assert.ok(r.markdown.includes('Here is my review.'));
  assert.match(r.markdown, /Provider:\*\*\s*claude/);
});

test('claudeSnapshotToConversation throws on an empty snapshot', () => {
  assert.throws(
    () => claudeSnapshotToConversation(JSON.stringify({ chat_messages: [] })),
    /could not extract|no conversation/i,
  );
});

test('decodeConversation dispatches by provider', () => {
  const claudeJson = JSON.stringify({
    snapshot_name: 'C',
    chat_messages: [{ sender: 'human', text: 'hi' }, { sender: 'assistant', text: 'hello' }],
  });
  const r = decodeConversation({ provider: 'claude', raw: claudeJson, shareUrl: 'https://claude.ai/share/x' });
  assert.equal(r.messageCount, 2);
  assert.equal(r.messages[0].role, 'user');
});
