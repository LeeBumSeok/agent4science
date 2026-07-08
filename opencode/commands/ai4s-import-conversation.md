---
description: Import a FULL ChatGPT conversation from a share link (replaces a handoff)
---

Import an entire ChatGPT Pro research conversation from a public share link and use it as the
research source (this replaces the compact AI4S-HANDOFF-V1 block).

The share link is:

$ARGUMENTS

Steps:

1. Call the `ai4s_import_conversation` tool with `url` set to the link above.
2. The tool fetches the public share page, decodes the full transcript, saves it to
   `.ai4science/pro_conversation.md`, records the link as provenance, and advances state to
   `handoff_imported`.
3. Report the conversation title, number of turns, and the next step (`/ai4s-validate`, which
   will derive the research question, hypothesis, experiment, and tasks from the transcript).

If the fetch fails (private link, changed format, or the page is bot-blocked), tell the user
and offer the fallback: paste the AI4S-HANDOFF-V1 block via `/ai4s-ingest`, or paste the
conversation text manually.

Note: the share link is fetched once, at the user's explicit request, and is stored only as a
provenance URL — the transcript itself is what drives the pipeline.
