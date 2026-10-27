#!/usr/bin/env node
// Smoke test — locks the baseline: "the generated project must be alive".
//
// For every backend (go, nestjs, express), using a deliberately dirty project name
// ("Kasir App", exercising name sanitization):
//   1. Scaffold to a temp dir.
//   2. npm install — must exit 0.
//   3. Type-check: build:web, and build:api for Node stacks.
//      Go also: gofmt, a fixture module installed through the registry/sqlc markers, go vet,
//      go build, then the built binary is run directly (health, /readyz, JSON 404, the
//      fixture's route) — so the kernel is checked even where air is not installed.
//   4. Start dev:api, poll GET /api/v1/health, expect success:true, check GET /readyz, stop it.
//   5. Start dev:web, confirm Vite responds and the /api proxy reaches the API.
//   6. Clean up the temp dir.
//
// Steps that need a Go-only tool (air) are skipped — explicitly reported, never silently —
// when that tool isn't on PATH. A silent skip would read as a pass.
//
// Usage: node scripts/smoke-test.mjs

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SCAFFOLD = join(REPO_ROOT, "scripts", "scaffold.mjs");
// A repo-local scratch dir, not os.tmpdir(): on Windows, a home directory with a space
// (e.g. "C:\Users\Jane Doe") makes %TEMP% resolve through its 8.3 short-name alias, and
// some file watchers (chokidar under `nest start --watch`) crash on that short/long path
// mismatch ("Assertion failed: !_wcsnicmp(...)" in libuv's fs-event.c). The repo path has
// no such alias.
const SCRATCH_ROOT = join(REPO_ROOT, ".smoke-tmp");
mkdirSync(SCRATCH_ROOT, { recursive: true });
const DIRTY_NAME = "Kasir App";
const STACKS = ["go", "nestjs", "express"];

let failures = 0;
const skipped = [];

function log(msg) {
  process.stdout.write(msg + "\n");
}
function pass(msg) {
  log(`  ✓ ${msg}`);
}
function fail(msg) {
  log(`  ✗ ${msg}`);
  failures++;
}
function skip(msg) {
  log(`  ⚠ SKIPPED: ${msg}`);
  skipped.push(msg);
}

function commandExists(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(probe, [cmd], { stdio: "ignore", shell: true });
  return r.status === 0;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { shell: true, encoding: "utf8", ...opts });
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
  }
}

// Backstop for killTree: watchers like `air`/`nest start --watch` can fork a grandchild
// server process that escapes the process tree taskkill/-pid sees, leaking a listener
// across stacks. Kill whatever is actually bound to the port, by PID, not by tree.
function killPort(port) {
  if (process.platform === "win32") {
    const r = spawnSync("netstat", ["-ano"], { encoding: "utf8", shell: true });
    const pids = new Set();
    for (const line of (r.stdout || "").split(/\r?\n/)) {
      if (!line.includes(`:${port} `) || !line.includes("LISTENING")) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore", shell: true });
  } else {
    // -sTCP:LISTEN: only the server bound to the port. Without it lsof also lists clients —
    // including this very process right after it fetched the port — and kill -9 hits ourselves.
    const r = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8", shell: true });
    for (const pid of (r.stdout || "").split(/\s+/).filter(Boolean)) {
      spawnSync("kill", ["-9", pid], { stdio: "ignore", shell: true });
    }
  }
}

function readEnvVar(dir, key) {
  const p = join(dir, ".env");
  if (!existsSync(p)) return undefined;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2];
  }
  return undefined;
}

class ProcessExitedEarlyError extends Error {
  constructor(code) {
    super(`process exited early (code ${code}) before the health check ever succeeded`);
    this.code = code;
  }
}

async function pollHealth(port, timeoutMs = 25000, proc = null) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) throw new ProcessExitedEarlyError(proc.exitCode);
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/health`);
      const body = await res.json();
      if (body && body.success === true) return body;
      lastErr = new Error(`unexpected body: ${JSON.stringify(body)}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw lastErr ?? new Error("timed out");
}

async function pollUrlOk(url, timeoutMs = 20000, proc = null) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) throw new ProcessExitedEarlyError(proc.exitCode);
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw lastErr ?? new Error("timed out");
}

// GET /readyz must answer one of the allowed statuses with the API envelope.
async function checkReadyz(port, allowed, label) {
  try {
    const res = await fetch(`http://localhost:${port}/readyz`);
    const body = await res.json().catch(() => null);
    const envelopeOk = body && typeof body.success === "boolean" && body.success === (res.status === 200);
    if (allowed.includes(res.status) && envelopeOk) {
      pass(`${label} → GET /readyz → ${res.status} ${JSON.stringify(body)}`);
    } else {
      fail(`${label} GET /readyz answered ${res.status} ${JSON.stringify(body)} (allowed: ${allowed.join("/")} with envelope)`);
    }
  } catch (err) {
    fail(`${label} GET /readyz failed: ${err.message}`);
  }
}

// Installs a minimal module the way the module library will: its own folder, a contract, an
// sqlc block and a migration between the markers, and two lines in registry.go. Proves the
// registry, markers, timestamp migrations, and per-module sqlc fit together. Needs sqlc.
function installGoFixtureModule(dir) {
  if (!commandExists("sqlc")) {
    skip("go: fixture module — 'sqlc' not found on PATH");
    return false;
  }
  const api = join(dir, "apps/api");
  const goModule = readFileSync(join(api, "go.mod"), "utf8").match(/^module (\S+)/m)[1];
  const mod = join(api, "internal/modules/ping");
  const write = (rel, content) => {
    mkdirSync(dirname(join(mod, rel)), { recursive: true });
    writeFileSync(join(mod, rel), content);
  };
  write("contracts/ping_client.go", `package contracts

import "context"

// PingClient is the ping module's public contract.
type PingClient interface {
	Count(ctx context.Context) (int64, error)
}
`);
  write("infrastructure/queries/ping.sql", `-- name: CountPings :one
SELECT COUNT(*) FROM pings;
`);
  write("ping.module.go", `package ping

import (
	"context"
	"net/http"

	"${goModule}/internal/kernel"
	"${goModule}/internal/modules/ping/contracts"
	"${goModule}/internal/modules/ping/infrastructure/sqlc"
	"${goModule}/internal/shared/response"
)

type Module struct {
	q     *sqlc.Queries
	auth  kernel.Authenticator
	authz *kernel.AuthzSlot
}

func New(d *kernel.Deps) (*Module, error) {
	d.Authz.Declare(kernel.Permission{Name: "ping.admin", Module: "ping", Description: "Fixture permission"})
	return &Module{q: sqlc.New(d.DB), auth: d.Auth, authz: d.Authz}, nil
}

func (m *Module) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/ping", func(w http.ResponseWriter, r *http.Request) {
		response.OK(w, "pong", map[string]bool{"pong": true})
	})
	mux.Handle("GET /api/v1/ping/secure", m.auth.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response.OK(w, "secret", nil)
	})))
	mux.Handle("GET /api/v1/ping/admin", m.authz.Require("ping.admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response.OK(w, "admin", nil)
	})))
}

func (m *Module) Client() contracts.PingClient { return m }

func (m *Module) Count(ctx context.Context) (int64, error) { return m.q.CountPings(ctx) }
`);
  writeFileSync(join(api, "migrations/20990101000000_create_pings.up.sql"),
    "CREATE TABLE pings (\n  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n");
  writeFileSync(join(api, "migrations/20990101000000_create_pings.down.sql"), "DROP TABLE IF EXISTS pings;\n");

  const insertBefore = (rel, marker, text) => {
    const p = join(api, rel);
    const src = readFileSync(p, "utf8");
    if (!src.includes(marker)) throw new Error(`${rel} lost its marker ${marker}`);
    writeFileSync(p, src.replace(marker, text + marker));
  };
  try {
    insertBefore("internal/modules/registry.go", "\t// rudis:imports:end", `\t"${goModule}/internal/modules/ping"\n`);
    insertBefore("internal/modules/registry.go", "\t// rudis:modules:end", "\tpingModule, err := ping.New(d)\n\tif err != nil {\n\t\treturn err\n\t}\n\tpingModule.Routes(mux)\n");
    insertBefore("sqlc.yaml", "  # rudis:sqlc:end", `  - engine: "mysql"
    schema: "migrations"
    queries: "internal/modules/ping/infrastructure/queries"
    gen:
      go:
        package: "sqlc"
        out: "internal/modules/ping/infrastructure/sqlc"
`);
  } catch (err) {
    fail(`fixture module: ${err.message}`);
    return false;
  }
  const gen = run("npm", ["run", "sqlc:generate"], { cwd: dir });
  if (gen.status !== 0) {
    fail(`fixture module: sqlc:generate exited ${gen.status}\n${gen.stdout}${gen.stderr}`);
    return false;
  }
  pass("fixture module installed through the markers (registry.go, sqlc.yaml, migration) + sqlc:generate");
  return true;
}

// Runs the built binary directly — no air needed — and checks the kernel's endpoints.
// SMOKE_DB_DSN, when set to a reachable MySQL, makes /readyz expect 200 instead of 503.
async function checkGoBinary(dir, fixtureInstalled) {
  const port = "18090";
  killPort(port);
  // build:api writes dist/api; Windows only runs files with an executable extension.
  let bin = join(dir, "dist", "api");
  if (process.platform === "win32") {
    copyFileSync(bin, `${bin}.exe`);
    bin = `${bin}.exe`;
  }
  const env = { ...process.env, APP_PORT: port };
  if (process.env.SMOKE_DB_DSN) env.DB_DSN = process.env.SMOKE_DB_DSN;
  const proc = spawn(bin, [], {
    cwd: join(dir, "apps/api"), env, detached: process.platform !== "win32",
  });
  let output = "";
  proc.stdout?.on("data", (d) => { output += d; });
  proc.stderr?.on("data", (d) => { output += d; });
  try {
    await pollHealth(port, 15000, proc);
    pass("api binary → GET /api/v1/health → 200");
    await checkReadyz(port, process.env.SMOKE_DB_DSN ? [200] : [503], "api binary");
    const nf = await fetch(`http://localhost:${port}/api/v1/does-not-exist`);
    const nfBody = await nf.json().catch(() => null);
    if (nf.status === 404 && nfBody?.success === false) pass("api binary → unknown /api/ path → JSON 404");
    else fail(`unknown /api/ path answered ${nf.status} ${JSON.stringify(nfBody)}`);
    if (fixtureInstalled) {
      const ping = await fetch(`http://localhost:${port}/api/v1/ping`);
      const pingBody = await ping.json().catch(() => null);
      if (ping.status === 200 && pingBody?.data?.pong === true) pass("api binary → fixture module route mounted via registry");
      else fail(`fixture route answered ${ping.status} ${JSON.stringify(pingBody)}`);
      // No module provides auth here, so the kernel's slot must refuse a guarded route.
      const secure = await fetch(`http://localhost:${port}/api/v1/ping/secure`);
      const secureBody = await secure.json().catch(() => null);
      if (secure.status === 401 && secureBody?.success === false) pass("api binary → d.Auth.Require without a provider → 401");
      else fail(`guarded fixture route answered ${secure.status} ${JSON.stringify(secureBody)}`);
      const admin = await fetch(`http://localhost:${port}/api/v1/ping/admin`);
      if (admin.status === 401) pass("api binary → d.Authz.Require without a session → 401");
      else fail(`permission-guarded fixture route answered ${admin.status}`);
    }
    if (!process.env.SMOKE_DB_DSN) skip("go: /readyz → 200 — set SMOKE_DB_DSN to a reachable MySQL to check it");
  } catch (err) {
    fail(`api binary did not serve: ${err.message}\n${output.trim()}`);
  } finally {
    killTree(proc);
    killPort(port);
  }
}

async function testStack(stack) {
  log(`\n=== ${stack} (name: "${DIRTY_NAME}") ===`);
  const dir = mkdtempSync(join(SCRATCH_ROOT, `${stack}-`));
  let apiProc, webProc, apiHealthy = false;

  // Defensive: clear ports before use in case a prior run's watcher left a grandchild
  // server listening (see killPort's comment).
  killPort(5173);

  try {
    // 1. Scaffold (no shell — avoids word-splitting the dirty, space-containing name)
    const scaffoldResult = spawnSync(
      process.execPath,
      [SCAFFOLD, "--name", DIRTY_NAME, "--backend", stack, "--dir", dir, "--force"],
      { encoding: "utf8" }
    );
    if (scaffoldResult.status !== 0) {
      fail(`scaffold exited ${scaffoldResult.status}: ${scaffoldResult.stderr}`);
      return;
    }
    pass("scaffold");

    copyFileSync(join(dir, ".env.example"), join(dir, ".env"));

    // 2. npm install
    const install = run("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir });
    if (install.status !== 0) {
      fail(`npm install exited ${install.status}\n${install.stderr}`);
      return;
    }
    pass("npm install");

    // Go needs `go mod tidy` once after scaffolding to resolve go.sum (documented in
    // references/backend-go.md) — not part of npm install, run it explicitly here.
    let fixtureInstalled = false;
    if (stack === "go") {
      if (commandExists("go")) {
        const tidy = run("go", ["mod", "tidy"], { cwd: join(dir, "apps/api") });
        if (tidy.status !== 0) {
          fail(`go mod tidy exited ${tidy.status}\n${tidy.stderr}`);
        } else {
          pass("go mod tidy");
        }
        const fmt = run("gofmt", ["-l", "."], { cwd: join(dir, "apps/api") });
        if (fmt.stdout.trim()) fail(`kernel is not gofmt-clean:\n${fmt.stdout.trim()}`);
        else pass("gofmt: kernel is formatted");
        fixtureInstalled = installGoFixtureModule(dir);
        const vet = run("go", ["vet", "./..."], { cwd: join(dir, "apps/api") });
        if (vet.status !== 0) fail(`go vet exited ${vet.status}\n${vet.stderr}`);
        else pass(`go vet ./...${fixtureInstalled ? " (with fixture module)" : ""}`);
        // The kernel's tests; with SMOKE_DB_DSN also its MySQL ones (transactions, deadlock retry,
        // tasks, events, schedules) in throwaway databases.
        const env = process.env.SMOKE_DB_DSN ? { ...process.env, KERNEL_TEST_DSN: process.env.SMOKE_DB_DSN } : process.env;
        const test = run("go", ["test", "./..."], { cwd: join(dir, "apps/api"), env });
        if (test.status !== 0) fail(`go test exited ${test.status}\n${test.stdout}${test.stderr}`);
        else pass(`go test ./...${process.env.SMOKE_DB_DSN ? " (kernel MySQL tests included)" : ""}`);
        if (!process.env.SMOKE_DB_DSN) skip("go: kernel MySQL tests — set SMOKE_DB_DSN to a reachable MySQL to run them");
      } else {
        skip(`${stack}: go mod tidy / vet — 'go' not found on PATH`);
      }
    }

    // 3. Type-check
    const buildWeb = run("npm", ["run", "build:web"], { cwd: dir });
    if (buildWeb.status !== 0) {
      fail(`npm run build:web exited ${buildWeb.status}\n${buildWeb.stderr}`);
    } else {
      pass("build:web (tsc --noEmit + vite build)");
    }

    if (stack !== "go") {
      const buildApi = run("npm", ["run", "build:api"], { cwd: dir });
      if (buildApi.status !== 0) {
        fail(`npm run build:api exited ${buildApi.status}\n${buildApi.stderr}`);
      } else {
        pass("build:api");
      }
    } else if (commandExists("go")) {
      const buildApi = run("npm", ["run", "build:api"], { cwd: dir });
      if (buildApi.status !== 0) {
        fail(`npm run build:api exited ${buildApi.status}\n${buildApi.stderr}`);
      } else {
        pass("build:api (go build)");
        await checkGoBinary(dir, fixtureInstalled);
      }
    } else {
      skip(`${stack}: build:api — 'go' not found on PATH`);
    }

    // 4. dev:api
    if (stack === "go" && !commandExists("air")) {
      skip(`${stack}: dev:api — 'air' not found on PATH`);
    } else {
      const port = readEnvVar(dir, "APP_PORT") ?? "8080";
      killPort(port);
      apiProc = spawn("npm", ["run", "dev:api"], { cwd: dir, shell: true, detached: process.platform !== "win32" });
      let apiOutput = "";
      apiProc.stdout?.on("data", (d) => { apiOutput += d; });
      apiProc.stderr?.on("data", (d) => { apiOutput += d; });
      try {
        const body = await pollHealth(port, 25000, apiProc);
        if (body.success === true) { apiHealthy = true; pass(`dev:api → GET /api/v1/health → ${JSON.stringify(body)}`); }
        // /readyz is the probe the image HEALTHCHECK and deploy.sh wait on (deploy server).
        // Go pings the database, so without one it must answer 503 — still as an envelope.
        await checkReadyz(port, stack === "go" ? [200, 503] : [200], "dev:api");
      } catch (err) {
        if (stack === "go" && err instanceof ProcessExitedEarlyError) {
          // A FAILURE, not a skip. This branch used to be reported as "probably an AV/execution
          // policy" — and that hid a real scaffolder bug: .air.toml built tmp/main without
          // .exe, which Windows cannot run, so dev:api always exited. If an execution policy
          // truly blocks air, that still means dev:api does not work on this machine.
          fail(`${stack}: dev:api — 'air' exited immediately (code ${err.code}). Check .air.toml cmd/bin (they must build and run tmp/main.exe) before blaming an execution/AV policy:\n${apiOutput.trim()}`);
        } else {
          fail(`dev:api health check failed: ${err.message}\n${apiOutput.trim()}`);
        }
      }
    }

    // 5. dev:web (+ proxy)
    killPort(5173);
    webProc = spawn("npm", ["run", "dev:web"], { cwd: dir, shell: true, detached: process.platform !== "win32" });
    let webOutput = "";
    webProc.stdout?.on("data", (d) => { webOutput += d; });
    webProc.stderr?.on("data", (d) => { webOutput += d; });
    try {
      await pollUrlOk("http://localhost:5173/", 20000, webProc);
      pass("dev:web → Vite responds on :5173");
    } catch (err) {
      fail(`dev:web did not come up: ${err.message}\n${webOutput.trim()}`);
    }
    if (apiHealthy) {
      try {
        const body = await pollHealth(5173, 15000, webProc);
        if (body.success === true) pass(`dev:web proxy → /api/v1/health → ${JSON.stringify(body)}`);
      } catch (err) {
        fail(`Vite proxy to /api did not work: ${err.message}`);
      }
    } else {
      skip(`${stack}: proxy check — dev:api never came up healthy`);
    }
  } finally {
    killTree(apiProc);
    killTree(webProc);
    killPort(readEnvVar(dir, "APP_PORT") ?? "8080");
    killPort(5173);
    // On Windows, a just-killed child can hold file locks for a moment after taskkill
    // returns — retry cleanup instead of crashing the whole run over a stale handle.
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        rmSync(dir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (attempt === 5) {
          log(`  (warning: could not remove temp dir ${dir}: ${err.message})`);
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

for (const stack of STACKS) {
  await testStack(stack);
}

log("\n=== Summary ===");
if (skipped.length) {
  log(`Skipped (${skipped.length}):`);
  for (const s of skipped) log(`  - ${s}`);
}
if (failures > 0) {
  log(`FAILED: ${failures} check(s) did not pass.`);
  process.exit(1);
}
log("All smoke checks passed.");
process.exit(0);
