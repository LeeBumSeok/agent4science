---
description: Write the research report from the ledger
agent: ai4s-result-analyst
subtask: true
---

Write a research report from the research ledger. Do not introduce any claim not supported by
the ledger.

Preconditions: state must be `analyzed`. Call `ai4s_state` with `action: "get"`; if earlier,
tell the user to run `/ai4s-analyze` first.

Read `.ai4science/handoff.yaml`, `.ai4science/reports/analysis.md`, and the run registry.
Write the report to the handoff's `report_file` (default `.ai4science/reports/`), with:

1. Title
2. Research question
3. Hypothesis
4. Methods
5. Experiments (each result maps to a `run_id`)
6. Results (metrics table)
7. Limitations
8. Reproducibility (commands, seeds, versions)
9. Next steps

Rules: every result maps to a `run_id`; negative or inconclusive results must be reported;
use cautious scientific language; do not hide failed experiments. Report the file path and the
next step (`/ai4s-pro-review`).
