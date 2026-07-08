---
description: Show the current pipeline state and next step
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---
Show where this AI4Science project stands.

Run: `agent4science state get`

Report the current state, the next state, whether it can advance and any missing artifacts, and
the command that produces the next artifact. If `.ai4science/` does not exist, tell the user to
run `/ai4s-init <goal>` first.
