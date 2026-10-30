// node --test scripts/generated-scripts.test.mjs — the database scripts a project gets, with no
// database and no MySQL client: the guard's own tests, .env.example holding no usable DSN,
// db-local's SQL per server version, and check-migrations on a project's first commit
// (references/local-database.md). Part of npm run verify.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Repo-local scratch dir — see the comment in smoke-test.mjs for why this isn't os.tmpdir().
const SCRATCH_ROOT = join(REPO_ROOT, ".smoke-tmp");
const projects = {};
let scratch;

const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: "utf8", ...opts });

before(() => {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  scratch = mkdtempSync(join(SCRATCH_ROOT, "scripts-"));
  for (const backend of ["go", "nestjs", "express"]) {
    const dir = join(scratch, backend);
    const r = node([join(REPO_ROOT, "scripts/scaffold.mjs"), "--name", "Kasir App", "--backend", backend, "--dir", dir, "--force"]);
    assert.equal(r.status, 0, r.stderr);
    projects[backend] = dir;
  }
});
after(() => rmSync(scratch, { recursive: true, force: true }));

test("go: the guard's own tests pass in a fresh project", () => {
  const r = node(["--test", "scripts/db-guard.test.mjs"], { cwd: projects.go });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test(".env.example holds no value a database client would accept", () => {
  for (const [backend, dir] of Object.entries(projects)) {
    const values = readFileSync(join(dir, ".env.example"), "utf8").split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => l.slice(l.indexOf("=") + 1));
    const dsns = values.filter((v) => /@tcp\(|^mysql:\/\//.test(v));
    assert.deepEqual(dsns, [], `${backend}: ${dsns.join(", ")}`);
  }
});

test("db-local --print-sql: caching_sha2_password on MySQL 8+, the version decides", () => {
  const sql = (dir, version) => {
    const r = node(["scripts/db-local.mjs", "--print-sql", "--server-version", version], { cwd: dir });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  for (const version of ["8.0.39", "8.4.3", "9.1.0"]) {
    const out = sql(projects.go, version);
    assert.match(out, /CREATE USER IF NOT EXISTS 'kasirapp_dev'@'127\.0\.0\.1' IDENTIFIED WITH caching_sha2_password BY '<password>';/);
    assert.doesNotMatch(out, /mysql_native_password/);
    // "_" escaped: in a database-level GRANT it is a wildcard.
    assert.match(out, /GRANT ALL PRIVILEGES ON `kasirapp\\_db`\.\* TO/);
    assert.match(out, /GRANT ALL PRIVILEGES ON `kasirapp\\_test`\.\* TO/);
    assert.doesNotMatch(out, /ON \*\.\*/, "no global privileges");
    assert.match(out, /TEST_DB_DSN=kasirapp_dev:<password>@tcp\(127\.0\.0\.1:3306\)\/kasirapp_test/);
  }
  assert.doesNotMatch(sql(projects.go, "10.11.6-MariaDB"), /IDENTIFIED WITH/);
  assert.match(sql(projects.nestjs, "8.4.3"), /TEST_DATABASE_URL=mysql:\/\/kasirapp_dev:<password>@127\.0\.0\.1:3306\/kasirapp_test/);
});

test("check-migrations: not applicable on the first commit, still strict afterwards", () => {
  const repo = join(scratch, "migrations-repo");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  copyFileSync(join(projects.go, "scripts/check-migrations.mjs"), join(repo, "scripts/check-migrations.mjs"));
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repo, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const addMigration = (stamp) => {
    mkdirSync(join(repo, "apps/api/migrations"), { recursive: true });
    for (const dir of ["up", "down"]) writeFileSync(join(repo, `apps/api/migrations/${stamp}_x.${dir}.sql`), "SELECT 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", stamp);
    return git("rev-parse", "HEAD");
  };
  const check = (base) => node(["scripts/check-migrations.mjs", ...(base ? [base] : [])], { cwd: repo });

  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "first");
  const first = git("rev-parse", "HEAD");
  addMigration("20260101000000");

  for (const r of [check(first), check(), check("0000000000000000000000000000000000000000")]) {
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /not applicable/);
  }
  const withOne = git("rev-parse", "HEAD");
  addMigration("20250101000000");
  const late = check(withOne);
  assert.equal(late.status, 1, late.stdout);
  assert.match(late.stderr, /20250101000000_x/);
  addMigration("20270101000000");
  assert.equal(check(git("rev-parse", "HEAD~1")).status, 0);
});
