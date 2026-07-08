<!-- Map the repo and produce a minimal implementation plan -->

Turn the validated handoff into a minimal implementation plan. Confirm state is
`validated` with `agent4science state get`.

1. Read the repo (read-only) and write `.ai4science/repo_map.md`; then `agent4science state advance`.
2. Using the handoff + repo map, write `.ai4science/implementation_plan.md`
   (implementation_plan, file_change_plan, test_plan, run_plan, rollback_plan). Every task
   needs an acceptance criterion; keep it minimal; outputs go under `.ai4science/`. Then
   `agent4science state advance`.

Preserve the hypothesis, metrics, and success criteria exactly. Next step: `/ai4s-implement`.
