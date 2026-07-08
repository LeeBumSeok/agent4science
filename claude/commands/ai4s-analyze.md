---
description: Analyze results against the pre-registered plan
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---
Analyze results per the handoff analysis_plan (state must be `experiment_ran`).

Use only recorded metrics and logs; treat failed runs as evidence; do not claim success unless
the success_criteria are met. Write `.ai4science/reports/analysis.md` (data_integrity_checks,
metrics_summary, baseline_comparison, hypothesis_status, limitations, next_experiment_candidate)
and save `.ai4science/results/metrics.csv`. Then `agent4science state advance`. Next:
`/ai4s-pro-review` (build the next-iteration prompt for the web model).
