#!/bin/sh
set -eu
dest=".claude-plugin/types/claude-code"
src=$(ls -t /private/tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts 2>/dev/null | head -1 || true)
if [ -z "$src" ]; then
  echo "No bundled claude-code.d.ts found. Load the plugin-authoring skill once in a Claude Code session, then rerun." >&2
  exit 1
fi
mkdir -p "$dest"
cp "$src" "$dest/index.d.ts"
echo "laid $src"
