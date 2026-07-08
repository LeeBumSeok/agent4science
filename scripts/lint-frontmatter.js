/**
 * lint-frontmatter.js — sanity-check every command and agent markdown file.
 *
 * Verifies each file starts with a YAML frontmatter block that parses and carries a
 * `description`. Agents must declare a valid `mode`. Exits non-zero on any problem.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function parseFrontmatter(text, file) {
  if (!text.startsWith('---')) {
    errors.push(`${file}: missing frontmatter`);
    return null;
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    errors.push(`${file}: unterminated frontmatter`);
    return null;
  }
  try {
    return YAML.parse(text.slice(3, end));
  } catch (err) {
    errors.push(`${file}: frontmatter parse error: ${err.message}`);
    return null;
  }
}

function lintDir(rel, { requireMode } = {}) {
  const dir = join(root, rel);
  if (!existsSync(dir)) {
    errors.push(`missing directory: ${rel}`);
    return;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) errors.push(`${rel}: no markdown files`);
  for (const f of files) {
    const fm = parseFrontmatter(readFileSync(join(dir, f), 'utf8'), `${rel}/${f}`);
    if (!fm) continue;
    if (!fm.description) errors.push(`${rel}/${f}: missing description`);
    if (requireMode) {
      if (!['primary', 'subagent'].includes(fm.mode)) {
        errors.push(`${rel}/${f}: mode must be primary|subagent (got ${fm.mode})`);
      }
    }
  }
}

lintDir('opencode/commands');
lintDir('opencode/agents', { requireMode: true });

if (errors.length) {
  console.error('Frontmatter lint FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('Frontmatter lint OK: all command and agent files valid.');
