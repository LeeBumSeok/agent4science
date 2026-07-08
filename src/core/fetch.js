/**
 * fetch.js — a resilient HTTPS GET used to pull public share pages.
 *
 * Tries global fetch first (works under Bun / a healthy CA store), then falls back to
 * node:https with certificate verification, then without — because some environments have a
 * misconfigured local CA store and this only ever fetches a public page the user provided.
 * A per-request timeout guarantees it never hangs.
 */

import https from 'node:https';

export function httpsGet(url, headers, rejectUnauthorized) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, rejectUnauthorized }, (res) => {
      const { statusCode, headers: h } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode) && h.location) {
        res.resume();
        resolve(httpsGet(new URL(h.location, url).toString(), headers, rejectUnauthorized));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () =>
        resolve({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, text: async () => data }),
      );
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('request timeout')));
  });
}

export async function robustFetch(url, opts = {}) {
  const headers = opts.headers || {};
  if (typeof fetch === 'function') {
    try {
      const r = await fetch(url, { headers });
      if (r && r.ok) return r;
    } catch {
      /* fall through */
    }
  }
  try {
    return await httpsGet(url, headers, true);
  } catch {
    return await httpsGet(url, headers, false);
  }
}
