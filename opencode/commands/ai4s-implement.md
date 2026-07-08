---
description: Implement the approved experiment plan (code + smoke test)
agent: ai4s-implementation-engineer
subtask: true
---

Implement the approved experiment plan.

Preconditions: state must be `implementation_planned`. Call `ai4s_state` with `action: "get"`;
if earlier, tell the user to run `/ai4s-plan` first.

Rules:

1. Read `.ai4science/implementation_plan.md` and `.ai4science/handoff.yaml`.
2. Only modify files listed in the plan's `file_change_plan`. If additional files must
   change, explain why before doing so.
3. Reuse existing code and config systems; keep changes minimal.
4. Add a smoke test for every new script. Ensure experiment outputs are written under
   `.ai4science/results/`.
5. Do NOT change the hypothesis, metrics, or success criteria.
6. Before running any shell command, screen it with the `ai4s_safety_check` tool and skip
   anything not marked safe.
7. Write a short `.ai4science/implementation_report.md` (changed files, test commands, run
   commands, known limitations). Then advance state with `ai4s_state action: "advance"`
   (→ `implemented`).

Report changed files and the next step (`/ai4s-run`).
