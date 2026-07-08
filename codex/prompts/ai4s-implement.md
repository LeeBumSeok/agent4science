<!-- Implement the approved plan with smoke tests -->

Implement the approved plan (state must be `implementation_planned`).

Read `.ai4science/implementation_plan.md` and `.ai4science/handoff.yaml`. Only modify files
in the file_change_plan. Add a smoke test for every new script; write outputs under
`.ai4science/results/`. Before running any shell command, screen it with
`agent4science safety-check "<cmd>"` and skip anything not marked safe. Do not change the
hypothesis, metrics, or success criteria.

Write `.ai4science/implementation_report.md`, then `agent4science state advance`. Next: `/ai4s-run`.
