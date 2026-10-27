#!/usr/bin/env bash
# Installs the rudis-monorepo skill into the global Claude Code skills directory.
# Usage (from the repo folder):  bash install.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$DIR/dist/rudis-monorepo.skill"
DEST="$HOME/.claude/skills"
TARGET="$DEST/rudis-monorepo"

if [ ! -f "$SKILL" ]; then
  echo "Package not found: $SKILL" >&2
  exit 1
fi

mkdir -p "$DEST"
rm -rf "$TARGET"

if command -v unzip >/dev/null 2>&1; then
  unzip -q "$SKILL" -d "$DEST"
elif command -v python3 >/dev/null 2>&1; then
  python3 -c "import zipfile; zipfile.ZipFile('$SKILL').extractall('$DEST')"
else
  echo "Need 'unzip' or 'python3' to extract the package." >&2
  exit 1
fi

echo "Installed rudis-monorepo -> $TARGET"
echo "Open Claude Code and ask to build a monorepo, or run /rudis-monorepo."
