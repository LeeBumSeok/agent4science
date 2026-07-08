# oh-my-ai4science

**English** | [한국어](README.ko.md)

A plugin/agent — for **OpenCode**, **Claude Code**, and **Codex** — that turns a web research
conversation into **reproducible, CLI-driven experiments**.

## Why a web research model?

The best place to *get and pressure-test research ideas* today is a **web chat with the
smartest model you have access to** — for example **GPT Pro** or **Claude / Fable**. That's
where the strongest reasoning lives: judging whether an idea is novel, poking holes in an
experimental design, weighing alternatives, interpreting messy results. Those top web modes are
also, for most people, not something you drive from a terminal or cheaply script into a CLI
agent loop. Meanwhile the coding models you *can* run in the CLI are excellent at
implementation but weaker at that deep research judgment.

oh-my-ai4science bridges the gap: **do the hard thinking in whatever web model is smartest for
you, then hand the whole conversation to your coding agent**, which implements, runs, and
analyzes the experiments — and produces a prompt to take the results back to the web for the
next iteration. This isn't a mandate to use any one product; it's a *format*: web reasoning for
judgment, your terminal for reproducible execution.

## How you use it

Use a web model as the research PI — brainstorm ideas, sharpen hypotheses, design experiments.
Then bring the research into your coding agent either by **importing the whole shared
conversation** (`/ai4s-import-conversation <share-url>` — works with ChatGPT *and* Claude share
links) or by pasting a compact `AI4S-HANDOFF-V1` block (`/ai4s-ingest`). From there the pipeline
drives the rest: validate → plan → implement → run → analyze → report → and generate the
next-iteration prompt for the web.

No LLM API is used. The only network call is a single, user-initiated fetch of a public share
page you explicitly provide; the link is stored as a provenance URL. See the
[sharing note](#a-note-on-sharing) below.

On OpenCode the `ai4science` primary agent is what you see and switch to; it delegates to
specialist subagents. On Claude Code and Codex the same pipeline runs through the
`agent4science` CLI.

## Why this shape

- **Web research model** (GPT Pro, Claude/Fable, …) = deep research judgment (novelty, study
  design, interpretation).
- **Your coding agent** (OpenCode / Claude Code / Codex) = implementation, experiments,
  analysis, reproducibility.
- **The `AI4S-HANDOFF-V1` block** = the single execution contract between them. The CLI
  executes the *spec*, not the free-form conversation.
- **The `.ai4science/` ledger** = the single source of truth: state, handoff, provenance,
  run registry, reports.

## Install

Pick your coding agent with `--target` (default `opencode`):

```bash
# via the npm bin (like oh-my-openagent's installer)
npm install -g agent4science          # also needed for Claude Code / Codex (they use the CLI)

agent4science install --global                      # OpenCode, all projects
agent4science install --global --target claude      # Claude Code (~/.claude)
agent4science install --global --target codex       # Codex (~/.codex/prompts)
agent4science install --global --target all         # all three

# or from a clone of this repo, the same via install.sh
./install.sh --global --target all
./install.sh /path/to/project --target opencode     # project-local .opencode/
```

That's the whole "registration" — each agent **auto-loads** what's placed in its config
directory, so there's nothing to hand-edit. The installer:

- **OpenCode**: copies the JS plugin (core library into a sibling `.opencode/ai4s-core/`), the
  `/ai4s-*` commands, and the agents (`ai4science` primary + `@ai4s-*` subagents), and
  **auto-provisions the `yaml` dependency**. Detects singular/plural dir names (`--singular`
  forces `plugin/ command/ agent/`).
- **Claude Code**: copies the `ai4science` + `@ai4s-*` subagents to `.claude/agents/` and the
  `/ai4s-*` slash commands to `.claude/commands/`. Commands drive the `agent4science` CLI.
- **Codex**: copies the `/ai4s-*` custom prompts to `~/.codex/prompts/`, which also drive the CLI.

After installing, restart your coding agent. On OpenCode the `ai4science` agent shows in the TUI
switcher (Tab); on all three, the `/ai4s-*` commands are ready.

## Supported coding agents

| Agent | How the tools run | Assets installed |
|---|---|---|
| [OpenCode](https://opencode.ai) | native JS plugin (custom tools + `tool.execute.before` safety hook) | plugin, `ai4science` primary agent, `@ai4s-*` subagents, `/ai4s-*` commands |
| [Claude Code](https://claude.com/claude-code) | `agent4science` CLI via Bash | `ai4science` + `@ai4s-*` subagents, `/ai4s-*` commands |
| [Codex CLI](https://developers.openai.com/codex/cli) | `agent4science` CLI via shell | `/ai4s-*` custom prompts |

The pipeline logic is identical everywhere — it lives in the core the OpenCode plugin and the
`agent4science` CLI both call.

## The workflow

```
/ai4s-init <goal>          Initialize the .ai4science/ ledger.
/ai4s-pro-prompt           Generate the research-discussion prompt → paste into your web model.
   (discuss in the web model: clarify question, hypotheses, minimal experiment)

   Then bring the research in via EITHER path:
   A) Full conversation (recommended):
      /ai4s-import-conversation <share-url>   Fetch + decode a ChatGPT or Claude share.
   B) Compact handoff:
      /ai4s-handoff-request                   Get the "produce handoff" instruction → paste in.
      /ai4s-ingest <block>                    Validate + save the AI4S-HANDOFF-V1 block.

/ai4s-validate             Deep validation. For a compact handoff, validates it; for a full
                           conversation, derives a structured handoff.yaml from the transcript
                           (or reports honestly if the conversation has no concrete experiment).
/ai4s-plan                 Repo map + implementation plan (2 subagents)
/ai4s-implement            Implement the plan + smoke test
/ai4s-run                  Smoke test, then seeded experiments; every run recorded
/ai4s-analyze              Analyze vs. pre-registered plan → analysis.md
/ai4s-report               Write the research report
/ai4s-pro-review           Build the next-iteration prompt → paste into your web model, and loop
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

- **Full conversation (`/ai4s-import-conversation <share-url>`)** — fetches a public share
  once (at your explicit request), decodes the transcript, and saves the entire conversation
  to `.ai4science/pro_conversation.md`. The whole discussion becomes the research context;
  `/ai4s-validate` then derives a structured `handoff.yaml` from it. The share link is stored
  only as a provenance URL. Supported today:
  - **ChatGPT** (`chatgpt.com/share/...`) — the share page server-renders the transcript.
  - **Claude** (`claude.ai/share/...`) — the snapshot is read from the public
    `api.anthropic.com/api/chat_snapshots/<id>` endpoint.
- **Compact handoff (`/ai4s-ingest <block>`)** — you paste the `AI4S-HANDOFF-V1` block the web
  model produced. Smaller, but you copy it by hand. Works with any model.

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
| `@ai4s-pro-feedback-composer` | subagent | Build the next-iteration web-model prompt |

## Development

The core logic is pure JavaScript under `src/core/`, tested with Node's built-in runner (no
OpenCode or bun required):

```bash
npm test                    # node --test — 73 tests across core + adapter
npm run lint:frontmatter    # validate every command/agent markdown file
node scripts/build-cross-agent.js   # regenerate claude/ and codex/ assets from source
```

Layout:

- `src/core/` — `safety`, `state`, `handoff`, `conversation`, `ledger`, `prompts`, `fetch`,
  `actions` (pure/testable); `install.sh` copies these into `.opencode/ai4s-core/`
- `bin/agent4science.js` — the CLI: installer + pipeline subcommands (used by Claude Code/Codex)
- `opencode/` — the OpenCode plugin (`plugins/ai4science.js`), commands, agents
- `claude/`, `codex/` — generated Claude Code and Codex assets (from `scripts/build-cross-agent.js`)
- `schema/`, `fixtures/`, `test/`, `install.sh`

## A note on sharing

`/ai4s-import-conversation` performs a **single, user-initiated fetch** of a **public** share
you explicitly created and handed to the tool — not bulk scraping, not bypassing
authentication, not automating any web UI. It reads the conversation the public share already
serves (ChatGPT or Claude). If you prefer to avoid any fetch, use `/ai4s-ingest` and paste the
handoff by hand instead. Either way, the share link is stored only as a provenance URL.

Do not put sensitive research data in a shared link: anyone with the link can view it, and it
has no expiry or granular permissions.
