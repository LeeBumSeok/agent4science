---
description: Import a full shared conversation (ChatGPT or Claude) as the research source
argument-hint: <chatgpt-or-claude-share-url>
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---
Import an entire shared research conversation and use it as the research source.

Run: `agent4science import "$ARGUMENTS"`

This fetches the public share (ChatGPT `chatgpt.com/share/...` or Claude
`claude.ai/share/...`), decodes the transcript to `.ai4science/pro_conversation.md`,
records the link as provenance, and advances state to `handoff_imported`. Report the title
and turn count, then the next step: `/ai4s-validate`. If the fetch fails, tell the user and
offer `/ai4s-ingest` (paste a handoff) as a fallback.
