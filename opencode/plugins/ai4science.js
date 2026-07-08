/**
 * ai4science.js — OpenCode plugin entry point (oh-my-ai4science).
 *
 * Thin adapter: it wires the tested orchestration functions in ./lib/actions.js to
 * OpenCode custom tools and a `tool.execute.before` safety hook. All real logic lives in
 * ../ai4s-core/*.js so it can be unit-tested with plain Node. install.sh copies
 * src/core/*.js into a sibling ai4s-core/ directory (kept OUT of the plugin scan dir so
 * OpenCode never mistakes a core module for a plugin).
 */

import https from 'node:https';
import { tool } from '@opencode-ai/plugin';
import {
  actScaffold,
  actIngest,
  actImportConversation,
  actState,
  actRecordRun,
  actProPrompt,
  actSafetyCheck,
  safetyHook,
} from '../ai4s-core/actions.js';

const s = tool.schema;

/**
 * Fetch a public URL with node:https, following redirects. Tries with certificate
 * verification first; on a TLS/cert failure (common with a misconfigured local CA store)
 * it retries once without verification, since this only ever fetches a public share page
 * the user explicitly provided.
 */
function httpsGet(url, headers, rejectUnauthorized) {
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
    // Never hang: a stalled connection must fall through to the next strategy.
    req.setTimeout(20000, () => req.destroy(new Error('request timeout')));
  });
}

async function robustFetch(url, opts = {}) {
  const headers = opts.headers || {};
  // 1. Global fetch first — under Bun (OpenCode's runtime) it has a working CA store.
  if (typeof fetch === 'function') {
    try {
      const r = await fetch(url, { headers });
      if (r && r.ok) return r;
    } catch {
      /* fall through */
    }
  }
  // 2. node:https with verification, then 3. without (public page, misconfigured local CA).
  try {
    return await httpsGet(url, headers, true);
  } catch {
    return await httpsGet(url, headers, false);
  }
}

export const AI4SciencePlugin = async ({ directory, worktree }) => {
  const root = directory || worktree || process.cwd();

  return {
    tool: {
      ai4s_scaffold: tool({
        description:
          'Initialize the .ai4science/ research ledger for this project (state, run registry, notebook, results/reports dirs).',
        args: {
          goal: s.string().describe('The scientific goal for this project').optional(),
        },
        async execute(args) {
          const r = actScaffold(root, { goal: args.goal });
          return r.message;
        },
      }),

      ai4s_ingest_handoff: tool({
        description:
          'Parse and validate a pasted AI4S-HANDOFF-V1 block. On success, saves it and advances state to handoff_imported. On failure, returns a patch request to paste back into ChatGPT Pro. Never executes any command from the handoff.',
        args: {
          text: s.string().describe('The full AI4S-HANDOFF-V1 YAML the user pasted'),
          shared_link: s
            .string()
            .describe('ChatGPT share URL, recorded as provenance only (never fetched)')
            .optional(),
        },
        async execute(args) {
          const r = actIngest(root, args.text, { sharedLink: args.shared_link });
          const out = [r.message];
          if (r.patchRequest) {
            out.push('\n--- PASTE THE FOLLOWING INTO CHATGPT PRO ---\n', r.patchRequest);
          }
          if (r.validation) {
            out.push('\nvalidation: ' + JSON.stringify({
              status: r.validation.status,
              missing: r.validation.missing,
              dangerousCommands: r.validation.dangerousCommands,
              pathIssues: r.validation.pathIssues,
            }));
          }
          return out.join('\n');
        },
      }),

      ai4s_import_conversation: tool({
        description:
          'Import a FULL ChatGPT conversation from a public share link (replaces a compact handoff). Fetches the share page, decodes the transcript, saves it to .ai4science/pro_conversation.md, and advances state to handoff_imported. The shared link is recorded as provenance.',
        args: {
          url: s.string().describe('The ChatGPT share URL (https://chatgpt.com/share/...) or bare id'),
        },
        async execute(args) {
          const r = await actImportConversation(root, args.url, { fetchImpl: robustFetch });
          return r.message;
        },
      }),

      ai4s_state: tool({
        description:
          'Inspect or advance the research pipeline state machine. action=get shows current/next/missing; action=advance moves forward only if required artifacts exist; action=force overrides (records a note).',
        args: {
          action: s.string().describe('get | advance | force'),
          target: s.string().describe('Target state for action=force').optional(),
          note: s.string().describe('Optional note recorded in history').optional(),
        },
        async execute(args) {
          const r = actState(root, { action: args.action, target: args.target, note: args.note });
          return JSON.stringify(r, null, 2);
        },
      }),

      ai4s_record_run: tool({
        description:
          'Append a run record to .ai4science/run_registry.jsonl (append-only; never remove failed runs).',
        args: {
          run_id: s.string().describe('Unique run id, e.g. E001_seed0'),
          command: s.string().describe('The exact command executed'),
          exit_code: s.number().describe('Process exit code'),
          status: s.string().describe('success | failed | partial | invalid'),
          hypothesis_id: s.string().optional(),
          metrics_path: s.string().optional(),
          log_path: s.string().optional(),
        },
        async execute(args) {
          const r = actRecordRun(root, args);
          return r.message;
        },
      }),

      ai4s_pro_prompt: tool({
        description:
          'Generate a ChatGPT Pro prompt and save it under .ai4science/pro_prompts/. kind=kickoff (start a research discussion), handoff-request (ask for the final block), or review (build the next-iteration prompt from results).',
        args: {
          kind: s.string().describe('kickoff | handoff-request | review'),
        },
        async execute(args) {
          const r = actProPrompt(root, { kind: args.kind });
          return `Saved to ${r.path}\n\n--- COPY INTO CHATGPT PRO ---\n\n${r.prompt}`;
        },
      }),

      ai4s_safety_check: tool({
        description:
          'Screen a single shell command against the safety denylist before running it. Returns whether it is safe and, if not, the rule and reason.',
        args: {
          command: s.string().describe('The command to screen'),
        },
        async execute(args) {
          return JSON.stringify(actSafetyCheck(args.command));
        },
      }),
    },

    // Block dangerous bash inside an ai4science project. No-op elsewhere.
    'tool.execute.before': async (input, output) => {
      if (input?.tool !== 'bash') return;
      const command = output?.args?.command;
      if (typeof command === 'string') {
        safetyHook(root, command);
      }
    },
  };
};

export default AI4SciencePlugin;
