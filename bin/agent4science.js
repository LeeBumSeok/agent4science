#!/usr/bin/env node
/**
 * agent4science CLI — a thin wrapper so the plugin can be installed the same way as
 * oh-my-openagent, e.g.:
 *
 *   npx agent4science install            # into ./.opencode
 *   npx agent4science install --global   # into ~/.config/opencode
 *   bunx agent4science install /path/to/project
 *
 * It simply runs the repo's install.sh (which copies the agents/commands/plugin into the
 * OpenCode config directory, where OpenCode auto-registers them, and provisions the yaml dep).
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , cmd, ...rest] = process.argv;

function usage() {
  console.log(`agent4science — oh-my-ai4science installer for OpenCode

Usage:
  agent4science install [TARGET_DIR]   install into <dir>/.opencode (default: cwd)
  agent4science install --global       install into ~/.config/opencode (all projects)
  agent4science install --singular ... force singular plugin/command/agent dir names

After installing, start OpenCode and select the 'ai4science' agent (Tab) or run /ai4s-init.`);
}

if (cmd !== 'install') {
  usage();
  process.exit(cmd ? 1 : 0);
}

const script = join(pkgRoot, 'install.sh');
const res = spawnSync('bash', [script, ...rest], { stdio: 'inherit' });
process.exit(res.status ?? 1);
