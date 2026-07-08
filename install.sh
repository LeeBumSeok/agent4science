#!/usr/bin/env bash
#
# install.sh — install agent4science into a coding agent's config.
#
# Usage:
#   ./install.sh [DIR] [--global] [--target opencode|claude|codex|all] [--singular]
#
#   --target opencode  (default) OpenCode plugin + agents + commands  → <DIR>/.opencode or ~/.config/opencode
#   --target claude    Claude Code agents + commands                  → <DIR>/.claude   or ~/.claude
#   --target codex     Codex CLI custom prompts                       → ~/.codex/prompts
#   --target all       all of the above
#   --global           use the per-user config dir instead of <DIR>
#   --singular         (opencode only) force singular plugin/command/agent dir names
#
# OpenCode loads a native JS plugin (custom tools + safety hook). Claude Code and Codex drive
# the same pipeline through the `agent4science` CLI, so for those targets install the CLI too:
#   npm install -g agent4science

set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STYLE="plural"; TARGET_DIR=""; GLOBAL=0; WHICH="opencode"
for arg in "$@"; do
  case "$arg" in
    --global) GLOBAL=1 ;;
    --singular) STYLE="singular" ;;
    --plural) STYLE="plural" ;;
    --target=*) WHICH="${arg#--target=}" ;;
    --target) : ;;                       # value consumed below
    opencode|claude|codex|all) WHICH="$arg" ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) TARGET_DIR="$arg" ;;
  esac
done

ensure_yaml() {  # $1 = opencode config dir
  local oc="$1"
  [[ -d "$oc/node_modules/yaml" ]] && { echo "  yaml: already present"; return 0; }
  local yaml_pkg=""
  if command -v node >/dev/null 2>&1; then
    yaml_pkg="$(cd "$SRC_DIR" && node -e 'try{console.log(require("path").dirname(require.resolve("yaml/package.json")))}catch{}' 2>/dev/null || true)"
  fi
  if [[ -n "$yaml_pkg" && -d "$yaml_pkg" ]]; then
    mkdir -p "$oc/node_modules"; cp -R "$yaml_pkg" "$oc/node_modules/yaml"; echo "  yaml: vendored"; return 0
  fi
  if command -v bun >/dev/null 2>&1 && ( cd "$oc" && bun install >/dev/null 2>&1 ); then echo "  yaml: bun install"; return 0; fi
  if command -v npm >/dev/null 2>&1 && ( cd "$oc" && npm install >/dev/null 2>&1 ); then echo "  yaml: npm install"; return 0; fi
  echo "  yaml: NOT provisioned — run 'npm install' in $oc"; return 1
}

install_opencode() {
  local oc; if [[ "$GLOBAL" -eq 1 ]]; then oc="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"; else oc="${TARGET_DIR:-$(pwd)}/.opencode"; fi
  local pd cd ad
  pick() { if [[ -d "$oc/$1" ]]; then echo "$1"; elif [[ -d "$oc/$2" ]]; then echo "$2"; elif [[ "$STYLE" == singular ]]; then echo "$1"; else echo "$2"; fi; }
  pd="$oc/$(pick plugin plugins)"; cd="$oc/$(pick command commands)"; ad="$oc/$(pick agent agents)"
  echo "OpenCode → $oc"
  mkdir -p "$pd" "$cd" "$ad" "$oc/ai4s-core"
  cp "$SRC_DIR/opencode/plugins/ai4science.js" "$pd/ai4science.js"
  cp "$SRC_DIR"/src/core/*.js "$oc/ai4s-core/"
  cp "$SRC_DIR"/opencode/commands/*.md "$cd/"
  cp "$SRC_DIR"/opencode/agents/*.md "$ad/"
  [[ -f "$oc/package.json" ]] || cp "$SRC_DIR/opencode/package.json" "$oc/package.json"
  ensure_yaml "$oc" || true
  echo "  primary agent 'ai4science' + @ai4s-* subagents + /ai4s-* commands + plugin registered."
}

install_claude() {
  local cdir; if [[ "$GLOBAL" -eq 1 ]]; then cdir="$HOME/.claude"; else cdir="${TARGET_DIR:-$(pwd)}/.claude"; fi
  echo "Claude Code → $cdir"
  mkdir -p "$cdir/agents" "$cdir/commands"
  cp "$SRC_DIR"/claude/agents/*.md "$cdir/agents/"
  cp "$SRC_DIR"/claude/commands/*.md "$cdir/commands/"
  echo "  ai4science agent + @ai4s-* subagents + /ai4s-* commands registered."
  echo "  NOTE: install the CLI so commands work:  npm install -g agent4science"
}

install_codex() {
  local xdir="$HOME/.codex"
  echo "Codex CLI → $xdir/prompts"
  mkdir -p "$xdir/prompts"
  cp "$SRC_DIR"/codex/prompts/*.md "$xdir/prompts/"
  echo "  /ai4s-* prompts registered."
  echo "  NOTE: install the CLI so prompts work:  npm install -g agent4science"
}

case "$WHICH" in
  opencode) install_opencode ;;
  claude)   install_claude ;;
  codex)    install_codex ;;
  all)      install_opencode; echo; install_claude; echo; install_codex ;;
  *) echo "unknown --target: $WHICH (use opencode|claude|codex|all)" >&2; exit 2 ;;
esac

echo
echo "Done. Restart your coding agent if it was running, then start with:  /ai4s-init <goal>"
