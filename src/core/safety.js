/**
 * safety.js — command denylist and artifact-path screening.
 *
 * A handoff is untrusted input. Every command it proposes and every artifact path it
 * declares is screened here before the CLI acts on it. This module is pure (no I/O) so it
 * can be reused by the plugin's `tool.execute.before` hook and unit-tested directly.
 */

/**
 * Detect `rm` invocations that combine recursive and force flags, in any spelling
 * (`-rf`, `-fr`, `-r -f`, `--recursive --force`). Checks every `rm` token in the command.
 */
function hasRecursiveForceRm(cmd) {
  const tokens = cmd.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'rm') continue;
    let recursive = false;
    let force = false;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (!t.startsWith('-')) {
        // still scan following flags; a path argument doesn't end the flag search here
        // because forms like `rm dir -rf` are unusual but possible
        if (/^-/.test(t) === false) continue;
      }
      if (t.startsWith('-')) {
        if (/r/.test(t) || t === '--recursive') recursive = true;
        if (/f/.test(t) || t === '--force') force = true;
      }
    }
    if (recursive && force) return true;
  }
  return false;
}

/**
 * Ordered denylist. Each rule is either a regex (`re`) or a predicate (`test`).
 * The first matching rule wins and is reported.
 */
const DENY_RULES = [
  { rule: 'rm-recursive-force', test: hasRecursiveForceRm, reason: 'recursive force delete (rm -rf)' },
  { rule: 'fork-bomb', re: /:\s*\(\s*\)\s*\{.*\|.*&\s*\}/, reason: 'fork bomb' },
  { rule: 'pipe-to-shell', re: /\b(curl|wget|fetch)\b[\s\S]*\|\s*(sudo\s+)?(ba|z|k)?sh\b/i, reason: 'pipe remote content into a shell' },
  { rule: 'sudo', re: /(^|\s)sudo\s/i, reason: 'privilege escalation (sudo)' },
  { rule: 'git-force-push', re: /\bgit\s+push\b[\s\S]*(--force\b|(^|\s)-f\b)/i, reason: 'git force push' },
  { rule: 'git-hard-reset-remote', re: /\bgit\s+reset\s+--hard\s+origin\b/i, reason: 'git hard reset to remote' },
  { rule: 'cloud-cli', re: /(^|\s)(aws|gcloud|az|kubectl|terraform|heroku|doctl)\s/i, reason: 'cloud / infra CLI (possible cost or external action)' },
  { rule: 'credential-access', re: /(~\/\.ssh|~\/\.aws|\/\.ssh\/|\/\.aws\/|(^|\s)\.env(\s|$)|id_rsa|security\s+find-generic-password)/i, reason: 'credential or secret access' },
  { rule: 'remote-pip-install', re: /\bpip\s+install\b[\s\S]*https?:\/\//i, reason: 'pip install from a URL' },
  { rule: 'disk-write', re: /\b(mkfs\S*|dd\s+if=)/i, reason: 'destructive disk operation' },
  { rule: 'power-control', re: /(^|\s)(shutdown|reboot|halt|poweroff)\b/i, reason: 'system power control' },
  { rule: 'chmod-777', re: /\bchmod\s+(-R\s+)?0?777\b/i, reason: 'overly permissive chmod 777' },
];

/**
 * Screen a single command string.
 * @param {string} cmd
 * @returns {{safe: boolean, rule?: string, reason?: string}}
 */
export function screenCommand(cmd) {
  if (typeof cmd !== 'string' || cmd.trim() === '') {
    return { safe: true };
  }
  for (const r of DENY_RULES) {
    const hit = r.test ? r.test(cmd) : r.re.test(cmd);
    if (hit) {
      return { safe: false, rule: r.rule, reason: r.reason };
    }
  }
  return { safe: true };
}

/**
 * Screen a list of commands.
 * @param {string[]} cmds
 * @returns {{safe: boolean, violations: Array<{command: string, rule: string, reason: string}>}}
 */
export function screenCommands(cmds) {
  const violations = [];
  for (const cmd of cmds || []) {
    const r = screenCommand(cmd);
    if (!r.safe) {
      violations.push({ command: cmd, rule: r.rule, reason: r.reason });
    }
  }
  return { safe: violations.length === 0, violations };
}

/**
 * An artifact path is safe only if it is relative, contains no `..` traversal or `~`,
 * and lives under `.ai4science/`.
 * @param {string} p
 * @returns {boolean}
 */
export function isSafeArtifactPath(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.startsWith('/')) return false;
  if (p.startsWith('~')) return false;
  if (p.split('/').includes('..')) return false;
  if (p !== '.ai4science' && !p.startsWith('.ai4science/')) return false;
  return true;
}
