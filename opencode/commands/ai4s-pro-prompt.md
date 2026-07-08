---
description: Generate a ChatGPT Pro research-discussion prompt to copy into the web UI
---

Generate the opening ChatGPT Pro prompt for this project.

Call the `ai4s_pro_prompt` tool with `kind: "kickoff"`. Then present the generated prompt to
the user verbatim inside a fenced block so they can copy it, and explain the workflow:

1. Paste the prompt into ChatGPT Pro (web).
2. Have the research discussion — Pro will ask clarifying questions, propose hypotheses, and
   design a minimal experiment. Do NOT ask Pro for the final block yet.
3. When the discussion has converged, run `/ai4s-handoff-request` to get the short "produce
   handoff" instruction, paste that into Pro, and copy the AI4S-HANDOFF-V1 block it returns.
4. Bring the block back with `/ai4s-ingest`.

Remind the user: the shared link is recorded as provenance only — the CLI never scrapes it.
