---
description: Build the next-iteration ChatGPT Pro review prompt from the results
agent: ai4s-pro-feedback-composer
subtask: true
---

Compose the prompt the user will paste back into ChatGPT Pro to start the next research
iteration.

Preconditions: state should be `analyzed` (or later). Call `ai4s_state` with `action: "get"`.

1. Call the `ai4s_pro_prompt` tool with `kind: "review"` to seed the prompt from the saved
   handoff and run registry.
2. Enrich it from `.ai4science/reports/analysis.md`: what was supported, contradicted, and
   still uncertain; a small metrics table; short failure summaries.
3. Exclude secrets, credentials, private paths, and large logs.
4. Save the final prompt to `.ai4science/reports/pro_feedback_prompt.md`, and also present it
   verbatim in a fenced block for the user to copy. Ask Pro to produce the next
   AI4S-HANDOFF-V1 block if a follow-up experiment is recommended.
5. Advance state (`ai4s_state action: "advance"` → `pro_feedback_ready`).

Explain: after Pro returns the next block, the loop restarts at `/ai4s-ingest`.
