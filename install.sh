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

case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) windows=1 ;; *) windows=0 ;; esac

if command -v unzip >/dev/null 2>&1; then
  unzip -q "$SKILL" -d "$DEST"
elif [ "$windows" = 1 ]; then
  # Git Bash on Windows without unzip: .NET, as install.ps1 does. Never python3 here — on
  # Windows it is often the WindowsApps alias, which opens the Store and hangs.
  if ! command -v powershell >/dev/null 2>&1; then
    echo "Need 'unzip' or PowerShell to extract the package — or run ./install.ps1 from PowerShell." >&2
    exit 1
  fi
  SKILL="$(cygpath -w "$SKILL")" DEST="$(cygpath -w "$DEST")" powershell -NoProfile -Command \
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:SKILL, $env:DEST)'
elif command -v python3 >/dev/null 2>&1; then
  python3 -c "import zipfile; zipfile.ZipFile('$SKILL').extractall('$DEST')"
else
  echo "Need 'unzip' or 'python3' to extract the package." >&2
  exit 1
fi

echo "Installed rudis-monorepo -> $TARGET"
echo "Open Claude Code and ask to build a monorepo, or run /rudis-monorepo."
