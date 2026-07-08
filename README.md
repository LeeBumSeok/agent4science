# oh-my-ai4science

**English** | [한국어](README.ko.md)

An [OpenCode](https://opencode.ai) plugin that turns **ChatGPT Pro (web)** research
conversations into **reproducible, CLI-driven experiments**.

You use ChatGPT Pro as the research PI — brainstorm ideas, sharpen hypotheses, design
experiments. Then you bring the research into OpenCode either by **importing the whole shared
conversation** (`/ai4s-import-conversation <share-url>`) or by pasting a compact
`AI4S-HANDOFF-V1` block (`/ai4s-ingest`). From there the plugin drives the rest: validate →
plan → implement → run → analyze → report → and generate the next-iteration prompt for Pro.

No API is used. The only network call is a single, user-initiated fetch of a public share
page you explicitly provide; the link is stored as a provenance URL. See the
[sharing note](#a-note-on-chatgpt-sharing) below.

The `ai4science` primary agent is what you see and switch to in the OpenCode TUI; it delegates
to specialist subagents.

## Why this shape

- **ChatGPT Pro web** = deep research judgment (novelty, study design, interpretation).
- **OpenCode CLI** = implementation, experiments, analysis, reproducibility.
- **The `AI4S-HANDOFF-V1` block** = the single execution contract between them. The CLI
  executes the *spec*, not the free-form conversation.
- **The `.ai4science/` ledger** = the single source of truth: state, handoff, provenance,
  run registry, reports.

## Install

Requires [OpenCode](https://opencode.ai). One command, no manual steps:

```bash
# from this repo
./install.sh --global                          # ~/.config/opencode — available in ALL projects
./install.sh /path/to/your/research/project    # just that project's .opencode/

# or via the npm bin (same effect), like oh-my-openagent's installer
npx agent4science install --global
```

That's the whole "registration" — OpenCode **auto-loads** everything placed in its config
directory, so there is no `opencode.json` to edit. The installer:

- copies the plugin (core library into a sibling `.opencode/ai4s-core/`), the `/ai4s-*`
  commands, and the agents (`ai4science` primary + `@ai4s-*` subagents);
- **auto-provisions the `yaml` dependency** (vendors it, or runs `bun`/`npm install`), so the
  plugin's handoff parsing works with zero setup;
- detects existing singular/plural directory names and defaults to plural (`--singular` forces
  `plugin/ command/ agent/`).

After installing, restart OpenCode (if it was running). The `ai4science` agent appears in the
TUI agent switcher (Tab) and the `/ai4s-*` commands are ready.

## The workflow

```
/ai4s-init <goal>          Initialize the .ai4science/ ledger.
/ai4s-pro-prompt           Generate the ChatGPT Pro research-discussion prompt → paste into Pro.
   (discuss in ChatGPT Pro: clarify question, hypotheses, minimal experiment)

   Then bring the research in via EITHER path:
   A) Full conversation (recommended):
      /ai4s-import-conversation <share-url>   Fetch + decode the whole shared conversation.
   B) Compact handoff:
      /ai4s-handoff-request                   Get the "produce handoff" instruction → paste into Pro.
      /ai4s-ingest <block>                    Validate + save the AI4S-HANDOFF-V1 block.

/ai4s-validate             Deep validation. For a compact handoff, validates it; for a full
                           conversation, derives a structured handoff.yaml from the transcript
                           (or reports honestly if the conversation has no concrete experiment).
/ai4s-plan                 Repo map + implementation plan (2 subagents)
/ai4s-implement            Implement the plan + smoke test
/ai4s-run                  Smoke test, then seeded experiments; every run recorded
/ai4s-analyze              Analyze vs. pre-registered plan → analysis.md
/ai4s-report               Write the research report
/ai4s-pro-review           Build the next-iteration prompt → paste into Pro, and loop
/ai4s-status               Show current state, next step, missing artifacts
```

`/ai4s-status` tells you where you are at any point.

## State machine

The pipeline advances one step at a time, and each forward transition requires the previous
step's artifact to exist on disk:

```
initialized → handoff_imported → validated → repo_mapped
  → implementation_planned → implemented → tested
  → experiment_ran → analyzed → pro_feedback_ready
```

A command refuses to run out of order and tells you which command to run first.

## Two ways to bring the research in

- **Full conversation (`/ai4s-import-conversation <share-url>`)** — fetches the public
  ChatGPT share page once (at your explicit request), decodes the embedded transcript, and
  saves the entire conversation to `.ai4science/pro_conversation.md`. The whole discussion
  becomes the research context; `/ai4s-validate` then derives a structured `handoff.yaml`
  from it. The share link is stored only as a provenance URL. (Fetch uses a browser
  user-agent and falls back gracefully; the `backend-api` endpoint is bot-blocked, but the
  public share HTML is parseable.)
- **Compact handoff (`/ai4s-ingest <block>`)** — you paste the `AI4S-HANDOFF-V1` block Pro
  produced. Smaller, but you copy it by hand.

Both converge on the same downstream pipeline (validate → plan → implement → run → analyze).

## The handoff contract

`AI4S-HANDOFF-V1` is a single YAML block. Its full specification — the same one you show
ChatGPT Pro — lives in [`schema/ai4s-handoff-v1.md`](schema/ai4s-handoff-v1.md), with a
complete worked example. Required top-level pieces: `project`, `hypothesis`, `experiment`
(with at least one baseline, a primary metric, success/failure criteria, seeds),
`implementation.tasks`, `analysis_plan`, `safety.risk_level`, and `cli_must_not`.

## Safety

The handoff is **untrusted input**. Three layers guard execution:

1. **Schema validation** — missing required fields → `needs_revision` with a patch request to
   paste back into ChatGPT Pro. Wrong schema id, dangerous commands, or artifact paths that
   escape `.ai4science/` → `blocked` (nothing is saved).
2. **Command denylist** — every command the handoff proposes, and every `bash` call inside an
   ai4science project, is screened. Recursive force-deletes, `sudo`, piping remote content to
   a shell, force pushes, cloud/infra CLIs, credential access, and more are refused. The
   `tool.execute.before` hook enforces this at runtime; agents also self-check with the
   `ai4s_safety_check` tool.
3. **State machine + append-only registry** — steps run in order; failed runs are never
   removed; the hypothesis, metrics, and success criteria are never silently changed.

High-risk domains (`safety.risk_level: high`) require your explicit approval before the
pipeline advances past validation.

## Agents

`ai4science` is a **primary** agent — it shows in the OpenCode TUI agent switcher (Tab) and
drives the whole pipeline, delegating to the specialist **subagents** below. Subagents don't
appear in the primary switcher by design; invoke them with `@ai4s-...` or let the `/ai4s-*`
commands delegate to them automatically.

| Agent | Mode | Role |
|---|---|---|
| `ai4science` | primary | PI orchestrator — visible in the TUI, drives the pipeline |
| `@ai4s-intake-validator` | subagent | Validate the handoff as untrusted input |
| `@ai4s-repo-cartographer` | subagent | Read-only survey of where the experiment should live |
| `@ai4s-experiment-planner` | subagent | Turn handoff + repo map into a minimal plan |
| `@ai4s-implementation-engineer` | subagent | Implement the plan faithfully, with smoke tests |
| `@ai4s-experiment-runner` | subagent | Run only approved commands; record every run |
| `@ai4s-result-analyst` | subagent | Analyze vs. the pre-registered plan; write the report |
| `@ai4s-pro-feedback-composer` | subagent | Build the next-iteration ChatGPT Pro prompt |

## Development

The core logic is pure JavaScript under `src/core/`, tested with Node's built-in runner (no
OpenCode or bun required):

```bash
npm test                    # node --test — 68 tests across core + adapter
npm run lint:frontmatter    # validate every command/agent markdown file
```

Layout:

- `src/core/` — `safety`, `state`, `handoff`, `conversation`, `ledger`, `prompts`, `actions`
  (pure/testable); `install.sh` copies these into `.opencode/ai4s-core/`
- `opencode/plugins/ai4science.js` — thin adapter: custom tools + safety hook (imports
  `../ai4s-core/actions.js`)
- `opencode/commands/`, `opencode/agents/` — the `/ai4s-*` and `@ai4s-*` markdown
- `schema/`, `fixtures/`, `test/`, `install.sh`

## A note on ChatGPT sharing

`/ai4s-import-conversation` performs a **single, user-initiated fetch** of a **public** share
page that you explicitly created and handed to the tool — not bulk scraping, not bypassing
authentication, not automating the ChatGPT UI. It reads the conversation the public share page
already serves. If you prefer to avoid any fetch, use `/ai4s-ingest` and paste the handoff by
hand instead. Either way, the share link is stored only as a provenance URL.

Do not put sensitive research data in a shared link: anyone with the link can view it, and it
has no expiry or granular permissions.
```
