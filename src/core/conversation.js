/**
 * conversation.js — extract a full shared conversation from a public link.
 *
 * Two providers are supported:
 *  - ChatGPT (`chatgpt.com/share/<id>`): the share page server-renders the conversation in
 *    React Router's turbo-stream format — a flat pool of values where objects/arrays
 *    reference other entries by numeric index and keys are `_<index>` references. We decode
 *    the pool and walk it for `linear_conversation`.
 *  - Claude (`claude.ai/share/<id>`): the page is a client-rendered SPA, but the snapshot is
 *    served as JSON from `api.anthropic.com/api/chat_snapshots/<id>`. We parse that directly.
 *
 * Everything here is pure (no network); the caller passes the already-fetched body. This runs
 * only at the user's explicit request on a link they chose to share — a single fetch, not
 * bulk scraping.
 */

const SHARE_ID_RE = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/**
 * Extract the 36-char share id from a share URL, a /continue URL, or a bare id.
 * @param {string} urlOrId
 * @returns {string}
 */
export function parseShareId(urlOrId) {
  if (typeof urlOrId !== 'string') throw new Error('share link must be a string');
  const m = urlOrId.match(SHARE_ID_RE);
  if (!m) throw new Error(`could not find a share id in: ${urlOrId}`);
  return m[1];
}

/**
 * Detect the provider and the URL/format to fetch for a share link.
 * @param {string} urlOrId
 * @returns {{provider: 'chatgpt'|'claude', id: string, fetchUrl: string, kind: 'html'|'json'}}
 */
export function parseShareUrl(urlOrId) {
  const id = parseShareId(urlOrId);
  const s = String(urlOrId);
  if (/claude\.ai/i.test(s)) {
    return {
      provider: 'claude',
      id,
      fetchUrl: `https://api.anthropic.com/api/chat_snapshots/${id}`,
      kind: 'json',
    };
  }
  // chatgpt.com, chat.openai.com, or a bare id (back-compat default).
  return {
    provider: 'chatgpt',
    id,
    fetchUrl: `https://chatgpt.com/share/${id}`,
    kind: 'html',
  };
}

/**
 * Pull the JSON-string argument(s) of every `streamController.enqueue("...")` call.
 * Returns an array of the raw quoted JSON strings (each JSON.parses to the turbo-stream text).
 * @param {string} html
 * @returns {string[]}
 */
export function extractEnqueues(html) {
  const out = [];
  const marker = 'streamController.enqueue(';
  let i = 0;
  while ((i = html.indexOf(marker, i)) !== -1) {
    let j = i + marker.length;
    if (html[j] !== '"') { i = j + 1; continue; }
    let k = j + 1;
    let s = '';
    while (k < html.length) {
      const c = html[k];
      if (c === '\\') { s += html[k] + html[k + 1]; k += 2; continue; }
      if (c === '"') break;
      s += c; k++;
    }
    out.push('"' + s + '"');
    i = k + 1;
  }
  return out;
}

/**
 * Build a resolver over the flat turbo-stream pool. Container entries are indices; negative
 * values are sentinels (treated as null); object keys `_<n>` dereference to string keys.
 */
function makeResolver(pool) {
  const cache = new Map();
  function res(i) {
    if (typeof i !== 'number') return i;
    if (i < 0) return null;
    if (cache.has(i)) return cache.get(i);
    const v = pool[i];
    let out;
    if (Array.isArray(v)) {
      out = [];
      cache.set(i, out);
      for (const e of v) out.push(res(e));
    } else if (v && typeof v === 'object') {
      out = {};
      cache.set(i, out);
      for (const [k, val] of Object.entries(v)) {
        const rk = /^_-?\d+$/.test(k) ? res(Number(k.slice(1))) : k;
        out[rk] = res(val);
      }
    } else {
      out = v;
      cache.set(i, out);
    }
    cache.set(i, out);
    return out;
  }
  return res;
}

/**
 * Decode the share HTML into its resolved root object plus the raw pool.
 * @param {string} html
 * @returns {{root: any, pool: any[]}}
 */
export function decodeShareHtml(html) {
  const chunks = extractEnqueues(html);
  if (chunks.length === 0) {
    throw new Error('no conversation stream found in the share page');
  }
  const innerStrings = chunks.map((c) => JSON.parse(c));
  const pool = JSON.parse(innerStrings[0]);
  // Later chunks are patch lines like "P<index>:<json>" resolving deferred entries.
  for (const patch of innerStrings.slice(1)) {
    for (const line of patch.split('\n')) {
      const m = line.match(/^P(\d+):(.*)$/s);
      if (m) {
        try {
          pool[Number(m[1])] = JSON.parse(m[2]);
        } catch {
          /* ignore unparseable patch lines */
        }
      }
    }
  }
  const root = makeResolver(pool)(0);
  return { root, pool };
}

/** Deep-find the first value stored under `key` anywhere in a resolved object graph. */
function deepFind(obj, key, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return undefined;
  seen.add(obj);
  if (!Array.isArray(obj) && Object.prototype.hasOwnProperty.call(obj, key)) {
    return obj[key];
  }
  for (const v of Object.values(obj)) {
    const r = deepFind(v, key, seen);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** Pull readable text out of a message content object across known shapes. */
function messageText(message) {
  const content = message && message.content;
  if (!content) return '';
  const parts = content.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((p) => (typeof p === 'string' ? p : p && typeof p.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof content.text === 'string') return content.text.trim();
  return '';
}

/**
 * Extract ordered user/assistant turns (with non-empty text) from a decoded root.
 * @param {any} root
 * @returns {Array<{role: string, text: string}>}
 */
/** ChatGPT redacts tool/plugin output (e.g. a deep-research report) in public shares. */
const REDACTION_RE = /output of this plugin was redacted/i;

export function extractMessages(root) {
  const linear = deepFind(root, 'linear_conversation');
  if (!Array.isArray(linear)) return [];
  const msgs = [];
  for (const node of linear) {
    const message = node && (node.message || node);
    const role = message && message.author && message.author.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = messageText(message);
    if (!text) continue;
    if (REDACTION_RE.test(text)) continue; // a redacted tool-output placeholder, not content
    msgs.push({ role, text });
  }
  return msgs;
}

/**
 * Render a Markdown transcript.
 * @param {Array<{role:string,text:string}>} messages
 * @param {{title?: string, shareUrl?: string}} meta
 * @returns {string}
 */
export function conversationToMarkdown(messages, meta = {}) {
  const head = [`# Imported Research Conversation`, ''];
  if (meta.provider) head.push(`**Provider:** ${meta.provider}`);
  if (meta.title) head.push(`**Title:** ${meta.title}`);
  if (meta.shareUrl) head.push(`**Source (provenance only):** ${meta.shareUrl}`);
  head.push(`**Turns:** ${messages.length}`, '');
  head.push(
    '> Imported full conversation. This transcript is the research context that replaces a',
    '> compact handoff. Downstream steps derive the hypothesis, experiment, and tasks from it.',
    '',
    '---',
    '',
  );
  const body = messages.map((m) => {
    const label = m.role === 'user' ? 'User' : 'Assistant';
    return `## ${label}\n\n${m.text}\n`;
  });
  return head.join('\n') + '\n' + body.join('\n');
}

/** Read the <title>, trimming the "ChatGPT - " prefix ChatGPT adds. */
function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/^ChatGPT\s*-\s*/i, '').trim();
}

/**
 * End-to-end: HTML → { markdown, title, messageCount }.
 * @param {string} html
 * @param {{shareUrl?: string}} meta
 */
export function htmlToConversation(html, meta = {}) {
  const { root } = decodeShareHtml(html);
  const messages = extractMessages(root);
  const redacted = REDACTION_RE.test(html);
  if (messages.length === 0) {
    if (redacted) {
      throw new Error(
        'the share appears to be a deep-research result whose report ChatGPT redacted in the ' +
          'public share — paste the report text manually instead',
      );
    }
    throw new Error('could not extract any conversation turns from the share page');
  }
  const title = extractTitle(html);
  const warnings = redacted
    ? [
        'This looks like a deep-research share: ChatGPT redacted the report from the public ' +
          'share, so only the prompt (and any non-redacted turns) were imported. Paste the ' +
          'report text manually if you need it.',
      ]
    : [];
  return {
    markdown: conversationToMarkdown(messages, { ...meta, title, provider: 'chatgpt' }),
    title,
    messageCount: messages.length,
    messages,
    warnings,
  };
}

/**
 * Decode a Claude share snapshot JSON (from api.anthropic.com/api/chat_snapshots/<id>).
 * @param {string|object} json  the snapshot JSON (string or already-parsed object)
 * @param {{shareUrl?: string}} meta
 * @returns {{markdown: string, title: string, messageCount: number, messages: Array}}
 */
export function claudeSnapshotToConversation(json, meta = {}) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (err) {
    throw new Error(`could not parse Claude snapshot JSON: ${err.message}`);
  }
  const raw = (data && (data.chat_messages || data.messages)) || [];
  const messages = [];
  for (const m of raw) {
    const sender = m && (m.sender || m.role);
    const role = sender === 'human' ? 'user' : sender;
    if (role !== 'user' && role !== 'assistant') continue;
    let text = typeof m.text === 'string' ? m.text : '';
    if (!text.trim() && Array.isArray(m.content)) {
      text = m.content
        .map((c) => (typeof c === 'string' ? c : c && typeof c.text === 'string' ? c.text : ''))
        .filter(Boolean)
        .join('\n');
    }
    text = (text || '').trim();
    if (!text) continue;
    messages.push({ role, text });
  }
  if (messages.length === 0) {
    throw new Error('could not extract any conversation turns from the Claude snapshot');
  }
  const title = (data && (data.snapshot_name || data.name)) || '';
  return {
    markdown: conversationToMarkdown(messages, { ...meta, title, provider: 'claude' }),
    title,
    messageCount: messages.length,
    messages,
  };
}

/**
 * Unified decoder: dispatch on provider to the right parser.
 * @param {{provider: 'chatgpt'|'claude', raw: string, shareUrl?: string}} input
 */
export function decodeConversation({ provider, raw, shareUrl }) {
  if (provider === 'claude') return claudeSnapshotToConversation(raw, { shareUrl });
  return htmlToConversation(raw, { shareUrl });
}
