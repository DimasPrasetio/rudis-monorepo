#!/usr/bin/env node
// Tags kernel releases: rudis-monorepo/kernel/v<N>.<R> at a commit that changes what a
// scaffolded project or the references contain (scripts/scaffold.mjs, scripts/templates/,
// references/). N is kernel.Version; R counts releases of that kernel (0, 1, …) — a release
// with the same N changes nothing a module can rely on (AGENTS.md › The module contract).
// The module library pins one of these with its kernel-sync, never a working tree. The
// post-commit hook runs this; push with `git push --follow-tags`.
//
// Usage: node scripts/kernel-tag.mjs [--check]   --check: exit 1 if HEAD is an untagged release
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes("--check");
const git = (...args) => spawnSync("git", args, { cwd: SKILL, encoding: "utf8" });
const out = (...args) => git(...args).stdout.trim();

const prefix = out("rev-parse", "--show-prefix"); // "rudis-monorepo/"
const top = out("rev-parse", "--show-toplevel");
const inputs = ["scripts/scaffold.mjs", "scripts/templates", "references"].map((p) => `${prefix}${p}`);
const base = `${prefix || "rudis-monorepo/"}kernel/v`;

const kernelSrc = spawnSync("git", ["show", `HEAD:${prefix}scripts/templates/go/internal/kernel/kernel.go.tmpl`], { cwd: top, encoding: "utf8" }).stdout;
const kernel = Number(kernelSrc.match(/const Version = (\d+)/)?.[1]);
if (!kernel) {
  console.error("kernel-tag: no const Version in kernel.go.tmpl at HEAD");
  process.exit(1);
}

const tags = out("tag", "--list", `${base}*`, "--sort=-version:refname").split("\n").filter(Boolean);
const latest = tags[0];
if (latest && spawnSync("git", ["diff", "--quiet", latest, "HEAD", "--", ...inputs], { cwd: top }).status === 0) {
  console.log(`kernel-tag: HEAD is released as ${latest}`);
  process.exit(0);
}
if (CHECK) {
  console.error(`kernel-tag: HEAD changes ${inputs.map((p) => p.slice(prefix.length)).join(", ")} since ${latest ?? "the first release"} but has no ${base}${kernel}.<R> tag — run node scripts/kernel-tag.mjs`);
  process.exit(1);
}
const releases = tags.filter((t) => t.startsWith(`${base}${kernel}.`)).map((t) => Number(t.slice(`${base}${kernel}.`.length)));
const tag = `${base}${kernel}.${releases.length ? Math.max(...releases) + 1 : 0}`;
const r = git("tag", "-a", tag, "-m", `kernel ${kernel} release`, "HEAD");
if (r.status !== 0) {
  console.error(`kernel-tag: could not tag ${tag}: ${r.stderr.trim()}`);
  process.exit(1);
}
console.log(`tagged ${tag} — push with git push --follow-tags; pin it in the library with npm run kernel:sync -- --skill <this folder>`);
