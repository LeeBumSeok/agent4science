/**
 * state.js — the research pipeline state machine.
 *
 * States advance in a fixed order. Each state declares the artifacts that must exist for
 * the pipeline to be considered *in* that state; a forward transition is allowed only when
 * the target state's required artifacts are present. This module is pure and takes an
 * `exists(path)` predicate so it can be unit-tested without a filesystem. The plugin
 * adapter supplies a real `exists`.
 */

/**
 * `requires` = the artifacts that must exist for the pipeline to have reached this state.
 * These are the files the command that produces the state is expected to write.
 */
export const STATES = {
  initialized: { requires: [] },
  // A research source may be a compact handoff OR a full imported conversation.
  handoff_imported: {
    requires: ['.ai4science/provenance.json'],
    requiresAny: ['.ai4science/handoff.yaml', '.ai4science/pro_conversation.md'],
  },
  validated: { requires: ['.ai4science/validation_report.md'] },
  repo_mapped: { requires: ['.ai4science/repo_map.md'] },
  implementation_planned: { requires: ['.ai4science/implementation_plan.md'] },
  implemented: { requires: ['.ai4science/implementation_report.md'] },
  tested: { requires: ['.ai4science/reports/smoke_test.md'] },
  experiment_ran: { requires: ['.ai4science/run_registry.jsonl'] },
  analyzed: { requires: ['.ai4science/reports/analysis.md'] },
  pro_feedback_ready: { requires: ['.ai4science/reports/pro_feedback_prompt.md'] },
};

/** Pipeline order. */
export const ORDER = [
  'initialized',
  'handoff_imported',
  'validated',
  'repo_mapped',
  'implementation_planned',
  'implemented',
  'tested',
  'experiment_ran',
  'analyzed',
  'pro_feedback_ready',
];

function assertKnown(state) {
  if (!Object.prototype.hasOwnProperty.call(STATES, state)) {
    throw new Error(`unknown state: ${state}`);
  }
}

/**
 * The state that follows `state`, or null if `state` is terminal.
 */
export function nextState(state) {
  assertKnown(state);
  const i = ORDER.indexOf(state);
  return i === ORDER.length - 1 ? null : ORDER[i + 1];
}

/**
 * The artifacts that must exist for the pipeline to be in `state`.
 */
export function requiredArtifacts(state) {
  assertKnown(state);
  return [...STATES[state].requires];
}

/**
 * Decide whether the pipeline may advance from `state` into the next state. The guard
 * checks the *target* state's required artifacts.
 * @param {string} state
 * @param {(path: string) => boolean} exists
 * @returns {{ok: boolean, target: string|null, missing: string[], reason?: string}}
 */
export function canAdvance(state, exists) {
  assertKnown(state);
  const target = nextState(state);
  if (target === null) {
    return { ok: false, target: null, missing: [], reason: 'already at the terminal state' };
  }
  const missing = requiredArtifacts(target).filter((p) => !exists(p));
  const any = STATES[target].requiresAny;
  if (Array.isArray(any) && any.length > 0 && !any.some((p) => exists(p))) {
    missing.push(`one of: ${any.join(' | ')}`);
  }
  return { ok: missing.length === 0, target, missing };
}
