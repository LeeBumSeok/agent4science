<!-- Validate the source; derive a structured handoff from a conversation -->

Validate the research source before implementation. Confirm state first:
`agent4science state get` (must be `handoff_imported`).

The source is either `.ai4science/handoff.yaml` (a compact handoff) or
`.ai4science/pro_conversation.md` (a full conversation). If only the conversation exists,
DERIVE a structured handoff from it (research question, hypothesis, one experiment with a
baseline + primary metric + success/failure criteria + seeds, implementation tasks, analysis
plan, safety risk level, artifact paths under `.ai4science/`, cli_must_not) and write it to
`.ai4science/handoff.yaml`. Where the conversation is silent, record an open question instead
of inventing details.

Write `.ai4science/validation_report.md` (source, validation_status, normalized_tasks,
open_questions, safety_flags). If it passes, run `agent4science state advance`. Then report
the next step: `/ai4s-plan`.
