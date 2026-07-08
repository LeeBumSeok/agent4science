---
description: Analyze results against the pre-registered analysis plan
agent: ai4s-result-analyst
subtask: true
---

Analyze the experiment results according to the handoff's pre-registered analysis plan.

Preconditions: state must be `experiment_ran`. Call `ai4s_state` with `action: "get"`; if
earlier, tell the user to run `/ai4s-run` first.

Rules:

1. Read the `analysis_plan` in `.ai4science/handoff.yaml` and the run registry
   (`.ai4science/run_registry.jsonl`) plus any metrics files it references.
2. Use only recorded metrics and logs. Do not invent missing runs. Treat failed runs as
   evidence about the system.
3. Compute summary statistics (mean, standard deviation) and compare the primary metric
   against the baselines. Separate pre-planned analysis from exploratory observations.
4. Decide `hypothesis_status`: `supported` | `contradicted` | `inconclusive`. Only claim
   success if the handoff's `success_criteria` are met.
5. Write `.ai4science/reports/analysis.md` with: `data_integrity_checks`, `metrics_summary`
   (include a small metrics table), `baseline_comparison`, `hypothesis_status`, `limitations`,
   `next_experiment_candidate`. Also save the metrics table as
   `.ai4science/results/metrics.csv` if not already present.
6. Advance state (`ai4s_state action: "advance"` → `analyzed`).

Report the verdict and the next step (`/ai4s-report`, then `/ai4s-pro-review`).
