---
description: Run the smoke test and seeded experiments, recording every run
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---
Run approved experiments (state must be `implemented` or later).

Read the run_plan. Screen every command with `agent4science safety-check` first. Run the
smoke test, write `.ai4science/reports/smoke_test.md`, and `agent4science state advance`.
Then run each seed; for each, record it:
`agent4science record-run --json '{"run_id":"E001_seed0","command":"...","exit_code":0,"status":"success"}'`.
Never hide or delete failed runs. After all seeds, `agent4science state advance`. Next: `/ai4s-analyze`.
