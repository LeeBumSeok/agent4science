/**
 * actions.js — orchestration layer between the pure primitives and the OpenCode plugin.
 *
 * Every custom tool and the safety hook the plugin exposes is a thin wrapper around a
 * function here. Keeping the real logic in this module means it is all unit-testable with
 * plain Node, and the plugin file stays a trivial adapter.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest as ingestHandoff } from './handoff.js';
import {
  scaffold,
  readState,
  writeState,
  saveHandoff,
  saveConversation,
  recordRun,
  readRuns,
  makeExists,
} from './ledger.js';
import { canAdvance, nextState } from './state.js';
import { screenCommand } from './safety.js';
import { kickoffPrompt, handoffRequestPrompt, reviewPrompt } from './prompts.js';
import { parseShareUrl, decodeConversation } from './conversation.js';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function hasLedger(root) {
  return existsSync(join(root, '.ai4science'));
}

/** Initialize the research ledger. */
export function actScaffold(root, { goal, now } = {}) {
  const { created } = scaffold(root, { goal, now });
  return {
    ok: true,
    created,
    message:
      created.length > 0
        ? `Initialized .ai4science/ (state: initialized). Next: /ai4s-pro-prompt to draft a prompt for your web research model (e.g. GPT Pro, Claude/Fable).`
        : `.ai4science/ already initialized. Current state: ${readState(root).state}.`,
  };
}

/**
 * Ingest a pasted handoff. Parses, validates, and — only when the handoff is acceptable
 * (`valid` or `needs_human_review`) — saves it and advances to `handoff_imported`.
 * Otherwise returns a patch request and leaves state untouched.
 */
export function actIngest(root, text, { sharedLink, now } = {}) {
  const res = ingestHandoff(text);
  if (!res.parsed) {
    return {
      status: 'parse_error',
      message: `Could not parse the handoff: ${res.error}. Paste the full AI4S-HANDOFF-V1 YAML block.`,
    };
  }

  const v = res.validation;
  const acceptable = v.status === 'valid' || v.status === 'needs_human_review';

  if (!acceptable) {
    return {
      status: v.status,
      validation: v,
      patchRequest: v.patchRequest,
      message:
        v.status === 'blocked'
          ? 'Handoff BLOCKED (dangerous command, path escape, or wrong schema). Nothing was saved. Paste the patch request below into ChatGPT Pro.'
          : 'Handoff needs revision. Nothing was saved. Paste the patch request below into ChatGPT Pro.',
    };
  }

  // Persist the raw YAML the user pasted + provenance, then advance.
  const yamlText = extractYaml(text);
  const prov = saveHandoff(root, yamlText, {
    shared_link: sharedLink,
    imported_at: now || new Date().toISOString(),
    import_method: 'manual_paste',
  });
  writeState(root, 'handoff_imported', { now, note: `imported ${v.status}` });

  const warn =
    v.status === 'needs_human_review'
      ? ' NOTE: safety.risk_level is high — /ai4s-validate will require your explicit approval before proceeding.'
      : '';

  return {
    status: v.status,
    validation: v,
    provenance: prov,
    message: `Handoff imported (${v.status}). State: handoff_imported. Next: /ai4s-validate.${warn}`,
  };
}

/**
 * Import a FULL ChatGPT conversation from a public share link (replaces a compact handoff).
 * Fetches the share page, decodes the embedded transcript, saves it as pro_conversation.md +
 * provenance, and advances to `handoff_imported`.
 *
 * `fetchImpl` is injectable for testing; it defaults to global fetch. It must resolve to an
 * object with `.ok`, `.status`, and `.text()`.
 * @param {string} root
 * @param {string} url  the share URL (or bare id)
 * @param {{fetchImpl?: Function, now?: string}} opts
 */
export async function actImportConversation(root, url, { fetchImpl, now } = {}) {
  let target;
  try {
    target = parseShareUrl(url);
  } catch (err) {
    return {
      status: 'error',
      message: `Not a valid ChatGPT or Claude share link: ${err.message}`,
    };
  }
  const { provider, fetchUrl } = target;
  const shareUrl = url;

  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) {
    return { status: 'error', message: 'No fetch implementation available in this runtime.' };
  }

  const accept = target.kind === 'json' ? 'application/json' : 'text/html';
  let raw;
  try {
    const resp = await doFetch(fetchUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: accept },
    });
    if (!resp || resp.ok === false) {
      return {
        status: 'error',
        message: `Failed to fetch the ${provider} share (HTTP ${resp && resp.status}). The page may be private, unshared, or bot-blocked. As a fallback, paste the conversation text or an AI4S-HANDOFF-V1 block via /ai4s-ingest.`,
      };
    }
    raw = await resp.text();
  } catch (err) {
    return {
      status: 'error',
      message: `Network error fetching the ${provider} share: ${err.message}. If this is a TLS/certificate issue, set NODE_EXTRA_CA_CERTS, or paste the conversation manually.`,
    };
  }

  let convo;
  try {
    convo = decodeConversation({ provider, raw, shareUrl });
  } catch (err) {
    return {
      status: 'error',
      message: `Could not extract a conversation from that ${provider} share: ${err.message}. The share format may have changed; paste the conversation text manually instead.`,
    };
  }

  const prov = saveConversation(root, convo.markdown, {
    shared_link: shareUrl,
    provider,
    conversation_title: convo.title,
    imported_at: now || new Date().toISOString(),
    import_method: 'share_fetch',
    message_count: convo.messageCount,
  });
  writeState(root, 'handoff_imported', { now, note: `imported full ${provider} conversation` });

  const warn = (convo.warnings && convo.warnings.length)
    ? '\n\nWARNING: ' + convo.warnings.join(' ')
    : '';

  return {
    status: 'imported',
    provider,
    title: convo.title,
    messageCount: convo.messageCount,
    warnings: convo.warnings || [],
    provenance: prov,
    message: `Imported full ${provider} conversation "${convo.title}" (${convo.messageCount} turns) → .ai4science/pro_conversation.md. State: handoff_imported. Next: /ai4s-validate (it will derive the research plan from the conversation).${warn}`,
  };
}

/** Extract the fenced YAML if present, else return the text as-is (keeps stored file clean). */
function extractYaml(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*```/.test(l));
  if (start === -1) return text;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n') + '\n';
}

/**
 * Get, advance, or force the pipeline state.
 * @param {string} root
 * @param {{action: 'get'|'advance'|'force', target?: string, note?: string, now?: string}} opts
 */
export function actState(root, { action = 'get', target, note, now } = {}) {
  const state = readState(root).state;

  if (action === 'get') {
    const adv = canAdvance(state, makeExists(root));
    return {
      ok: true,
      state,
      next: nextState(state),
      canAdvance: adv.ok,
      missing: adv.missing,
    };
  }

  if (action === 'advance') {
    const adv = canAdvance(state, makeExists(root));
    if (!adv.ok) {
      return {
        ok: false,
        state,
        target: adv.target,
        missing: adv.missing,
        reason: adv.reason,
        message: adv.target
          ? `Cannot advance to ${adv.target}: missing ${adv.missing.join(', ')}.`
          : `Already at the terminal state (${state}).`,
      };
    }
    writeState(root, adv.target, { now, note });
    return { ok: true, state: adv.target, message: `Advanced to ${adv.target}.` };
  }

  if (action === 'force') {
    if (!target) return { ok: false, message: 'force requires a target state.' };
    writeState(root, target, { now, note: note || 'forced transition' });
    return { ok: true, state: target, message: `Forced state to ${target}.` };
  }

  return { ok: false, message: `Unknown state action: ${action}` };
}

/** Append a run record. */
export function actRecordRun(root, record) {
  recordRun(root, record);
  return { ok: true, message: `Recorded run ${record.run_id || '(unnamed)'} [${record.status || 'unknown'}].` };
}

/**
 * Generate and save a ChatGPT Pro prompt.
 * @param {{kind: 'kickoff'|'handoff-request'|'review', now?: string}} opts
 */
export function actProPrompt(root, { kind = 'kickoff', now } = {}) {
  let prompt;
  let name;

  if (kind === 'handoff-request') {
    prompt = handoffRequestPrompt();
    name = 'handoff_request';
  } else if (kind === 'review') {
    prompt = buildReviewPrompt(root);
    name = 'review';
  } else {
    const goal = hasLedger(root) ? readState(root).goal : '';
    prompt = kickoffPrompt({ goal });
    name = 'kickoff';
  }

  const stamp = (now || new Date().toISOString()).replace(/[:.]/g, '-');
  const rel = join('.ai4science', 'pro_prompts', `${name}_${stamp}.md`);
  writeFileSync(join(root, rel), prompt + '\n');
  return { ok: true, kind, path: rel, prompt };
}

/** Assemble a review prompt from the saved handoff and run registry. */
function buildReviewPrompt(root) {
  let researchQuestion = '';
  let hypothesis = '';
  const handoffPath = join(root, '.ai4science/handoff.yaml');
  if (existsSync(handoffPath)) {
    const text = readFileSync(handoffPath, 'utf8');
    researchQuestion = matchField(text, 'research_question');
    hypothesis = matchField(text, 'statement');
  }
  const runs = existsSync(join(root, '.ai4science')) ? readRuns(root) : [];
  const commandsRun = runs.map((r) => r.command).filter(Boolean);
  const failures = runs
    .filter((r) => r.status && r.status !== 'success')
    .map((r) => `${r.run_id || 'run'}: ${r.status}`);
  return reviewPrompt({ researchQuestion, hypothesis, commandsRun, failures });
}

function matchField(yamlText, key) {
  const m = yamlText.match(new RegExp(`${key}:\\s*"?([^"\\n]+)"?`));
  return m ? m[1].trim() : '';
}

/** Screen a single command (for an agent's pre-execution self-check). */
export function actSafetyCheck(command) {
  return screenCommand(command);
}

/**
 * The `tool.execute.before` hook body: block dangerous bash inside an ai4science project.
 * A no-op when the project has no ledger, so it never interferes with unrelated repos.
 * Throws (which OpenCode surfaces as a blocked tool call) on a denylist hit.
 */
export function safetyHook(root, command) {
  if (!hasLedger(root)) return;
  const r = screenCommand(command);
  if (!r.safe) {
    throw new Error(
      `ai4science: command blocked by safety policy (${r.rule}: ${r.reason}). ` +
        `Command: ${command}`,
    );
  }
}
