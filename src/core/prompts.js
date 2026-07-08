/**
 * prompts.js — generators for the ChatGPT Pro prompts the user copies into the web UI.
 *
 * These are pure string builders. The plugin writes their output to `.ai4science/pro_prompts/`
 * and prints it; the user pastes it into ChatGPT Pro. Nothing here talks to any API.
 */

function bulletList(items) {
  return (items || []).map((s) => `- ${s}`).join('\n');
}

function renderConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') return '';
  const lines = Object.entries(constraints)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  return lines.length ? `\nKnown resources / constraints:\n${lines.join('\n')}\n` : '';
}

/**
 * The opening research-discussion prompt. Frames ChatGPT Pro as a skeptical PI, and defers
 * the final handoff until the user explicitly asks for it.
 * @param {{goal: string, repoSummary?: string, constraints?: object}} opts
 * @returns {string}
 */
export function kickoffPrompt({ goal, repoSummary, constraints } = {}) {
  return `You are acting as a senior AI4Science research PI, a skeptical reviewer, an
experimental design expert, and a reproducibility auditor.

I am developing an AI4Science research idea that a CLI coding agent will implement later.
No API will be used — this conversation will be converted into a structured CLI handoff by
hand.

My rough idea / goal:
${goal || '(state your goal)'}
${repoSummary ? `\nRepository context:\n${repoSummary}\n` : ''}${renderConstraints(constraints)}
Operating rules for you:
- The CLI agent can read/write code, run tests, run local experiments, and analyze results.
- The CLI agent must not make scientific decisions that are not written in the handoff.
- Prefer small, falsifiable experiments over broad ambitious claims.
- Every proposed experiment must have a baseline, a metric, a success criterion, a failure
  mode, and an interpretation rule.
- Separate speculation from evidence. Mark assumptions explicitly.

Please proceed in phases and DO NOT produce the final handoff yet:
1. Ask me clarifying questions to sharpen the research question.
2. Propose 3-5 candidate hypotheses.
3. Critique each for novelty, feasibility, risk, and falsifiability.
4. Help me select one primary hypothesis.
5. Design the minimum viable experiment.
6. List concrete implementation tasks for a CLI coding agent.

Only when I say "produce handoff", output a single fenced YAML block labeled
AI4S-HANDOFF-V1 following the schema I will recognize. Until then, keep refining.`;
}

/**
 * The short instruction the user pastes once the discussion has converged, to get the
 * final block and nothing else.
 * @returns {string}
 */
export function handoffRequestPrompt() {
  return `produce handoff

Generate the final AI4S-HANDOFF-V1 block for a CLI AI4Science agent that will implement,
run, analyze, and report the experiment.

Requirements:
- Output ONLY one fenced YAML block labeled AI4S-HANDOFF-V1. No prose outside the block.
- It must be implementation-ready: the CLI agent should not need to infer scientific intent.
- Include: research question, selected hypothesis, rejected alternatives, assumptions,
  minimal experiment, baselines (at least one), metrics with a primary metric,
  success/failure criteria, seeds, implementation tasks (id/title/acceptance), proposed
  commands, artifact paths under .ai4science/, an analysis plan, a safety risk level, and a
  cli_must_not list.
- Use cautious scientific language. Mark anything uncertain as uncertain.`;
}

function section(title, body) {
  if (!body || (Array.isArray(body) && body.length === 0)) return '';
  const rendered = Array.isArray(body) ? bulletList(body) : body;
  return `\n${title}:\n${rendered}\n`;
}

/**
 * The next-iteration review prompt, built from CLI results, for pasting back into Pro.
 * Empty sections are omitted. Never includes secrets or large logs — the caller passes in
 * a trimmed metrics table and short failure summaries.
 * @param {{
 *   researchQuestion?: string, hypothesis?: string,
 *   commandsRun?: string[], changedFiles?: string[],
 *   metricsTable?: string, failures?: string[],
 *   supported?: string[], contradicted?: string[], uncertain?: string[],
 * }} r
 * @returns {string}
 */
export function reviewPrompt(r = {}) {
  const parts = [
    `You previously acted as the research PI for this project. Here are the CLI results of the
last experiment iteration. Review them skeptically and decide what to do next.`,
    section('Research question', r.researchQuestion),
    section('Hypothesis under test', r.hypothesis),
    section('Commands run', r.commandsRun),
    section('Changed files', r.changedFiles),
    r.metricsTable ? `\nMetrics:\n\`\`\`\n${r.metricsTable}\n\`\`\`\n` : '',
    section('Failed or inconclusive runs', r.failures),
    section('Supported claims (per success criteria)', r.supported),
    section('Contradicted claims', r.contradicted),
    section('Still uncertain', r.uncertain),
    `\nPlease:
- Assess novelty, validity, baseline adequacy, statistical strength, and overclaim risk.
- Identify the single most decisive next experiment.
- If a follow-up experiment is warranted, output the next AI4S-HANDOFF-V1 block (only the
  block). Otherwise, explain what would make the result publishable or why to stop.`,
  ];
  return parts.filter(Boolean).join('');
}
