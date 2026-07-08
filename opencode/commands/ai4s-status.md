---
description: Show the current pipeline state, next step, and missing artifacts
---

Show where this AI4Science project stands.

Call the `ai4s_state` tool with `action: "get"` and report, in plain language:

- the current state,
- the next state,
- whether the pipeline can advance now, and if not, which artifacts are missing,
- the command that produces the next artifact:
  - initialized → `/ai4s-pro-prompt`, then either `/ai4s-import-conversation <share-url>`
    (full conversation) or `/ai4s-ingest <block>` (compact handoff)
  - handoff_imported → `/ai4s-validate`
  - validated → `/ai4s-plan`
  - repo_mapped / implementation_planned → `/ai4s-plan` (finish) then `/ai4s-implement`
  - implemented → `/ai4s-run`
  - tested / experiment_ran → `/ai4s-run` (finish) then `/ai4s-analyze`
  - analyzed → `/ai4s-report` then `/ai4s-pro-review`
  - pro_feedback_ready → paste Pro's next block into `/ai4s-ingest`

If `.ai4science/` does not exist yet, tell the user to run `/ai4s-init <goal>` first.
