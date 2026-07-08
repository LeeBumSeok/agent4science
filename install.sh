#!/usr/bin/env bash
#
# install.sh — install the oh-my-ai4science OpenCode plugin, commands, and agents.
#
# Usage:
#   ./install.sh [TARGET_PROJECT_DIR]   # install into <dir>/.opencode  (default: cwd)
#   ./install.sh --global               # install into ~/.config/opencode
#   ./install.sh --singular [TARGET]    # force singular dir names (plugin/command/agent)
#
# OpenCode auto-loads plugins/commands/agents from these directories, so no config edit is
# needed. The plugin's core logic is copied into a sibling <opencode>/ai4s-core/ directory
# (kept out of the plugin scan dir so OpenCode never treats a core module as a plugin).

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STYLE="plural"        # plural (default, per current docs) or singular
TARGET=""
GLOBAL=0

for arg in "$@"; do
  case "$arg" in
    --global) GLOBAL=1 ;;
    --singular) STYLE="singular" ;;
    --plural) STYLE="plural" ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) TARGET="$arg" ;;
  esac
done

if [[ "$GLOBAL" -eq 1 ]]; then
  OC_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
else
  TARGET="${TARGET:-$(pwd)}"
  OC_DIR="$TARGET/.opencode"
fi

# Directory names: prefer whatever already exists; otherwise use the chosen style.
pick_dir() {  # $1 = singular, $2 = plural
  if [[ -d "$OC_DIR/$1" ]]; then echo "$1"
  elif [[ -d "$OC_DIR/$2" ]]; then echo "$2"
  elif [[ "$STYLE" == "singular" ]]; then echo "$1"
  else echo "$2"
  fi
}

PLUGIN_DIR="$OC_DIR/$(pick_dir plugin plugins)"
COMMAND_DIR="$OC_DIR/$(pick_dir command commands)"
AGENT_DIR="$OC_DIR/$(pick_dir agent agents)"

echo "Installing oh-my-ai4science into: $OC_DIR"
echo "  plugin  -> $PLUGIN_DIR"
echo "  command -> $COMMAND_DIR"
echo "  agent   -> $AGENT_DIR"

CORE_DIR="$OC_DIR/ai4s-core"
mkdir -p "$PLUGIN_DIR" "$COMMAND_DIR" "$AGENT_DIR" "$CORE_DIR"

# Plugin entry + its core library (library in a sibling dir, not under the plugin scan dir).
cp "$SRC_DIR/opencode/plugins/ai4science.js" "$PLUGIN_DIR/ai4science.js"
cp "$SRC_DIR"/src/core/*.js "$CORE_DIR/"

# Commands and agents.
cp "$SRC_DIR"/opencode/commands/*.md "$COMMAND_DIR/"
cp "$SRC_DIR"/opencode/agents/*.md "$AGENT_DIR/"

# Runtime dependency manifest (yaml). Do not clobber an existing package.json.
if [[ ! -f "$OC_DIR/package.json" ]]; then
  cp "$SRC_DIR/opencode/package.json" "$OC_DIR/package.json"
elif ! grep -q '"yaml"' "$OC_DIR/package.json"; then
  echo "NOTE: $OC_DIR/package.json exists but does not list \"yaml\";"
  echo "      the plugin needs it to parse handoffs. Vendoring it below just in case."
fi

# Ensure the 'yaml' package is actually resolvable by the plugin, fully automatically.
# Strategy (first that works): vendor from this repo → bun install → npm install.
ensure_yaml() {
  if [[ -d "$OC_DIR/node_modules/yaml" ]]; then
    echo "  yaml: already present"
    return 0
  fi
  # Resolve yaml wherever it lives (handles npm hoisting when installed as a package).
  local yaml_pkg=""
  if command -v node >/dev/null 2>&1; then
    yaml_pkg="$(cd "$SRC_DIR" && node -e 'try{console.log(require("path").dirname(require.resolve("yaml/package.json")))}catch{}' 2>/dev/null || true)"
  fi
  if [[ -n "$yaml_pkg" && -d "$yaml_pkg" ]]; then
    mkdir -p "$OC_DIR/node_modules"
    cp -R "$yaml_pkg" "$OC_DIR/node_modules/yaml"
    echo "  yaml: vendored from $yaml_pkg"
    return 0
  fi
  if [[ -d "$SRC_DIR/node_modules/yaml" ]]; then
    mkdir -p "$OC_DIR/node_modules"
    cp -R "$SRC_DIR/node_modules/yaml" "$OC_DIR/node_modules/yaml"
    echo "  yaml: vendored from $SRC_DIR/node_modules"
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    ( cd "$OC_DIR" && bun install >/dev/null 2>&1 ) && { echo "  yaml: installed via bun"; return 0; }
  fi
  if command -v npm >/dev/null 2>&1; then
    ( cd "$OC_DIR" && npm install >/dev/null 2>&1 ) && { echo "  yaml: installed via npm"; return 0; }
  fi
  echo "  yaml: COULD NOT be provisioned automatically."
  echo "        Run 'npm install' (or 'bun install') in $OC_DIR, or copy a 'yaml' package"
  echo "        into $OC_DIR/node_modules/."
  return 1
}
ensure_yaml || true

echo
echo "Done. OpenCode auto-registers everything in this directory — no config edit needed:"
echo "  - primary agent 'ai4science' (visible in the TUI agent switcher / Tab)"
echo "  - specialist subagents @ai4s-*  (invoked via @mention or by the commands)"
echo "  - slash commands /ai4s-*"
echo "  - the ai4science plugin (custom tools + safety hook)"
echo
if [[ "$GLOBAL" -eq 1 ]]; then
  echo "Installed globally: available in every project. Start with:  /ai4s-init <goal>"
else
  echo "Installed for this project. Start OpenCode here and run:  /ai4s-init <goal>"
fi
echo "If OpenCode was already running, restart it (or reload) to pick up the new files."
