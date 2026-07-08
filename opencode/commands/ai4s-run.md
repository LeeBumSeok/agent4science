---
description: Run the smoke test and approved experiments, recording every run
agent: ai4s-experiment-runner
subtask: true
---

Run the approved experiments and record what happened.

Preconditions: state must be `implemented` (smoke test first) or later. Call `ai4s_state`
with `action: "get"`; if earlier, tell the user to run `/ai4s-implement` first.

Procedure:

1. Read the `run_plan` in `.ai4science/implementation_plan.md`.
2. **Smoke test first.** Run the smoke/test commands. Before each command, screen it with
   `ai4s_safety_check`; refuse anything not marked safe. Record each with `ai4s_record_run`.
   Write `.ai4science/reports/smoke_test.md` summarizing the smoke result, then advance state
   (`ai4s_state action: "advance"` → `tested`).
3. **Experiments.** Run the experiment commands for each configured seed. Screen each command
   first. For each run, capture exit code and save stdout/stderr under the handoff's
   `log_dir`; mark status `success | failed | partial | invalid`; record it with
   `ai4s_record_run`. Never hide or delete failed runs.
4. After all seeds, advance state (→ `experiment_ran`).

Do not reinterpret the hypothesis. Do not silently fix scientific design issues — report them.
Report a run summary and the next step (`/ai4s-analyze`).
