#!/usr/bin/env node
// Rebuilds dist/rudis-monorepo.skill from source, so the shipped package never drifts
// from SKILL.md / references/ / scripts/. Zero npm dependencies: on macOS/Linux it shells out
// to the zip tool the platform already has (matches the extraction fallback chain in
// install.sh); on Windows it writes the zip itself, because the .NET ZipFile that Windows
// PowerShell 5.1 offers names entries with `\` — `unzip` then warns and exits 1.
//
// Every build and every --check reads the archive back here, in Node, and refuses an entry
// that is not `rudis-monorepo/<path>` with `/` separators (entryProblems).
//
// Usage: node scripts/package.mjs           rebuild the package
//        node scripts/package.mjs --check   fail if the committed package differs from the sources

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
export const SKILL_NAME = "rudis-monorepo";
const OUT = join(REPO_ROOT, "dist", `${SKILL_NAME}.skill`);

// This is the entire contract: only these are installed by install.ps1/install.sh.
// evals/, dist/, install.*, .gitignore, .git/ must never appear in the package.
const PAYLOAD = ["SKILL.md", "README.md", "references", "scripts"];
const FORBIDDEN = ["evals", "dist", "install.ps1", "install.sh", ".git", ".gitignore"];

/** What is wrong with a package's entry names — empty when every one is fine. */
export function entryProblems(names) {
  const problems = [];
  for (const n of names) {
    if (n.includes("\\")) problems.push(`uses \\ as a path separator (unzip warns and exits 1): ${n}`);
    else if (n !== `${SKILL_NAME}/` && !n.startsWith(`${SKILL_NAME}/`)) problems.push(`outside ${SKILL_NAME}/: ${n}`);
    else if (n.split("/").some((part) => part === "..")) problems.push(`climbs out with ..: ${n}`);
    else if (FORBIDDEN.some((f) => n === `${SKILL_NAME}/${f}` || n.startsWith(`${SKILL_NAME}/${f}/`))) problems.push(`not part of the payload: ${n}`);
  }
  if (!names.includes(`${SKILL_NAME}/SKILL.md`)) problems.push(`${SKILL_NAME}/SKILL.md is missing`);
  return problems;
}

// zlib.crc32 needs Node 20.15+/22.2+; this table works on any Node the scaffolder runs on.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip of `files` ({ name, data }): deflated, `/`-separated names as given, a fixed date so a rebuild of the same sources is byte-identical. */
export function writeZip(files) {
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, the zip epoch
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0 (deflate)
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix — so the mode below is read
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // a regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Every entry of a zip ({ name, data }) from its central directory, as stored — names are not normalised. */
export function readZip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip archive (no end of central directory)");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`broken central directory at entry ${k}`);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const at = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const raw = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`${name}: compression method ${method} is not supported`);
    entries.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Files under `parent`, as `/`-separated paths relative to it, sorted. */
function stagedFiles(parent) {
  return readdirSync(parent, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const full = join(e.parentPath ?? e.path, e.name);
      return { full, rel: full.slice(parent.length + 1).split("\\").join("/") };
    })
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

const ignored = (p) => p.split("/").at(-1) === ".DS_Store";
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Compares every file in the committed package with the staged sources (zip timestamps aside). */
function checkPackage(stageParent) {
  if (!existsSync(OUT)) {
    console.error(`✗ ${OUT} is missing — run node scripts/package.mjs`);
    process.exitCode = 1;
    return;
  }
  const entries = readZip(readFileSync(OUT));
  const problems = entryProblems(entries.map((e) => e.name));
  if (problems.length) {
    console.error(`✗ dist/${SKILL_NAME}.skill has entries no installer should get — run node scripts/package.mjs\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }
  const packed = Object.fromEntries(
    entries.filter((e) => !e.name.endsWith("/") && !ignored(e.name)).map((e) => [e.name, sha256(e.data)]),
  );
  const staged = {};
  for (const { full, rel } of stagedFiles(stageParent)) if (!ignored(rel)) staged[rel] = sha256(readFileSync(full));
  const diff = [...new Set([...Object.keys(packed), ...Object.keys(staged)])]
    .filter((p) => packed[p] !== staged[p])
    .map((p) => `${!packed[p] ? "not packaged" : !staged[p] ? "removed from sources" : "changed"}: ${p}`);
  if (diff.length) {
    console.error(`✗ dist/${SKILL_NAME}.skill is stale — run node scripts/package.mjs\n  ${diff.join("\n  ")}`);
    process.exitCode = 1;
  } else console.log(`✓ dist/${SKILL_NAME}.skill matches the sources (${Object.keys(staged).length} files)`);
}

function build(stageParent) {
  mkdirSync(dirname(OUT), { recursive: true });
  if (existsSync(OUT)) rmSync(OUT);

  if (process.platform === "win32") {
    const files = stagedFiles(stageParent).filter((f) => !ignored(f.rel));
    writeFileSync(OUT, writeZip(files.map((f) => ({ name: f.rel, data: readFileSync(f.full) }))));
  } else if (spawnSync("zip", ["-v"], { stdio: "ignore", shell: true }).status === 0) {
    const r = spawnSync("zip", ["-rq", OUT, SKILL_NAME], { cwd: stageParent, shell: true });
    if (r.status !== 0) throw new Error(`zip failed: ${r.stderr}`);
  } else if (spawnSync("python3", ["--version"], { stdio: "ignore", shell: true }).status === 0) {
    const py = `
import zipfile, os
root = ${JSON.stringify(stageParent)}
out = ${JSON.stringify(OUT)}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirs, files in os.walk(root):
        for f in files:
            full = os.path.join(dirpath, f)
            zf.write(full, os.path.relpath(full, root))
`;
    const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`python3 zip failed: ${r.stderr}`);
  } else {
    throw new Error("Need 'zip' or 'python3' to build the package.");
  }

  // Verify the produced archive's actual entries, not just what we intended to stage.
  const entries = readZip(readFileSync(OUT)).map((e) => e.name);
  const problems = entryProblems(entries);
  if (problems.length) {
    rmSync(OUT);
    throw new Error(`the built package was refused and removed:\n  ${problems.join("\n  ")}`);
  }

  const size = statSync(OUT).size;
  console.log(`✓ Built ${OUT} (${size} bytes, ${entries.length} entries)`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const scratchRoot = join(REPO_ROOT, ".smoke-tmp");
  mkdirSync(scratchRoot, { recursive: true });
  const stageParent = mkdtempSync(join(scratchRoot, "package-"));
  const stageRoot = join(stageParent, SKILL_NAME);
  mkdirSync(stageRoot, { recursive: true });

  try {
    for (const rel of PAYLOAD) {
      const src = join(REPO_ROOT, rel);
      if (!existsSync(src)) throw new Error(`payload entry missing from repo: ${rel}`);
      cpSync(src, join(stageRoot, rel), { recursive: true });
    }

    // Defensive check on what we staged, independent of how the zip tool behaves.
    const staged = readdirSync(stageRoot);
    const stray = staged.filter((name) => FORBIDDEN.includes(name));
    if (stray.length) throw new Error(`staged package contains forbidden entries: ${stray.join(", ")}`);

    if (process.argv.includes("--check")) checkPackage(stageParent);
    else build(stageParent);
  } finally {
    rmSync(stageParent, { recursive: true, force: true });
  }
}
