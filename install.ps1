# Installs the rudis-monorepo skill into the global Claude Code skills directory.
# Usage (from the repo folder):  ./install.ps1
$ErrorActionPreference = "Stop"

$skill = Join-Path $PSScriptRoot "dist/rudis-monorepo.skill"
if (-not (Test-Path $skill)) {
    Write-Error "Package not found: $skill"
    exit 1
}

$dest = Join-Path $HOME ".claude/skills"
$target = Join-Path $dest "rudis-monorepo"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
if (Test-Path $target) { Remove-Item -Recurse -Force $target }

# Extract via .NET so the .skill extension (a zip) is accepted on Windows PowerShell 5.1 too.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($skill, $dest)

Write-Host "Installed rudis-monorepo -> $target"
Write-Host "Open Claude Code and ask to build a monorepo, or run /rudis-monorepo."
