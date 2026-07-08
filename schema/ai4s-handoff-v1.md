# AI4S-HANDOFF-V1 Schema

The `AI4S-HANDOFF-V1` block is the single execution contract between a ChatGPT Pro
research conversation (the "PI") and the OpenCode CLI (the "lab"). ChatGPT Pro produces
it at the end of a research discussion; the user pastes it into the CLI; the CLI validates
and executes against it — never against the free-form conversation.

The handoff is treated as **untrusted input**. It is validated structurally and every
command it proposes is screened against the safety denylist before anything runs.

## Design principles

- This file is both the specification you show ChatGPT Pro ("produce a block in this
  format") and the contract the CLI parser validates against.
- The CLI treats the block as **untrusted input**. Commands are proposals and are never
  auto-executed.
- If a required field is missing, the CLI refuses and emits a **patch request** — an
  English message the user pastes back into ChatGPT Pro to regenerate a corrected block.

## Top-level shape

```yaml
schema: AI4S-HANDOFF-V1        # REQUIRED — must equal this exact string

source:                        # optional provenance (never auto-fetched)
  shared_link: "https://chatgpt.com/share/..."   # URL only; recorded, not scraped
  conversation_title: "optional"
  created_at: "2026-07-09"
  notes: "Shared link is provenance only; this YAML is the execution spec."

project:                       # REQUIRED
  name: "short-project-name"                       # REQUIRED
  domain: "machine learning / physics / ..."       # REQUIRED
  user_goal: "the original user goal"
  research_question: "precise, testable question"  # REQUIRED

constraints:
  compute_budget: "e.g. CPU only, 1 GPU, 8 GPU-hours"
  time_budget: "e.g. 2 hours"
  allowed_data: ["public datasets"]
  disallowed_data: ["private or sensitive data"]
  allowed_actions: ["read repo", "write code", "run local experiments"]
  disallowed_actions: ["make external purchases", "submit paid cloud jobs"]

hypothesis:                    # REQUIRED
  id: H001                                         # REQUIRED
  statement: "a falsifiable hypothesis"            # REQUIRED
  mechanism: "why this might work"
  novelty_rationale: ["why this may be non-trivial"]
  assumptions:
    - assumption: "..."
      risk: "low"            # low | medium | high
  why_it_might_be_wrong: ["..."]

rejected_alternatives:         # optional
  - id: H002
    statement: "..."
    reason_rejected: "too broad / too expensive / weak novelty / no data"

experiment:                    # REQUIRED
  id: E001                                         # REQUIRED
  objective: "what this experiment tests"
  minimal_viable_experiment: "smallest useful test"
  dataset:
    name: "..."
    source: "..."
    fallback: "synthetic data / toy benchmark / subset"
  baselines:                                       # REQUIRED — at least one
    - name: "baseline_1"
      description: "..."
  method_under_test:
    name: "..."
    description: "..."
  ablations: ["remove component X"]
  metrics:                                         # REQUIRED
    primary:                                       # REQUIRED
      name: "..."                                  # REQUIRED
      direction: "higher_is_better"                # higher_is_better | lower_is_better
      reason: "..."
    secondary:
      - name: "..."
        reason: "..."
  success_criteria:                                # REQUIRED — at least one
    - "primary metric improves over baseline by X"
  failure_criteria:                                # REQUIRED — at least one
    - "baseline cannot be reproduced"
  interpretation_rules:
    positive: "what can be claimed if successful"
    negative: "what can be concluded if failed"
    inconclusive: "what makes the result inconclusive"
  seeds: [0, 1, 2]                                 # REQUIRED — at least one

implementation:                # REQUIRED
  language: "Python"                               # REQUIRED
  package_manager: "uv / pip / conda / poetry"
  expected_repo_changes:
    - path: "experiments/run_e001.py"
      purpose: "experiment runner"
  tasks:                                           # REQUIRED — at least one
    - id: T001                                     # REQUIRED
      title: "Inspect repo structure"             # REQUIRED
      acceptance: "identify existing entrypoints"  # REQUIRED

commands:                      # proposals only — NEVER auto-executed; each is screened
  setup: ["python -m venv .venv"]
  test: ["pytest -q"]
  run: ["python experiments/run_e001.py --method proposed --seed 0"]
  analyze: ["python experiments/analyze_e001.py"]

artifacts:                     # all paths MUST be relative and under .ai4science/
  results_dir: ".ai4science/results/e001"
  metrics_file: ".ai4science/results/e001/metrics.csv"
  log_dir: ".ai4science/results/e001/logs"
  report_file: ".ai4science/reports/e001_report.md"

analysis_plan:                 # REQUIRED
  required_checks:                                 # REQUIRED — at least one
    - "verify all seeds completed"
    - "compare primary metric against baselines"
  figures: ["bar chart of primary metric by method"]

safety:                        # REQUIRED
  risk_level: "low"            # REQUIRED — low | medium | high
  constraints: ["do not use private data"]
  human_review_required: false

reproducibility:
  required:
    - "record package versions"
    - "record exact commands"
    - "record random seeds"

cli_must_not:                  # REQUIRED — at least one
  - "silently change the hypothesis"
  - "remove failed runs"
  - "claim success without metrics"

return_to_pro:                 # what to send back for the next research iteration
  summary_prompt_requirements:
    - "final hypothesis"
    - "commands executed"
    - "metrics table"
    - "failure logs if any"
    - "what was inconclusive"
```

## Required fields

- `schema`
- `project.name`, `project.domain`, `project.research_question`
- `hypothesis.id`, `hypothesis.statement`
- `experiment.id`, `experiment.baselines` (>= 1), `experiment.metrics.primary.name`,
  `experiment.success_criteria` (>= 1), `experiment.failure_criteria` (>= 1),
  `experiment.seeds` (>= 1)
- `implementation.language`, `implementation.tasks` (each item needs `id`/`title`/`acceptance`)
- `analysis_plan.required_checks` (>= 1)
- `safety.risk_level`
- `cli_must_not` (>= 1)

## Validation rules

The validator (`src/core/handoff.js`) enforces:

1. `schema` MUST equal `"AI4S-HANDOFF-V1"`. Otherwise `blocked`.
2. All required fields above must be present and non-empty. Missing ones →
   `needs_revision` with a per-field list.
3. `experiment.baselines` must have **at least one** entry (no baseline-free experiments).
4. `experiment.metrics.primary.name` must be present.
5. `experiment.success_criteria`, `experiment.failure_criteria`, and `experiment.seeds`
   must each be non-empty.
6. `implementation.tasks` must be non-empty and each task needs `id`, `title`, `acceptance`.
7. Every string in `commands.*` is screened by the safety denylist. Any dangerous command →
   `blocked` with the offending commands listed.
8. Every path in `artifacts.*` must be relative (no leading `/`, no `~`, no `..` segments)
   and must live under `.ai4science/`. Otherwise `blocked`.
9. `safety.risk_level: high` → status downgraded to `needs_human_review`; the CLI will not
   advance past validation without explicit user approval.

## Validation outcomes

| status | meaning | next step |
|---|---|---|
| `valid` | ready to execute | `/ai4s-plan` |
| `needs_revision` | fixable structural problems | fix via ChatGPT Pro, re-ingest |
| `needs_human_review` | high-risk domain flagged | user must explicitly approve |
| `blocked` | wrong schema / dangerous command / path escape | do not proceed |

## Full example

```yaml
schema: AI4S-HANDOFF-V1

source:
  shared_link: "https://chatgpt.com/share/..."      # provenance only, never scraped
  conversation_title: "Small-data generalization for molecular property prediction"
  created_at: "2026-07-09"
  notes: "Shared link is provenance only; this YAML is the execution spec."

project:
  name: "moleculenet-smalldata-reg"
  domain: "machine learning"
  user_goal: "Improve generalization of molecular property prediction on small datasets"
  research_question: "Does a physics-based regularization term lower validation RMSE for a GNN in the low-data regime?"

constraints:
  compute_budget: "CPU only, <= 30 min per run"
  time_budget: "2 hours"
  allowed_data:
    - "public datasets (e.g. small MoleculeNet subset)"
  disallowed_data:
    - "private or sensitive data"
  allowed_actions:
    - "read repo"
    - "write code under repo"
    - "run local experiments"
  disallowed_actions:
    - "external purchases"
    - "submit jobs to paid cloud services"
    - "hazardous or wet-lab protocols"

hypothesis:
  id: H001
  statement: "Adding a physics-based regularizer lowers validation RMSE versus baseline in the low-data regime."
  mechanism: "The regularizer constrains the hypothesis space to physically plausible functions, reducing overfitting."
  novelty_rationale:
    - "This regularizer form is rarely applied to this low-data setting."
  assumptions:
    - assumption: "A small public subset is available"
      risk: "low"
    - assumption: "Training fits in 30 min on CPU"
      risk: "medium"
  why_it_might_be_wrong:
    - "Too strong a regularizer causes underfitting"
    - "In low data the signal may be lost in variance"

rejected_alternatives:
  - id: H002
    statement: "Fine-tune a large pretrained model"
    reason_rejected: "Exceeds compute budget, hard to reproduce"

experiment:
  id: E001
  objective: "Test H001 at minimal cost"
  minimal_viable_experiment: "Same GNN with regularization on/off, 3 seeds, small subset"
  dataset:
    name: "small public regression subset"
    source: "public"
    fallback: "synthetic toy regression"
  baselines:
    - name: "gnn_no_reg"
      description: "Same GNN without regularization"
  method_under_test:
    name: "gnn_phys_reg"
    description: "Add a physics-based regularization term to the loss"
  ablations:
    - "Halve the regularization coefficient"
  metrics:
    primary:
      name: "val_rmse"
      direction: "lower_is_better"
      reason: "Direct measure of regression generalization"
    secondary:
      - name: "train_time_s"
        reason: "Confirm budget compliance"
  success_criteria:
    - "val_rmse drops >= 5% vs baseline, averaged over 3 seeds"
  failure_criteria:
    - "Baseline cannot be reproduced"
    - "Method does not beat baseline on any of the 3 seeds"
  interpretation_rules:
    positive: "Preliminary evidence that physics regularization helps in low data"
    negative: "It does not help in this setting (a valid negative result)"
    inconclusive: "Seed variance exceeds the effect size"
  seeds:
    - 0
    - 1
    - 2

implementation:
  language: "Python"
  package_manager: "pip"
  expected_repo_changes:
    - path: "experiments/run_e001.py"
      purpose: "Experiment runner (shared by baseline/proposed)"
    - path: "src/reg.py"
      purpose: "Physics-based regularization term"
    - path: "tests/test_e001_smoke.py"
      purpose: "Smoke test"
  tasks:
    - id: T001
      title: "Inspect repository structure"
      acceptance: "Identify training/evaluation entrypoints and where metrics are saved"
    - id: T002
      title: "Implement baseline runner"
      acceptance: "Baseline produces a metrics JSON"
    - id: T003
      title: "Implement the regularization term"
      acceptance: "Proposed method produces results in the same metric schema"
    - id: T004
      title: "Add smoke test"
      acceptance: "pytest passes locally"
    - id: T005
      title: "Run seeds"
      acceptance: "Metrics saved for all configured seeds"

commands:
  setup:
    - "python -m venv .venv"
    - "pip install -r requirements.txt"
  test:
    - "pytest -q"
  run:
    - "python experiments/run_e001.py --method baseline --seed 0"
    - "python experiments/run_e001.py --method proposed --seed 0"
  analyze:
    - "python experiments/analyze_e001.py"

artifacts:
  results_dir: ".ai4science/results/e001"
  metrics_file: ".ai4science/results/e001/metrics.csv"
  log_dir: ".ai4science/results/e001/logs"
  report_file: ".ai4science/reports/e001_report.md"

analysis_plan:
  required_checks:
    - "Verify all seeds completed"
    - "Compare primary metric against baselines"
    - "Report mean and standard deviation"
    - "Preserve failed runs"
  figures:
    - "Bar chart of primary metric by method"
    - "Table of seed-level results"

safety:
  risk_level: "low"      # low | medium | high
  constraints:
    - "Do not use private data"
    - "Do not generate hazardous or wet-lab protocols"
  human_review_required: false

reproducibility:
  required:
    - "Record package versions"
    - "Record exact commands"
    - "Record random seeds"
    - "Save logs"
    - "Save git diff"

cli_must_not:
  - "Silently change the hypothesis"
  - "Remove failed runs"
  - "Claim success without metrics"
  - "Run commands outside the repository without approval"
  - "Upload data externally"

return_to_pro:
  summary_prompt_requirements:
    - "final hypothesis"
    - "commands executed"
    - "changed files"
    - "metrics table"
    - "failure logs if any"
    - "what was inconclusive"
    - "questions for the next research iteration"
```
