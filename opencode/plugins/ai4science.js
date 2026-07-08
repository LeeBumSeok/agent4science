/**
 * ai4science.js — OpenCode plugin entry point (agent4science).
 *
 * Thin adapter: it wires the tested orchestration functions in ./lib/actions.js to
 * OpenCode custom tools and a `tool.execute.before` safety hook. All real logic lives in
 * ../ai4s-core/*.js so it can be unit-tested with plain Node. install.sh copies
 * src/core/*.js into a sibling ai4s-core/ directory (kept OUT of the plugin scan dir so
 * OpenCode never mistakes a core module for a plugin).
 */

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
import { robustFetch } from '../ai4s-core/fetch.js';

const s = tool.schema;

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
          'Import a FULL shared conversation from ChatGPT (chatgpt.com/share/...) or Claude (claude.ai/share/...) into .ai4science/pro_conversation.md, and advance state to handoff_imported. Replaces a compact handoff. The shared link is recorded as provenance.',
        args: {
          url: s.string().describe('A ChatGPT or Claude share URL (or bare share id)'),
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
