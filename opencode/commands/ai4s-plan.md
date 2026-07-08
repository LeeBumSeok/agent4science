---
description: Map the repository, then produce a concrete implementation plan
---

Turn the validated handoff into a concrete, minimal implementation plan.

Preconditions: state must be `validated`. Call `ai4s_state` with `action: "get"`; if earlier,
tell the user to run `/ai4s-validate` first.

Two phases:

1. **Repo mapping** — delegate to the `@ai4s-repo-cartographer` subagent. It reads the repo
   (read-only) and writes `.ai4science/repo_map.md`: entrypoints, config systems, data
   loading, metrics, test structure, likely extension points, missing dependencies. Then
   advance state with `ai4s_state action: "advance"` (→ `repo_mapped`).

2. **Planning** — delegate to the `@ai4s-experiment-planner` subagent. Using the handoff and
   the repo map, it writes `.ai4science/implementation_plan.md`: `implementation_plan`,
   `file_change_plan`, `test_plan`, `run_plan`, `rollback_plan`. Every task must have an
   acceptance criterion; keep the implementation as small as possible; write experiment
   outputs only under `.ai4science/`. Then advance state again (→ `implementation_planned`).

Preserve the scientific hypothesis, metrics, and success criteria exactly as written in the
handoff. If they need to change, stop and tell the user to revise via ChatGPT Pro. Report the
plan summary and the next step (`/ai4s-implement`).
