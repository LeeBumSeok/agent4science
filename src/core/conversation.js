/**
 * conversation.js — extract a full ChatGPT conversation from a public /share/ page.
 *
 * The share page embeds the conversation in React Router's turbo-stream format: a flat pool
 * of values where objects/arrays reference other entries by numeric index, and object keys
 * are themselves `_<index>` references into the pool. This module decodes that pool, walks it
 * for the `linear_conversation`, and renders a clean Markdown transcript.
 *
 * Only the public share HTML is used (the backend-api endpoint is bot-blocked). This runs at
 * the user's explicit request on a link they chose to share — a single fetch, not bulk
 * scraping. It is pure (no network); the caller passes the already-fetched HTML.
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
  const head = [`# ChatGPT Pro Research Conversation`, ''];
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
  if (messages.length === 0) {
    throw new Error('could not extract any conversation turns from the share page');
  }
  const title = extractTitle(html);
  return {
    markdown: conversationToMarkdown(messages, { ...meta, title }),
    title,
    messageCount: messages.length,
    messages,
  };
}
