/**
 * handoff.js — parse and validate an AI4S-HANDOFF-V1 block.
 *
 * The handoff is untrusted input produced by ChatGPT Pro and pasted in by the user. This
 * module extracts the YAML (from a fenced block or raw text), checks required fields,
 * screens every proposed command, and verifies artifact paths stay under `.ai4science/`.
 * When the handoff is not `valid`, it composes a patch request the user can paste back
 * into ChatGPT Pro to get a corrected block.
 */

import YAML from 'yaml';
import { screenCommands, isSafeArtifactPath } from './safety.js';

const SCHEMA_ID = 'AI4S-HANDOFF-V1';

/**
 * Extract the handoff YAML from text and parse it. Accepts raw YAML or a fenced code
 * block (```yaml, ```AI4S-HANDOFF-V1, or a bare ``` fence) possibly surrounded by prose.
 * @param {string} text
 * @returns {{ok: boolean, data?: any, error?: string}}
 */
export function parseHandoff(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'empty handoff input' };
  }
  const yamlText = extractFencedBlock(text) ?? text;
  try {
    const data = YAML.parse(yamlText);
    if (data === null || typeof data !== 'object') {
      return { ok: false, error: 'handoff did not parse to a mapping' };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `YAML parse error: ${err.message}` };
  }
}

/**
 * Return the contents of the first fenced code block, or null if there is no fence.
 */
function extractFencedBlock(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      return body.join('\n');
    }
    body.push(lines[i]);
  }
  // Unterminated fence: take everything after the opening fence.
  return body.join('\n');
}

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

/**
 * Required simple string fields (path → validator).
 */
const REQUIRED_STRINGS = [
  'project.name',
  'project.domain',
  'project.research_question',
  'hypothesis.id',
  'hypothesis.statement',
  'experiment.id',
  'experiment.metrics.primary.name',
  'implementation.language',
  'safety.risk_level',
];

/**
 * Required non-empty array fields.
 */
const REQUIRED_ARRAYS = [
  'experiment.baselines',
  'experiment.success_criteria',
  'experiment.failure_criteria',
  'experiment.seeds',
  'implementation.tasks',
  'analysis_plan.required_checks',
  'cli_must_not',
];

/**
 * Collect the paths of missing / empty required fields.
 */
function collectMissing(data) {
  const missing = [];
  for (const p of REQUIRED_STRINGS) {
    if (!isNonEmptyString(get(data, p))) missing.push(p);
  }
  for (const p of REQUIRED_ARRAYS) {
    if (!isNonEmptyArray(get(data, p))) missing.push(p);
  }
  // Per-task subfields.
  const tasks = get(data, 'implementation.tasks');
  if (Array.isArray(tasks)) {
    tasks.forEach((t, i) => {
      for (const field of ['id', 'title', 'acceptance']) {
        if (!isNonEmptyString(t && t[field])) {
          missing.push(`implementation.tasks[${i}].${field}`);
        }
      }
    });
  }
  return missing;
}

/**
 * Gather every command string proposed under `commands.*`.
 */
function collectCommands(data) {
  const commands = get(data, 'commands');
  if (commands == null || typeof commands !== 'object') return [];
  const out = [];
  for (const group of Object.values(commands)) {
    if (Array.isArray(group)) {
      for (const c of group) if (typeof c === 'string') out.push(c);
    }
  }
  return out;
}

/**
 * Gather every artifact path declared under `artifacts.*` (string values only).
 */
function collectArtifactPaths(data) {
  const artifacts = get(data, 'artifacts');
  if (artifacts == null || typeof artifacts !== 'object') return [];
  return Object.values(artifacts).filter((v) => typeof v === 'string');
}

/**
 * Validate a parsed handoff object.
 * @param {any} data
 * @returns {{
 *   status: 'valid'|'needs_revision'|'needs_human_review'|'blocked',
 *   schemaMismatch: boolean,
 *   missing: string[],
 *   dangerousCommands: Array<{command:string, rule:string, reason:string}>,
 *   pathIssues: string[],
 *   riskLevel: string|undefined,
 *   patchRequest: string|null,
 * }}
 */
export function validateHandoff(data) {
  const result = {
    status: 'valid',
    schemaMismatch: false,
    missing: [],
    dangerousCommands: [],
    pathIssues: [],
    riskLevel: get(data, 'safety.risk_level'),
    patchRequest: null,
  };

  // 1. Schema identity — a mismatch is fatal.
  if (!data || data.schema !== SCHEMA_ID) {
    result.schemaMismatch = true;
    result.status = 'blocked';
    result.patchRequest = composePatchRequest(result);
    return result;
  }

  // 2. Required fields.
  result.missing = collectMissing(data);

  // 3. Command screening.
  result.dangerousCommands = screenCommands(collectCommands(data)).violations;

  // 4. Artifact path screening.
  result.pathIssues = collectArtifactPaths(data).filter((p) => !isSafeArtifactPath(p));

  // 5. Decide status (blocked > needs_revision > needs_human_review > valid).
  if (result.dangerousCommands.length > 0 || result.pathIssues.length > 0) {
    result.status = 'blocked';
  } else if (result.missing.length > 0) {
    result.status = 'needs_revision';
  } else if (String(result.riskLevel).toLowerCase() === 'high') {
    result.status = 'needs_human_review';
  } else {
    result.status = 'valid';
  }

  result.patchRequest = result.status === 'valid' ? null : composePatchRequest(result);
  return result;
}

/**
 * Compose an English patch request the user pastes back into ChatGPT Pro.
 */
function composePatchRequest(result) {
  if (result.status === 'needs_human_review') {
    return null; // handled by an explicit user-approval prompt, not a Pro round-trip
  }
  const lines = [
    'The AI4S-HANDOFF-V1 block could not be accepted by the CLI. Please regenerate a',
    'corrected AI4S-HANDOFF-V1 block that fixes the following, and output only the block:',
    '',
  ];
  if (result.schemaMismatch) {
    lines.push('- The first line must be exactly `schema: AI4S-HANDOFF-V1`.');
  }
  if (result.missing.length > 0) {
    lines.push('- Missing or empty required fields:');
    for (const m of result.missing) lines.push(`    - ${m}`);
  }
  if (result.dangerousCommands.length > 0) {
    lines.push('- Remove or replace these unsafe commands (the CLI will not run them):');
    for (const d of result.dangerousCommands) {
      lines.push(`    - "${d.command}"  (${d.reason})`);
    }
  }
  if (result.pathIssues.length > 0) {
    lines.push('- These artifact paths must be relative and under `.ai4science/`:');
    for (const p of result.pathIssues) lines.push(`    - "${p}"`);
  }
  return lines.join('\n');
}

/**
 * Convenience: parse then validate in one call.
 * @param {string} text
 * @returns {{parsed: boolean, error?: string, data?: any, validation?: object}}
 */
export function ingest(text) {
  const parsed = parseHandoff(text);
  if (!parsed.ok) {
    return { parsed: false, error: parsed.error };
  }
  return { parsed: true, data: parsed.data, validation: validateHandoff(parsed.data) };
}
