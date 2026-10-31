// The package's zip format and its entry guard, with no build: node --test scripts/package.test.mjs
// (npm run verify and CI run it). Reads dist/rudis-monorepo.skill; writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_NAME, entryProblems, readZip, writeZip } from "./package.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("entryProblems refuses \\ separators, paths outside the skill, .., the non-payload, and a missing SKILL.md", () => {
  const ok = [`${SKILL_NAME}/`, `${SKILL_NAME}/SKILL.md`, `${SKILL_NAME}/references/api-standard.md`];
  assert.deepEqual(entryProblems(ok), []);

  const one = (name) => entryProblems([`${SKILL_NAME}/SKILL.md`, name]);
  assert.match(one(`${SKILL_NAME}\\README.md`)[0], /uses \\ as a path separator/);
  assert.match(one(`${SKILL_NAME}/references\\api-standard.md`)[0], /uses \\ as a path separator/);
  assert.match(one("README.md")[0], /outside rudis-monorepo\//);
  assert.match(one(`${SKILL_NAME}/../x`)[0], /climbs out/);
  assert.match(one(`${SKILL_NAME}/evals/evals.json`)[0], /not part of the payload/);
  assert.match(one(`${SKILL_NAME}/install.sh`)[0], /not part of the payload/);
  assert.match(entryProblems([`${SKILL_NAME}\\SKILL.md`]).at(-1), /SKILL\.md is missing/);
});

test("writeZip → readZip keeps names and bytes, and the same input gives the same archive", () => {
  const files = [
    { name: `${SKILL_NAME}/SKILL.md`, data: Buffer.from("# skill\n") },
    { name: `${SKILL_NAME}/scripts/a b/ü.mjs`, data: Buffer.from("x".repeat(5000)) },
    { name: `${SKILL_NAME}/empty`, data: Buffer.alloc(0) },
  ];
  const zip = writeZip(files);
  const back = readZip(zip);
  assert.deepEqual(back.map((e) => e.name), files.map((f) => f.name));
  for (let i = 0; i < files.length; i++) assert.ok(back[i].data.equals(files[i].data), files[i].name);
  assert.ok(writeZip(files).equals(zip));
});

test("readZip reports a \\ name as stored, so the guard sees what unzip sees", () => {
  // What Windows PowerShell 5.1's ZipFile.CreateFromDirectory wrote.
  const names = readZip(writeZip([{ name: `${SKILL_NAME}\\SKILL.md`, data: Buffer.from("x") }])).map((e) => e.name);
  assert.deepEqual(names, [`${SKILL_NAME}\\SKILL.md`]);
  assert.ok(entryProblems(names).some((p) => p.includes("path separator")));
  assert.throws(() => readZip(Buffer.from("not a zip")), /not a zip archive/);
});

test("the committed dist package passes the guard", () => {
  const names = readZip(readFileSync(join(REPO_ROOT, "dist", `${SKILL_NAME}.skill`))).map((e) => e.name);
  assert.deepEqual(entryProblems(names), []);
});
