---
description: Get the short "produce handoff" instruction to paste into ChatGPT Pro
---

Call the `ai4s_pro_prompt` tool with `kind: "handoff-request"`. Present the returned text
verbatim in a fenced block for the user to copy into ChatGPT Pro.

Explain: this asks Pro to output ONLY the final AI4S-HANDOFF-V1 block. Once Pro returns it,
the user copies the whole block and runs `/ai4s-ingest` (optionally with the share URL).
