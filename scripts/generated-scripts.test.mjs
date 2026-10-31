// node --test scripts/generated-scripts.test.mjs — the database scripts a project gets, with no
// database and no MySQL client: the guard's own tests, .env.example holding no usable DSN,
// db-local's SQL per server version, and check-migrations on a project's first commit
// (references/local-database.md). Part of npm run verify.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const envOf = (text) => Object.fromEntries(text.split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const PLACEHOLDER = /^(change-me|__[A-Z0-9_]+__|<[^<>]*>)$/i;

test("scaffold writes .env with local values that work — no placeholder, DB keys left to db-local", () => {
  for (const [backend, dir] of Object.entries(projects)) {
    const env = envOf(readFileSync(join(dir, ".env"), "utf8"));
    const example = envOf(readFileSync(join(dir, ".env.example"), "utf8"));
    assert.deepEqual(Object.keys(env).sort(), Object.keys(example).sort(), `${backend}: same keys as .env.example`);
    assert.deepEqual(Object.entries(env).filter(([, v]) => PLACEHOLDER.test(v)), [], `${backend}: placeholder left`);
    assert.match(env.JWT_SECRET, /^[0-9a-f]{64}$/, `${backend}: JWT_SECRET is random`);
    const [main, testKey] = backend === "go" ? ["DB_DSN", "TEST_DB_DSN"] : ["DATABASE_URL", "TEST_DATABASE_URL"];
    assert.equal(env[main], "");
    assert.equal(env[testKey], "");
  }
  assert.match(readFileSync(join(projects.go, ".gitignore"), "utf8"), /^\.env$/m);
});

test("env-local: keys a module adds get local values; the local sign-in is admin@example.com / admin123", () => {
  // A copy: the shared projects stay as scaffolded for the other tests.
  const dir = join(scratch, "env-local");
  cpSync(projects.go, dir, { recursive: true, filter: (src) => !src.includes("node_modules") });
  const before = readFileSync(join(dir, ".env"), "utf8");
  // What module.mjs add writes into .env.example (rudis-modules scripts/lib/install.mjs).
  const added = ["# users", "USERS_BOOTSTRAP_EMAIL=", "USERS_BOOTSTRAP_PASSWORD=", "USERS_BOOTSTRAP_NAME=",
    "# rbac", "RBAC_BOOTSTRAP_ADMIN_EMAIL=", "# audit-log (default 365)", "AUDIT_RETENTION_DAYS=", "SESSION_IDLE_TIMEOUT="];
  writeFileSync(join(dir, ".env.example"), readFileSync(join(dir, ".env.example"), "utf8") + added.join("\n") + "\n");
  // A value somebody set stays; placeholders from an older template are replaced.
  writeFileSync(join(dir, ".env"), before.replace(/^APP_PORT=.*$/m, "APP_PORT=9191").replace(/^JWT_SECRET=.*$/m, "JWT_SECRET=change-me"));
  const r = node(["scripts/env-local.mjs"], { cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const env = envOf(readFileSync(join(dir, ".env"), "utf8"));
  assert.equal(env.USERS_BOOTSTRAP_EMAIL, "admin@example.com");
  assert.equal(env.USERS_BOOTSTRAP_PASSWORD, "admin123");
  assert.equal(env.USERS_BOOTSTRAP_NAME, "admin");
  assert.equal(env.RBAC_BOOTSTRAP_ADMIN_EMAIL, "admin@example.com");
  assert.equal(env.AUDIT_RETENTION_DAYS, "", "an optional key keeps the module default");
  assert.equal(env.APP_PORT, "9191", "a value somebody set is never changed");
  assert.match(env.JWT_SECRET, /^[0-9a-f]{64}$/);

  // Run again: nothing changes.
  const once = readFileSync(join(dir, ".env"), "utf8");
  assert.equal(node(["scripts/env-local.mjs"], { cwd: dir }).status, 0);
  assert.equal(readFileSync(join(dir, ".env"), "utf8"), once);

  // An inventory-style .env (CRLF, placeholders for a person to fill) is repaired in place.
  writeFileSync(join(dir, ".env"), once.replace(/\n/g, "\r\n")
    .replace(/^USERS_BOOTSTRAP_EMAIL=.*$/m, "USERS_BOOTSTRAP_EMAIL=__ISI_EMAIL_PEMILIK__")
    .replace(/^USERS_BOOTSTRAP_PASSWORD=.*$/m, "USERS_BOOTSTRAP_PASSWORD=__ISI_SANDI_PEMILIK__"));
  assert.equal(node(["scripts/env-local.mjs"], { cwd: dir }).status, 0);
  const crlf = readFileSync(join(dir, ".env"), "utf8");
  assert.ok(!/[^\r]\n/.test(crlf) && !crlf.includes("\r\r"), "CRLF kept");
  assert.equal(envOf(crlf).USERS_BOOTSTRAP_EMAIL, "admin@example.com");
  assert.equal(envOf(crlf).USERS_BOOTSTRAP_PASSWORD, "admin123");

  // The inventory .env's database keys: a placeholder anywhere in them empties them for
  // db-local.mjs (exit 0); DB_HOST falls back to .env.example's value.
  const inventory = (lines) => {
    let text = once;
    for (const [k, v] of Object.entries(lines)) text = text.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
    writeFileSync(join(dir, ".env"), text.replace(/\n/g, "\r\n"));
    const r = node(["scripts/env-local.mjs"], { cwd: dir });
    return { r, env: envOf(readFileSync(join(dir, ".env"), "utf8")) };
  };
  const inv = inventory({
    DB_DSN: "__ISI_USER_MYSQL__:__ISI_SANDI_MYSQL__@tcp(127.0.0.1:3306)/kasirapp_db?parseTime=true",
    TEST_DB_DSN: '"__ISI_USER_MYSQL__:__ISI_SANDI_MYSQL__@tcp(127.0.0.1:3306)/kasirapp_test" # isi',
    DB_HOST: "__ISI_HOST_MYSQL__", DB_USER: "__ISI_USER_MYSQL__", DB_PASSWORD: "__ISI_SANDI_MYSQL__",
    APP_NAME: "Toko __ISI__ Maju",
  });
  assert.equal(inv.r.status, 0, inv.r.stderr);
  for (const k of ["DB_DSN", "TEST_DB_DSN", "DB_USER", "DB_PASSWORD"]) assert.equal(inv.env[k], "", k);
  assert.equal(inv.env.DB_HOST, "localhost");
  assert.equal(inv.env.APP_NAME, "Toko __ISI__ Maju", "outside the database keys only a whole-value placeholder counts");
  assert.match(inv.r.stdout, /DB_DSN and TEST_DB_DSN still empty/);
  // db-local.mjs then goes ahead: past its "another account" check, to the sign-in (exit 3 here).
  const dbRun = node(["scripts/db-local.mjs", "--admin-password-empty", "--mysql", process.execPath], { cwd: dir });
  assert.equal(dbRun.status, 3, dbRun.stderr);
  // Run first, on the inventory .env as it is: a placeholder DSN is not another account either.
  writeFileSync(join(dir, ".env"), once.replace(/^DB_DSN=.*$/m, "DB_DSN=__ISI_USER_MYSQL__:__ISI_SANDI_MYSQL__@tcp(127.0.0.1:3306)/kasirapp_db"));
  const first = node(["scripts/db-local.mjs", "--admin-password-empty", "--mysql", process.execPath], { cwd: dir });
  assert.equal(first.status, 3, first.stderr);
  assert.doesNotMatch(first.stderr, /another account/);
  // A DSN for some other real account still stops it.
  writeFileSync(join(dir, ".env"), once.replace(/^DB_DSN=.*$/m, "DB_DSN=root:secret@tcp(127.0.0.1:3306)/kasirapp_db"));
  const foreign = node(["scripts/db-local.mjs", "--admin-password-empty", "--mysql", process.execPath], { cwd: dir });
  assert.equal(foreign.status, 1);
  assert.match(foreign.stderr, /DB_DSN in \.env already point at another account/);
  // Real values are never touched — a working DSN, user and password stay as they are.
  const real = {
    DB_DSN: "kasirapp_dev:Ab3-x9Kq@tcp(127.0.0.1:3306)/kasirapp_db", TEST_DB_DSN: "kasirapp_dev:Ab3-x9Kq@tcp(127.0.0.1:3306)/kasirapp_test",
    DB_USER: "kasirapp_dev", DB_PASSWORD: "Ab3-x9Kq", DB_HOST: "127.0.0.1",
  };
  const kept = inventory(real);
  assert.equal(kept.r.status, 0, kept.r.stderr);
  for (const [k, v] of Object.entries(real)) assert.equal(kept.env[k], v, k);

  // A quoted placeholder with a trailing comment is still a placeholder; of two lines for one
  // key the first counts (as db-local.mjs reads it).
  writeFileSync(join(dir, ".env"), once
    .replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET="change-me" # set me\nJWT_SECRET=mine'));
  assert.equal(node(["scripts/env-local.mjs"], { cwd: dir }).status, 0);
  assert.match(readFileSync(join(dir, ".env"), "utf8"), /^JWT_SECRET=[0-9a-f]{64}\nJWT_SECRET=mine$/m);

  // A placeholder nothing knows a local value for: named, exit 1.
  writeFileSync(join(dir, ".env"), crlf + "SMOKE_DB_DSN=__ISI_USER_MYSQL__\r\n");
  const unknown = node(["scripts/env-local.mjs"], { cwd: dir });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /SMOKE_DB_DSN/);

  // Run through a symlink or junction (macOS /tmp, a linked folder on Windows): still writes .env.
  const link = join(scratch, "env-local-link");
  symlinkSync(dir, link, process.platform === "win32" ? "junction" : "dir");
  rmSync(join(dir, ".env"));
  assert.equal(node([join(link, "scripts/env-local.mjs")]).status, 0);
  assert.match(readFileSync(join(dir, ".env"), "utf8"), /^JWT_SECRET=[0-9a-f]{64}$/m);
  rmSync(link);
});

test("the local sign-in never reaches a server: not in .env.production.example, refused by deploy.sh", () => {
  for (const [backend, dir] of Object.entries(projects)) {
    assert.doesNotMatch(readFileSync(join(dir, "infra/deploy/.env.production.example"), "utf8"), /admin@(example|gmail)|admin123/, backend);
  }
  // The check exactly as deploy.sh runs it: its pattern line, then its grep.
  const deploy = readFileSync(join(projects.go, "infra/deploy/deploy.sh"), "utf8");
  const assign = deploy.match(/^local_signin=.*admin123.*$/m)?.[0];
  assert.ok(assign && deploy.includes('grep -qiE "$local_signin" .env'), "deploy.sh checks .env for the local sign-in");
  writeFileSync(join(scratch, "check.sh"), `${assign}\ngrep -qiE "$local_signin" server.env\n`);
  const refuses = (line) => {
    writeFileSync(join(scratch, "server.env"), `APP_ENV=production\n${line}\n`);
    return spawnSync("bash", ["check.sh"], { cwd: scratch }).status === 0;
  };
  // admin@gmail.com: what older projects' env-local.mjs wrote.
  for (const line of ["USERS_BOOTSTRAP_EMAIL=admin@example.com", "USERS_BOOTSTRAP_PASSWORD=admin123",
    'RBAC_BOOTSTRAP_ADMIN_EMAIL="admin@example.com"', "USERS_BOOTSTRAP_PASSWORD=admin123\r",
    "USERS_BOOTSTRAP_PASSWORD='admin123'", "export USERS_BOOTSTRAP_PASSWORD=admin123",
    "USERS_BOOTSTRAP_PASSWORD = admin123 # local", "  USERS_BOOTSTRAP_EMAIL=Admin@Example.com",
    "USERS_BOOTSTRAP_EMAIL=admin@gmail.com", 'RBAC_BOOTSTRAP_ADMIN_EMAIL="admin@gmail.com"',
    "  USERS_BOOTSTRAP_EMAIL=Admin@Gmail.com"]) assert.ok(refuses(line), line);
  for (const line of ["USERS_BOOTSTRAP_EMAIL=owner@tokomaju.com", "USERS_BOOTSTRAP_PASSWORD=admin1234",
    "USERS_BOOTSTRAP_EMAIL=admin@example.co.id", "USERS_BOOTSTRAP_EMAIL=superadmin@example.com",
    "# USERS_BOOTSTRAP_EMAIL=admin@example.com", "# USERS_BOOTSTRAP_EMAIL=admin@gmail.com",
    "USERS_BOOTSTRAP_EMAIL="]) assert.ok(!refuses(line), line);
});

test("db-local --admin-password-empty never reuses what exists: the guard, with no database", async () => {
  const dbLocal = await import(pathToFileURL(join(projects.go, "scripts/db-local.mjs")).href);
  assert.deepEqual(dbLocal.existingTargets(""), [], "nothing there: go ahead");
  assert.deepEqual(dbLocal.existingTargets("db kasirapp_test\r\n"), ["kasirapp_test"]);
  assert.deepEqual(dbLocal.existingTargets("db kasirapp_db\ndb kasirapp_test\naccount kasirapp_dev\n"),
    ["kasirapp_db", "kasirapp_test", "'kasirapp_dev'@'127.0.0.1'"]);
  assert.deepEqual(dbLocal.existingTargets("db other_db\naccount someone\n"), [], "rows about anything else are ignored");
  // The query asks exactly about this app's two databases and its account.
  assert.match(dbLocal.existingSql(), /SCHEMA_NAME IN \('kasirapp_db', 'kasirapp_test'\)/);
  assert.match(dbLocal.existingSql(), /User = 'kasirapp_dev' AND Host = '127\.0\.0\.1'/);
  const message = dbLocal.existsMessage(["kasirapp_db"]);
  assert.match(message, /nothing was changed/);
  assert.equal(message.match(/^ {2}node scripts\/db-local\.mjs.*$/gm)?.join("|"), "  node scripts/db-local.mjs");
});

test("db-local --admin-password-empty: this machine only; a failed sign-in changes nothing and names one command", () => {
  const dir = projects.nestjs;
  const remote = node(["scripts/db-local.mjs", "--admin-password-empty", "--host", "db.example.com"], { cwd: dir });
  assert.equal(remote.status, 1);
  assert.match(remote.stderr, /this machine only/);
  // A "client" that cannot sign in: node rejects the option file argument, as mysql rejects root.
  const before = readFileSync(join(dir, ".env"), "utf8");
  const r = node(["scripts/db-local.mjs", "--admin-password-empty", "--mysql", process.execPath], { cwd: dir });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /nothing was changed/);
  assert.equal(r.stderr.match(/^ {2}node scripts\/db-local\.mjs.*$/gm)?.join("|"), "  node scripts/db-local.mjs");
  assert.equal(readFileSync(join(dir, ".env"), "utf8"), before);
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
