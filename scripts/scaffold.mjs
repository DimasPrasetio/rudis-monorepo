#!/usr/bin/env node
// Rudis Monorepo Standard — scaffolder
// Zero dependencies. Generates the standard-compliant skeleton (tree, config,
// knowledge gateway, .claude/rules, docs, frontend base, backend base per stack).
// Claude fills in project-specific code, modules, and knowledge/ content afterward.
//
// Usage:
//   node scripts/scaffold.mjs --name my-app --backend go --dir ./my-app
//
// Options:
//   --name <name>        project name (required)
//   --backend <stack>    go | nestjs | express (required)
//   --dir <path>         target directory (default: ./<name>)
//   --force              write into a non-empty directory
//   --help               show this help

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// Files that are code rather than per-project text (the Go kernel, the shadcn primitives)
// live as real files under scripts/templates/ and are copied with placeholder substitution.
const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "templates");

const BACKENDS = new Set(["go", "nestjs", "express"]);

function parseArgs(argv) {
  const out = { force: false };
  const takeValue = (flag, i) => {
    const v = argv[i];
    if (v === undefined || v.startsWith("--")) {
      console.error(`${flag} requires a value`);
      out.bad = true;
      return undefined;
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--force") out.force = true;
    else if (a === "--name") out.name = takeValue(a, ++i);
    else if (a === "--backend") out.backend = takeValue(a, ++i);
    else if (a === "--dir") out.dir = takeValue(a, ++i);
    else if (a === "--slug") out.slug = takeValue(a, ++i);
    else if (a === "--port") out.port = takeValue(a, ++i);
    else if (a === "--ghcr-owner") out.ghcrOwner = takeValue(a, ++i);
    else if (a === "--repo") out.repo = takeValue(a, ++i);
    else if (a === "--domain") out.domain = takeValue(a, ++i);
    else if (a === "--ssh-host") out.sshHost = takeValue(a, ++i);
    else if (a === "--playbook") out.playbook = takeValue(a, ++i);
    else if (a === "--target") out.target = takeValue(a, ++i);
    else {
      console.error(`Unknown argument: ${a}`);
      out.bad = true;
    }
  }
  return out;
}

const HELP = `Rudis Monorepo Standard — scaffolder

Usage:
  node scripts/scaffold.mjs --name <name> --backend <go|nestjs|express> [--dir <path>] [--force]
    [--slug <app>] [--port <n>] [--ghcr-owner <owner>] [--repo <repo>] [--domain <domain>]
    [--ssh-host <alias>] [--playbook <path>] [--target <name>]

Options:
  --name <name>          project name (required)
  --backend <stack>      go | nestjs | express (required)
  --dir <path>           target directory (default: ./<name>)
  --force                write into a non-empty directory
  --help                 show this help

Deploy target: any Docker host following references/docker-deployment.md — no server is built
in. Omitted values are written as __PLACEHOLDER__ markers that infra/deploy/deploy.sh refuses
to run with.
  --slug <app>           server app name: ~/<app>, <app>-app, <app>_db, <app>_user
                         (default: --name lowercased, letters/digits only)
  --port <n>             unique 127.0.0.1 port on the server — from its app registry if it
                         keeps one, confirmed with \`ssh <ssh-host> 'sudo ss -tlnp'\`
  --ghcr-owner <owner>   GitHub owner of the repo; image = ghcr.io/<owner>/<repo>
  --repo <repo>          GitHub repo name (default: npm-safe --name)
  --domain <domain>      public domain for the host nginx site (default: <domain>)
  --ssh-host <alias>     SSH host alias of the server (~/.ssh/config); docs only
  --playbook <path>      the server's own playbook / app registry, if it keeps one; docs only
  --target <name>        label of the deploy target (default: deploy server); docs only
`;

const args = parseArgs(process.argv.slice(2));
if (args.help) { process.stdout.write(HELP); process.exit(0); }
if (args.bad) { process.stderr.write("\n" + HELP); process.exit(1); }

const errors = [];
if (!args.name) errors.push("--name is required");
if (!args.backend) errors.push("--backend is required");
else if (!BACKENDS.has(args.backend)) errors.push(`--backend must be one of: ${[...BACKENDS].join(", ")}`);
// Deploy identity (deploy server). The slug feeds MySQL names: <slug>_user must fit
// MySQL's 32-char user limit, and folder/container/database names must stay predictable.
const slug = args.slug ?? (args.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
if (args.name && !/^[a-z][a-z0-9]{1,23}$/.test(slug)) {
  errors.push(`--slug must be 2-24 chars, lowercase letters/digits, starting with a letter (got ${JSON.stringify(slug)})`);
}
if (args.port !== undefined && !(/^\d+$/.test(args.port) && +args.port >= 1024 && +args.port <= 65535)) {
  errors.push(`--port must be a number between 1024 and 65535 (got ${JSON.stringify(args.port)})`);
}
if (args.ghcrOwner !== undefined && !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(args.ghcrOwner)) {
  errors.push(`--ghcr-owner must be a GitHub user/org name (got ${JSON.stringify(args.ghcrOwner)})`);
}
if (errors.length) {
  process.stderr.write("Error:\n  - " + errors.join("\n  - ") + "\n\n" + HELP);
  process.exit(1);
}

const name = args.name;
const backend = args.backend;
const rawDir = args.dir || `./${name}`;
// ~ isn't expanded by the OS for a literal argument string (only an interactive shell does
// that, and PowerShell doesn't even do that), so expand it ourselves for convenience.
const expandedDir = rawDir === "~" || rawDir.startsWith("~/") || rawDir.startsWith("~\\")
  ? join(homedir(), rawDir.slice(1))
  : rawDir;
const targetDir = resolve(expandedDir);

if (existsSync(targetDir)) {
  if (!statSync(targetDir).isDirectory()) {
    process.stderr.write(`Error: --dir points to an existing file, not a directory: ${targetDir}\n`);
    process.exit(1);
  }
  if (readdirSync(targetDir).length > 0 && !args.force) {
    process.stderr.write(`Error: target directory is not empty: ${targetDir}\nUse --force to write anyway.\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------
const files = {};   // relativePath -> content
const keepDirs = []; // directories to create with a .gitkeep
const file = (p, content) => { files[p] = content; };
const keep = (...dirs) => keepDirs.push(...dirs);
const template = (src, dest, vars = {}) => {
  let content = readFileSync(join(TEMPLATES, src), "utf8");
  for (const [k, v] of Object.entries(vars)) content = content.replaceAll(k, v);
  file(dest, content);
};

const goModule = name.replace(/[^a-zA-Z0-9._/-]/g, "-").toLowerCase();
// npm package names have their own rules: lowercase, no spaces.
const npmName = name
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, "-")
  .replace(/^[-_.]+|[-_.]+$/g, "") || "app";
const isNodeBackend = backend === "nestjs" || backend === "express";
// Go starts with no domain modules: each is built or installed from the module library
// through internal/modules/registry.go. The Node stacks keep placeholder module folders.
const starterApiModules = backend === "go" ? [] : ["auth", "users", "order"];

// Values missing at scaffold time become loud markers rather than guesses: a wrong port
// collides with another app on the shared server, a wrong owner pulls the wrong image.
const hostPort = args.port ?? "__HOST_PORT__";
const ghcrOwner = args.ghcrOwner ? args.ghcrOwner.toLowerCase() : "__GHCR_OWNER__";
const repoName = (args.repo ?? npmName).toLowerCase();
const image = `ghcr.io/${ghcrOwner}/${repoName}`;
const domain = args.domain ?? "<domain>";
// How the project's docs reach the server. Written into knowledge/DEPLOYMENT.md and the
// release summary only — deploy.sh runs on the server itself and needs none of them.
const sshHost = args.sshHost ?? "__SSH_HOST__";
const playbook = args.playbook ?? null;
const targetLabel = args.target ?? "deploy server";
const missingDeploy = [
  !args.port && "--port",
  !args.ghcrOwner && "--ghcr-owner",
  !args.domain && "--domain",
  !args.sshHost && "--ssh-host",
].filter(Boolean);
const workspaces = isNodeBackend
  ? ["apps/web", "apps/api", "packages/*"]
  : ["apps/web", "packages/*"];

// ---------------------------------------------------------------------------
// Root files
// ---------------------------------------------------------------------------
const rootScripts = {
  go: {
    "dev:web": "npm run dev -w apps/web",
    "dev:api": "cd apps/api && air",
    "build:web": "npm run build -w apps/web",
    "build:api": "cd apps/api && go build -o ../../dist/api ./cmd/server",
    "migrate:up": "node scripts/migrate.mjs up",
    "migrate:down": "node scripts/migrate.mjs down 1",
    "migrate:create": "cd apps/api && migrate create -ext sql -dir migrations",
    "sqlc:generate": "node scripts/sqlc.mjs",
  },
  nestjs: {
    "dev:web": "npm run dev -w apps/web",
    "dev:api": "npm run start:dev -w apps/api",
    "build:web": "npm run build -w apps/web",
    "build:api": "npm run build -w apps/api",
    "migrate:up": "npm run prisma:migrate -w apps/api",
    "migrate:deploy": "npm run prisma:deploy -w apps/api",
    "migrate:reset": "npm run prisma:reset -w apps/api",
  },
  express: {
    "dev:web": "npm run dev -w apps/web",
    "dev:api": "npm run dev -w apps/api",
    "build:web": "npm run build -w apps/web",
    "build:api": "npm run build -w apps/api",
  },
}[backend];

file("package.json", JSON.stringify({
  name: npmName,
  private: true,
  version: "0.1.0",
  description: `${name} — monorepo (Rudis standard)`,
  workspaces,
  scripts: rootScripts,
}, null, 2) + "\n");

file(".gitignore", `node_modules/
dist/
build/
tmp/
.env
*.local
.DS_Store
coverage/
# Go
/dist/api
apps/api/tmp/
apps/api/data/
# Prisma
apps/api/prisma/*.db
# RUDIS SDD — run output, never committed (.claude/rules/monorepo.md)
docs/trace-reports/
docs/test-reports/
.rudis/audit.log
.rudis/audit/
.rudis/.current-feature
`);

// LF everywhere: a Windows checkout with core.autocrlf would otherwise make every file look
// changed to the module library's hashes and 3-way merges.
file(".gitattributes", `* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.woff2 binary
`);

file(".dockerignore", `node_modules
**/node_modules
dist
build
tmp
.git
.github
.claude
knowledge
analysis
infra/deploy
.env
.env.*
*.md
# Shipped inside the image so deploy.sh can check the server's .env before migrating.
!infra/deploy/.env.production.example
`);

const dbName = `${slug}_db`;

const dbUrlLine = backend === "go"
  ? `# Go DSN (database/sql + MySQL driver) — no scheme prefix\nDB_DSN=root:@tcp(localhost:3306)/${dbName}`
  : `# Prisma URI\nDATABASE_URL=mysql://root:password@localhost:3306/${dbName}`;

file(".env.example", `APP_ENV=development
APP_PORT=8080
APP_NAME=${name}
${backend === "go" ? "# Where business dates and calendar schedules are counted (IANA name).\nAPP_TIMEZONE=Asia/Jakarta\n" : ""}
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=${dbName}
${dbUrlLine}

JWT_SECRET=change-me
JWT_EXPIRES_IN=24h

# Production build directory of the frontend, served by the container.
# Left empty in dev — the frontend is served by Vite instead.
PUBLIC_DIR=

# Left empty so the frontend uses the same origin (see the Vite proxy in vite.config.ts).
# Only set this when web and api are actually deployed separately.
VITE_API_BASE_URL=
`);

file("docker-compose.yml", `# LOCAL ONLY — builds from source for a quick check on your own machine.
# Production never builds: see infra/deploy/docker-compose.prod.yml (image-only).
services:
  app:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile
    ports:
      - "8080:8080"
    # Copy .env.example to .env before running compose.
    env_file:
      - .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
`);

file("README.md", `# ${name}

Monorepo generated to the Rudis standard (modular-monolith backend + React 19 frontend).

## Development

Run frontend and backend separately from the project root:

\`\`\`bash
npm run dev:web
npm run dev:api
\`\`\`

## Structure

- \`apps/web\` — React 19 + Tailwind 4 frontend
- \`apps/api\` — ${backend} modular-monolith backend
- \`packages/\` — shared code and API contract
- \`knowledge/\` — the project's one knowledge base; read the relevant file before editing,
  starting at \`knowledge/INDEX.md\`
- \`.claude/rules/\` — path-scoped technical rules
- \`analysis/\` — per-requirement analysis artifacts (see \`analysis/README.md\`)
- \`specs/\`, \`.rudis/\` — RUDIS SDD specs and tooling, once a custom module is specified with it
  (see \`.claude/rules/monorepo.md\`)
- \`infra/\` — Docker image, host nginx site, and the server deploy files
- \`.github/workflows/\` — \`ci\` (checks) and \`release-image\` (builds the image to GHCR)

## Deployment

One image, one container on the deploy server: built in CI, pulled by the server, database on
the host — see \`knowledge/DEPLOYMENT.md\`.
`);

// ---------------------------------------------------------------------------
// CLAUDE.md gateway
// ---------------------------------------------------------------------------
file("CLAUDE.md", `# ${name} — Claude Code Gateway

Project: ${name}. Backend: ${backend} (modular monolith). Frontend: React 19 + Tailwind 4.

## Commands (run from root)

\`\`\`bash
npm run dev:web   # start frontend
npm run dev:api   # start backend
\`\`\`

## Critical architecture rules

These few invariants are restated here on purpose: this file is always loaded and
\`.claude/rules/\` is not. \`.claude/rules/\` holds the authoritative, path-scoped version — if
the two ever disagree, the rules file wins and the drift is a finding to report.

- Backend is a **modular monolith**. A module never imports another module — not even its
  \`contracts/\`. It declares what it needs as ports in its own \`ports/\`; modules are connected
  only in the composition root. No cross-module DB joins or foreign keys.
- Cross-module relations are stored as primitive IDs and resolved through the module's ports.
- Frontend uses the \`@/*\` alias, lazy routes, Zustand, Zod, Axios. UI is built from shadcn/ui
  primitives and semantic theme tokens — never raw colors.
- A module is wired in only through its registry, between the \`rudis:*\` markers.
- Deploy = one image, one container on the deploy server, built in CI and only pulled by the
  server; the database is the host's shared MySQL. Rules: \`.claude/rules/deployment.md\`.

## Before changing code

Read the relevant file in \`knowledge/\` first (start at \`knowledge/INDEX.md\`), and follow
the path-scoped rules in \`.claude/rules/\`. Beyond the invariants above, do not copy their
content into this file — route to it. This is a gateway, not a documentation dump.

If two sources of truth disagree, follow \`knowledge/SOURCE_PRIORITY.md\` — and report the
conflict, don't silently pick one.
`);

// ---------------------------------------------------------------------------
// knowledge/ — the project's single knowledge rack (docs/ no longer exists;
// every fact has exactly one home, and knowledge/SOURCE_PRIORITY.md resolves conflicts).
// ---------------------------------------------------------------------------
const kStub = (title, purpose) => `# ${title}\n\n> ${purpose}\n\n_TODO: fill in for ${name}._\n`;
// Four knowledge files pair 1:1 by topic with a file in .claude/rules/. That pairing is the
// standard's biggest redundancy risk once the TODOs get filled, so each such stub carries an
// explicit delta-only instruction naming the rule that stays authoritative.
const kDelta = (title, purpose, rule) =>
  `# ${title}\n\n> ${purpose}\n\n_TODO: fill in for ${name}._\n\nProject-specific detail only — the standing rule lives in\n\`.claude/rules/${rule}\` and stays authoritative. Do not restate it here.\n`;
file("knowledge/INDEX.md", `# Knowledge Index — ${name}

Routing only. Open the file that matches your task before editing code — each file states its
own scope in its header, so the labels below stay short on purpose.

- [SOURCE_PRIORITY.md](SOURCE_PRIORITY.md) — conflict resolution
- [PROJECT.md](PROJECT.md) — brief, scope, user stories
- [ARCHITECTURE.md](ARCHITECTURE.md) — apps, modules, data flow
- [MODULE_MAP.md](MODULE_MAP.md) — per-module responsibility & contract
- [GLOSSARY.md](GLOSSARY.md) — terminology
- [API.md](API.md) — endpoints
- [DATABASE.md](DATABASE.md) — schema & table ownership
- [FRONTEND.md](FRONTEND.md) — frontend conventions
- [DESIGN.md](DESIGN.md) — design brief: researched UI direction & sources
- [BACKEND.md](BACKEND.md) — backend conventions
- [DEPLOYMENT.md](DEPLOYMENT.md) — run, build, deploy, env
- [decisions/](decisions/) — ADRs
`);
file("knowledge/SOURCE_PRIORITY.md", `# Source Priority

When two sources disagree, the higher one wins — but never resolve a real conflict silently.
Raise it as a finding instead.

1. \`knowledge/decisions/ADR-*\` — ratified decisions
2. This monorepo standard + \`.claude/rules/\`
3. Code, config, active migrations
4. \`knowledge/*\`
5. RUDIS SDD records — \`specs/\` and the other RUDIS output \`.claude/rules/monorepo.md\` names
6. AI observations & hypotheses

Code shows what **actually happens**, not what **should**.
If (3) and (4) disagree, that's a conflict to report — not a choice to make on your own.
A spec under \`specs/\` is a task's plan of change. While that task runs, where it differs from
code and \`knowledge/\` is the planned change, not a conflict. Once merged it is a frozen record,
and the owner wins.
`);
file("knowledge/PROJECT.md", kStub("Project Brief", "What this project is and why it exists; features, scope, and user stories."));
file("knowledge/ARCHITECTURE.md", kStub("Architecture", "Apps, modules, data flow, and boundaries."));
file("knowledge/MODULE_MAP.md", `# Module Map

> Each module's responsibility, public contract, owned tables, and external integrations.

| Module | Responsibility | Public contract | Owned tables | External integrations |
|---|---|---|---|---|
${starterApiModules.length
  ? starterApiModules.map((m) => `| ${m} | _TODO_ | _TODO_ | _TODO_ | _TODO_ |`).join("\n")
  : "| _none yet_ | | | | |"}

_TODO: fill in for ${name}. Fill all five columns — "Owned tables" and "External integrations"
are what let a later analysis catch a cross-module join, or a secondary integration a
requirement implies but never states._

"Owned tables" is a **name-only index**; \`DATABASE.md\` stays authoritative for schema detail.
Keep the two in sync — if they disagree, report the conflict, don't pick one.
`);
file("knowledge/GLOSSARY.md", kStub("Glossary", "Shared terminology used across the project."));
file("knowledge/API.md", kDelta("API", "Endpoints this project exposes.", "api-standard.md"));
file("knowledge/DATABASE.md", kDelta("Database", "Tables, fields, and which module owns each.", "database.md"));
file("knowledge/DESIGN.md", `# Design Brief — ${name}

> What the UI of this project should look like and why — the result of researching how this
> kind of app is ideally and commonly designed today. Read it before building or reshaping a
> screen. This file owns the design direction; other files point here instead of restating it.

Status: NOT RESEARCHED YET — research before the first UI work (\`.claude/rules/frontend-react.md\`).
Research date: _TODO (YYYY-MM-DD)_
App type & users: _TODO — e.g. "POS for cashiers on a counter tablet", "multi-branch back office"_
Primary device: _TODO_ · Locale: id-ID (Rupiah, Indonesian dates and copy) unless stated otherwise

## Findings — how this kind of app is ideally and commonly designed
_TODO: navigation model, key screens and their layout patterns, data density, interaction
patterns users already expect, where the market leaders converge and where they differ._

## Design direction for this project
- Layout & navigation: _TODO_
- Key screens (purpose → pattern): _TODO_
- Components that matter most: _TODO_
- Preset: _none_ — or the module-library theme preset this direction starts from (e.g.
  \`bingkai-navy\` for back-office apps); then record only the deviations from it below
- Visual direction (type, color, density, tone): _TODO_ — the values live in \`apps/web/src/theme/theme.css\`
- Devices & breakpoints (primary first): _TODO_
- Accessibility target: WCAG 2.2 AA

## Anti-patterns to avoid
_TODO_

## Sources
_TODO: one line each — title, URL, type (real product / design system / UX research / gallery), date accessed._
`);
file("knowledge/FRONTEND.md", kDelta("Frontend", "Frontend structure and screens specific to this project.", "frontend-react.md"));
file("knowledge/BACKEND.md", kDelta("Backend", "Backend structure and modules specific to this project.", "backend-modular-monolith.md"));
file("knowledge/DEPLOYMENT.md", `# Deployment — ${name}

Owns this project's concrete deploy facts and procedure. The rules every deploy file must keep
are in \`.claude/rules/deployment.md\`. The server is reached as \`ssh ${sshHost}\`. ${playbook
  ? `Its own convention is \`${playbook}\` on the server — re-read it before any server change, it is
updated as apps are added.`
  : `It keeps no playbook of its own: this file and the skill's deploy reference are the convention.`}
The target is configuration, never guessed: if a value here is still a \`__PLACEHOLDER__\`,
ask the owner (the skill's SKILL.md › Step 0b).

## Local
The dev commands live in \`CLAUDE.md\` (agents) and \`README.md\` (humans) — not repeated here.

\`docker compose up --build\` (root \`docker-compose.yml\`) builds the image from source on
your own machine for a quick check — never on the server. Set the DB env in \`.env\` first.

## Target: ${targetLabel}

| Fact | Value |
|---|---|
| SSH host | \`${sshHost}\` (alias in \`~/.ssh/config\` on the machine that deploys) |
| Server playbook | ${playbook ? `\`${playbook}\`` : "none"} |
| App name (slug) | \`${slug}\` |
| Server folder | \`~/${slug}\` (\`docker-compose.prod.yml\`, \`deploy.sh\`, \`.env\`, \`backups/\`) |
| Container | \`${slug}-app\` |
| Port | \`127.0.0.1:${hostPort}\` on the host → \`8080\` in the container |
| Database / user | \`${dbName}\` / \`${slug}_user@'172.%'\` (\`mysql_native_password\`) |
| Image | \`${image}:<git-sha>\` (\`:latest\` is also pushed but never deployed) |
| Domain | \`${domain}\` |

One image serves the static frontend and the API on port 8080. The container reaches the
host MySQL via \`host.docker.internal\` (\`extra_hosts: host-gateway\`). Users are created
with \`mysql_native_password\` because the app connects over the internal docker bridge
without TLS, which MySQL 8's default \`caching_sha2_password\` rejects (ERROR 2061).

## Release flow

merge to \`main\` → \`ci\` green → \`release-image\` pushes \`${image}:<git-sha>\` →
on the server: \`cd ~/${slug} && ./deploy.sh <git-sha>\`
(preflight → pull → check \`.env\` has every setting the image lists → dump the database to
\`backups/pre-deploy.sql.gz\` → migrate → up → wait for \`/readyz\`). Nothing changes before
the \`.env\` check passes.

**Rollback** = \`./deploy.sh <older-git-sha>\`. The schema stays where it is (migrations are
forward-only): ${backend === "go" ? "deploy.sh sees the database is newer than that image and skips migrate" : "run it with \`SKIP_MIGRATE=1\` when rolling back past a schema change"}, and the
older version runs on the newer schema — which works only because every release follows
expand/contract (\`.claude/rules/database.md\`).

## Backups and restore

- **Nightly, rotated** — the server's backup job (installed once per server, not per app;
  the skill's \`scripts/server/\`): \`/var/backups/rudis/${dbName}/{daily,weekly,monthly}/\`,
  5 daily, 2 weekly, 1 monthly, test-restored on the 1st, failures reported to Telegram.
- **Before each migration** — \`~/${slug}/backups/pre-deploy.sql.gz\`, replaced every deploy.

**Restore** (lost or damaged data):
1. \`docker compose -f docker-compose.prod.yml stop app\`
2. Pick the dump: \`sudo ls -lt /var/backups/rudis/${dbName}/*/\` or \`backups/pre-deploy.sql.gz\`.
3. Check it in a scratch database first:
   \`sudo mysql -e 'CREATE DATABASE ${dbName}_check'\` · \`gunzip -c <dump> | sudo mysql ${dbName}_check\` ·
   look at the data · \`sudo mysql -e 'DROP DATABASE ${dbName}_check'\`
4. Replace: \`sudo mysql -e 'DROP DATABASE ${dbName}; CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'\`,
   then \`gunzip -c <dump> | sudo mysql ${dbName}\` (the user's grants on \`${dbName}.*\` survive the drop).
5. \`./deploy.sh <git-sha>\` with the version to run — it migrates the restored schema forward if needed.

## A migration failed

deploy.sh stops before the new version starts; the next deploy refuses while the database is
marked *dirty*. MySQL commits each DDL statement at once, so a file that failed half-way is
partly applied — that is why one migration file holds one schema change.
1. Read the error in the deploy output. \`docker compose -f docker-compose.prod.yml --profile ops run --rm migrate version\`
   shows \`<version> (dirty)\`.
2. Safe path: restore \`backups/pre-deploy.sql.gz\` (Restore, steps 1–4). Only if the failed
   statement left nothing behind: \`… run --rm migrate force <previous-version>\`.
3. Fix it in a **new** migration (never edit one that ran anywhere), release, deploy.

## First-time server setup (once)

Every step below changes the shared server — do it only with the owner's go-ahead.

1. **Port** — take the next free port from the server's app registry (if it keeps one) and
   confirm it with \`ssh ${sshHost} 'sudo ss -tlnp'\`.
2. **Database + dedicated user** on the host MySQL (password: \`openssl rand -hex 24\`):
   \`\`\`sql
   CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER '${slug}_user'@'172.%' IDENTIFIED WITH mysql_native_password BY '<random-hex>';
   GRANT ALL PRIVILEGES ON ${dbName}.* TO '${slug}_user'@'172.%';
   FLUSH PRIVILEGES;
   \`\`\`
3. **Server folder** — \`mkdir -p ~/${slug}\`; copy \`infra/deploy/docker-compose.prod.yml\`
   and \`infra/deploy/deploy.sh\` into it, and \`infra/deploy/.env.production.example\`
   as \`.env\`; fill in real values; \`chmod 600 .env\`.
4. **Registry access** — new GHCR packages are private: either \`docker login ghcr.io\` on the
   server with a read-only (\`read:packages\`) token, or set the package to Public.
5. **First deploy** (database still empty): \`SKIP_BACKUP=1 ./deploy.sh <git-sha>\`.
6. **nginx + TLS** — copy \`infra/nginx/nginx.conf\` to \`/etc/nginx/sites-available/${slug}\`,
   \`sudo ln -s /etc/nginx/sites-available/${slug} /etc/nginx/sites-enabled/\`,
   \`sudo nginx -t && sudo systemctl reload nginx\`, then \`sudo certbot --nginx -d ${domain}\`
   (point the domain's DNS A record at the server first).
7. **Registry entry** — if the server keeps an app registry, add this app's row to it.
8. **Backups** — if this server has no \`rudis-backup.timer\` yet
   (\`systemctl list-timers | grep rudis-backup\`), install it once
   (references/docker-deployment.md › Backups in the skill). The new database is included from
   its first night.
`);
file("knowledge/decisions/ADR-0001-monorepo-structure.md", `# ADR-0001: Monorepo structure

## Status
Accepted

## Context
${name} uses a single repository for the frontend (\`apps/web\`) and backend (\`apps/api\`)
plus shared packages.

## Decision
Adopt the Rudis monorepo standard: apps/, packages/, knowledge/, .claude/rules/, analysis/, infra/.
\`knowledge/\` is the single knowledge rack — there is no separate \`docs/\` for stakeholders.
RUDIS SDD output, used to specify custom modules, stays where RUDIS writes it and is never a
second knowledge rack.
Enforced while editing by \`.claude/rules/monorepo.md\`.

## Consequences
Consistent structure and one home per fact. The cost is discipline: a new document has to
claim an existing owner's job or justify a new one, rather than being added alongside.
`);
file("knowledge/decisions/ADR-0002-modular-monolith.md", `# ADR-0002: Modular monolith backend

## Status
Accepted

## Context
We want clean module boundaries without the operational cost of microservices.

## Decision
Backend is a modular monolith whose modules never import each other: each declares what it
needs as ports and offers contracts, connected only in the composition root. The enforceable form of
this decision — what exactly is forbidden — is authoritative in
\`.claude/rules/backend-modular-monolith.md\`; this ADR records only why it was chosen.

## Consequences
Modules stay decoupled and could be extracted later if ever needed. The price paid on purpose:
cross-module reads go through a client instead of a join, so some reads cost an extra hop.
`);
file("knowledge/decisions/ADR-0003-frontend-standard.md", `# ADR-0003: Frontend standard

## Status
Accepted

## Context
We want a consistent, simple frontend stack.

## Decision
Adopt the standard React 19 + Tailwind 4 stack. The stack list and its conventions are
authoritative in \`.claude/rules/frontend-react.md\`; this ADR records only why it was chosen:
one obvious way to do routing, state, validation, and HTTP, with nothing added speculatively.

## Consequences
Predictable structure and simple data patterns. No server-cache layer (e.g. TanStack Query)
until a real need proves one — revisit this ADR rather than adding it silently.
`);

file("knowledge/decisions/ADR-0004-deploy-image-from-ci.md", `# ADR-0004: Deploy — image from CI, server only pulls

## Status
Accepted

## Context
${name} runs on a shared Docker host beside other apps. The host is small and
follows one fixed convention for every app, so any of them can be deployed, debugged, or rolled
back the same way.

## Decision
Follow that convention as-is: one image and one container for the whole monorepo, built in CI
and pushed to GHCR, pulled and run by the server, on the host's shared MySQL. The enforceable
form is authoritative in \`.claude/rules/deployment.md\`; this project's concrete server facts
and procedure live in \`knowledge/DEPLOYMENT.md\`. This ADR records only why.

## Consequences
Builds never compete with running apps for the server's memory, and every release is an
immutable image that can be redeployed to roll back. The price paid on purpose: a release needs
a green CI run and a registry pull — there is no "quick fix directly on the server".
`);

// ---------------------------------------------------------------------------
// .claude/rules/
// ---------------------------------------------------------------------------
file(".claude/rules/monorepo.md", `# Rule: Monorepo

Applies to: whole repository.

- Frontend and backend start separately (the commands live in \`CLAUDE.md\`). Do not introduce a
  combined \`npm run dev\` or \`concurrently\` unless explicitly requested.
- \`CLAUDE.md\` carries only the always-loaded invariants; detail belongs in \`knowledge/\`.
- \`knowledge/\` is the project's only knowledge rack. There is no parallel \`docs/\` rack.
- RUDIS SDD output stays where RUDIS writes it and is never a second knowledge rack:
  - \`specs/<NNN>-<slug>/\` — one per build or install + adapt row of the assembly table. The row
    fixes \`<NNN>-<slug>\` (three digits; lowercase \`a-z0-9\` and hyphens) when the analysis is
    written; pass it as
    \`/rudis.specify --number <NNN> --short-name <slug>\`. Edited while its task runs. Before
    handover, its contract, tables, and module rows move to their owners
    (\`packages/api-contract/\`, \`knowledge/API.md\`, \`DATABASE.md\`, \`MODULE_MAP.md\`), and a
    \`FROZEN.md\` in the folder records the date and the owner of each moved fact. Once merged into
    the main branch the folder is frozen: nothing in it is edited again — a changed understanding
    gets a new spec.
  - \`/rudis.redesign\`, \`/rudis.revamp\`, \`/rudis.upgrade\`, and \`/rudis.postmortem\` never amend a
    frozen spec or \`docs/brd/\`: the change goes to its owner (\`packages/api-contract/\`,
    \`knowledge/\`) or into a new spec, and \`docs/brd/\` is refreshed by re-running \`/rudis.brd\`.
  - \`.rudis/\` — RUDIS tooling and \`.rudis/memory/constitution.md\`, committed; its run output
    (\`.rudis/audit.log\`, \`.rudis/audit/\`, \`.rudis/.current-feature\`) is gitignored. Each
    constitution principle is a short MUST naming the file that owns it, never the rule restated.
  - \`/rudis.plan\`'s agent-context update (\`update-agent-context.sh\`) never edits \`CLAUDE.md\`:
    skip it, or revert what it added.
  - \`docs/brd/\` — derived by \`/rudis.brd\`, only when it is run. Committed, but never an owner:
    regenerated rather than hand-edited, and on any disagreement code and \`knowledge/\` win.
  - \`docs/revamp/\`, \`docs/upgrades/\` — records of the \`/rudis.revamp\` or \`/rudis.upgrade\` run
    that wrote them; committed, not edited after merge.
  - \`docs/trace-reports/\`, \`docs/test-reports/\` — gitignored: they can quote production data or
    security findings.
  - Nothing else goes under \`docs/\`.
- Every fact has one owner. Before writing a fact into a second file, check whether the file
  that already owns it should be updated instead — and if a summary really is needed, name the
  authoritative file next to it.
- Do not use by default unless explicitly requested: Microservices, Kubernetes, Turborepo complexity, Nx, Redis, Memcache, TanStack libraries, multiple frontend containers, separate backend/frontend production containers, Dockerized database, cross-module foreign keys, cross-module joins, GORM (or GORM AutoMigrate) for Go.
`);
file(".claude/rules/backend-modular-monolith.md", `# Rule: Backend modular monolith

Applies to: \`apps/api/**\`.

- Each module is a boundary. It offers \`contracts/\` (owned by the provider) and declares what it
  needs as ports in its own \`ports/\` (owned by the consumer).
- Forbidden: importing another module at all — its internals and its \`contracts/\` alike. Only
  the composition root imports modules, connecting a provider's client to a consumer's port
  with a small adapter that holds no business logic.
- Forbidden: cross-module DB joins and cross-module foreign keys.
- Cross-module relations are primitive IDs; resolve them through the module's own ports.
- A change spanning modules commits atomically through the kernel's \`d.Tx\` (ports called with its ctx);
  reactions that may happen later go through \`d.Events\` — never a transaction a module opens itself.
- \`shared/\` holds only technical utilities (errors, response, request, logger, validator, pagination, utils) — never domain logic.
`);
// Registries and markers are what the module library installs into (references/backend-go.md,
// references/frontend.md). The backend registry exists for Go only, so far.
const goModuleRules = backend === "go" ? [
  "- Go: a module's package root exposes `New(d *kernel.Deps, <one value per port it needs>...) (*Module, error)`,",
  "  `Routes(mux *http.ServeMux)`, and `Client()` when it offers a contract. `internal/modules` is",
  "  the composition root: `registry.go` builds a provider before the modules wired to it, and",
  "  each connection is an adapter in its own `adapter_<consumer>_<port>.go` beside it.",
  "- Go: guard a handler with `d.Auth.Require(h)` and read the user with `d.Auth.UserID(ctx)`. The",
  "  auth module fills that slot in `registry.go` with `d.Auth.Provide(...)` — never import it.",
  "- Go: a module declares its permissions (`<module>.<action>`) with `d.Authz.Declare` in `New` and",
  "  guards with `d.Authz.Require(permission, h)`; never check roles or import an rbac module.",
  "- Go: a module owns its `sql:` block in `sqlc.yaml` and adds migrations with",
  "  `npm run migrate:create` (timestamp-versioned, so two branches never collide).",
  "- Go: `internal/kernel` and `internal/shared` are the kernel every module builds on. Change them",
  "  only while every module still builds, and bump `kernel.Version` for a change that would",
  "  break an existing module.",
] : [];
file(".claude/rules/modules.md", [
  "# Rule: Modules and registries",
  "",
  `Applies to: ${backend === "go" ? "`apps/api/internal/**`, `apps/api/sqlc.yaml`, " : ""}\`apps/web/src/modules/**\`, \`apps/web/src/app/**\`.`,
  "",
  backend === "go"
    ? "- A module is wired in only through its registry: `apps/api/internal/modules/registry.go`\n  (backend) and `apps/web/src/app/modules.ts` (frontend). Never mount it anywhere else."
    : "- A frontend module is wired in only through `apps/web/src/app/modules.ts`. Never mount it\n  anywhere else.",
  "- Keep every `rudis:*` marker. Tooling inserts lines between them — add yours between them too,",
  "  never around or instead of them.",
  "- A frontend module never imports another module. Shared needs go through `shared/`; putting",
  "  several modules on one screen happens in `app/`. Hide what needs a permission with `useCan`",
  "  or `NavItem.permission`; tell other modules something happened with `@/shared/app-events`.",
  ...goModuleRules,
  "- Customize an installed module in new files of its own (e.g. `custom_*.go`, `Custom*.tsx`)",
  "  rather than editing the files it shipped with, so a later upgrade merges cleanly.",
  "- Library modules are installed and upgraded only with the library's `module.mjs` (`add`,",
  "  `upgrade`, `detach`) — never copied by hand. `modules.lock.json` records them; commit it.",
  "",
].join("\n"));
file(".claude/rules/frontend-react.md", `# Rule: Frontend (React)

Applies to: \`apps/web/**\`.

- React 19 + Tailwind 4, react-router-dom with lazy-loaded routes/pages.
- State: Zustand (global in \`shared/stores\`, module state in \`modules/<m>/stores\`).
- Validation: Zod schemas in \`modules/<m>/schemas\`. Prefer \`z.infer\` over manual form types.
- HTTP: all requests go through \`shared/services/http-client.ts\` (one Axios instance).
- Use the \`@/*\` import alias.
- UI foundation is shadcn/ui on Radix: primitives in \`shared/components/primitives\` (add more with
  \`npx shadcn@latest add <name>\`), generic compositions in \`shared/components/ui\`, page patterns
  in \`shared/components/patterns\`. Merge classes with \`cn\` from the \`cn\` package.
- Before writing a generic component, check the library UI kits (ui-core, ui-data, ui-forms,
  ui-feedback — see the module-library catalog); field-like controls use \`FIELD\` from
  \`shared/lib/field-classes.ts\`. User-facing copy is Indonesian unless the project says otherwise.
- Color, type, radius, and elevation come only from \`src/theme/theme.css\`, through semantic
  classes (\`bg-card\`, \`text-muted-foreground\`, \`border-border\`, \`text-destructive\`, …). No raw
  colors in components (hex, \`bg-blue-600\`, \`text-[#…]\`). Token names are a contract: change
  their values, never rename or remove one.
- Before building or reshaping UI, read \`knowledge/DESIGN.md\`. If it is not researched yet, is
  older than ~6 months, or doesn't cover the screen type at hand, first research current sources
  on the internet (real products of this app type, a fitting design system, UX research) and
  record findings, direction, and dated sources there. Extract patterns — never copy another
  product's branding, assets, or exact layout.
- Shared UI components must be domain-agnostic. Use the \`frontend-design\` skill for UI; if it isn't installed, install it first from https://github.com/anthropics/skills/tree/main/skills/frontend-design (do not skip it).
`);
file(".claude/rules/database.md", `# Rule: Database

Applies to: \`apps/api/**\`.

- A repository accesses only the tables its own module owns.
- Cross-module boundary rules (no joins, no foreign keys, relations as primitive IDs) are
  authoritative in \`backend-modular-monolith.md\` — not restated here.
- Migrations are forward-only and **expand/contract**: a release only adds (tables, nullable or
  defaulted columns, indexes), so the previous version still runs on the new schema — a
  rollback deploys the older image without undoing migrations. A column is dropped or renamed
  in a later release, once no deployed version reads it. Never edit a migration that ran
  anywhere; add a new one.
- One schema change per migration file: MySQL commits DDL at once, so a file that fails
  half-way cannot roll back.
- Times are stored in UTC (the API's DB sessions run in UTC); "today" for a user is computed
  in Asia/Jakarta in code.
${backend === "go" ? "- Go: golang-migrate for migrations (timestamp-versioned; CI refuses one older than the newest\n  on main — \`node scripts/check-migrations.mjs <base> --fix\` renames it), sqlc for access (one\n  generated package per module), database/sql + MySQL driver. Not GORM.\n" : ""}${backend === "nestjs" ? "- NestJS: Prisma migrations (not TypeORM unless explicitly requested).\n" : ""}${backend === "express" ? "- Express: migration tool is not locked — confirm the choice before implementing migrations.\n" : ""}`);
file(".claude/rules/deployment.md", `# Rule: Deployment (deploy server)

Applies to: \`infra/**\`, \`.github/workflows/**\`, \`docker-compose.yml\`, \`.dockerignore\`.

- One application = one image = one container. The monorepo ships web + api together; never
  split it across containers and never co-host another app in it.
- The server never builds. \`.github/workflows/release-image.yml\` builds the image and pushes it to
  GHCR; the server only pulls. No \`build:\` in \`infra/deploy/docker-compose.prod.yml\`.
- Deploy an immutable \`<git-sha>\` tag, never \`latest\`; \`IMAGE_TAG\` stays required in the
  prod compose.
- MySQL is the host's shared install: one database + one dedicated user for this app, granted
  on its own database only. Never add a database container or service; never publish 3306.
- The container publishes to \`127.0.0.1:<port>\` only; public traffic enters through the host
  nginx + certbot. The nginx site never claims \`default_server\`.
- Secrets live only in \`~/<app>/.env\` on the server (chmod 600). Commit only \`*.example\`
  env files; never bake secrets into the image.
- The image runs as a non-root user with a HEALTHCHECK on \`/readyz\`, and uses ENTRYPOINT
  (not CMD). The container stays \`read_only\`; anything writable is an explicit volume.
- Every deploy runs \`infra/deploy/deploy.sh <git-sha>\`: DB backup before migrate,
  migrations forward-only.
- Concrete values (port, names, image, domain) are owned by \`knowledge/DEPLOYMENT.md\`. Any
  change on the server itself needs the owner's explicit go-ahead.
`);
file(".claude/rules/api-standard.md", `# Rule: API standard

Applies to: \`apps/api/**\`.

- Version endpoints under \`/api/v1\`.
- Success: \`{ success: true, message, data }\`. Error: \`{ success: false, message, errors }\`.
- Paginated: include \`meta: { page, limit, total, total_pages }\`.
`);

// ---------------------------------------------------------------------------
// analysis/ — per-requirement analysis artifacts (used by the monorepo-analyze skill).
// Committed on purpose: it's the record of why something was built a given way, for
// future-you and for the next Claude session. Never edited after being written — a
// changed understanding gets a new analysis folder, not a rewrite of the old one.
// ---------------------------------------------------------------------------
file("analysis/README.md", `# Analysis

Per-requirement analysis artifacts, one folder per requirement:
\`analysis/<NNN>-<slug>/\` or \`analysis/<ISSUE-ID>-<slug>/\` if there's an issue tracker.

Each folder contains: \`analysis.md\`, \`flow.mmd\`, \`sequence.mmd\`, and optionally \`erd.mmd\`.

This folder is committed on purpose — it's the record of why something was built the way it
was, for future-you and for the next Claude session. Do not gitignore it.

Artifacts here are never edited after being written. If understanding changes, write a new
analysis — don't rewrite the old one.

A build or install + adapt row specified with RUDIS SDD names its \`specs/<NNN>-<slug>/\` folder
in \`analysis.md\` when the analysis is written, and links to it rather than copying the spec.
`);

// ---------------------------------------------------------------------------
// infra/
// ---------------------------------------------------------------------------
// Deploy target: any Docker host following references/docker-deployment.md (the target itself
// is configuration — see knowledge/DEPLOYMENT.md). Every file below encodes that convention:
//   1 app = 1 image = 1 container · images built in CI → GHCR, the server only pulls ·
//   host-level shared MySQL (1 DB + 1 user per app) · 127.0.0.1:<port> behind host nginx ·
//   secrets only in ~/<app>/.env. See references/docker-deployment.md.

// Host nginx site (installed under /etc/nginx/sites-available on the server — not a compose service).
file("infra/nginx/nginx.conf", `# Host nginx site for ${slug} on the deploy server (NOT a compose service).
# Install steps: knowledge/DEPLOYMENT.md. TLS is added afterwards by \`certbot --nginx\`.
#
# Do NOT add \`default_server\`: only one is allowed per :80 and another app already holds it
# (\`nginx -t\` fails with "duplicate default_server").
server {
  listen 80;
  server_name ${domain};

  client_max_body_size 10m;
${backend === "go" ? `
  # Server-sent event streams (request.AllowStream, at /api/v1/<module>/stream…): passed
  # unbuffered and kept open — the app sends a heartbeat every 20 s.
  location ~ ^/api/v1/[^/]+/stream {
    proxy_pass http://127.0.0.1:${hostPort};
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
  }
` : ""}
  location / {
    proxy_pass http://127.0.0.1:${hostPort};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
  }

  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header X-Frame-Options DENY always;
  # Enable HSTS only after certbot has installed TLS (certbot does not add it):
  # add_header Strict-Transport-Security "max-age=31536000" always;
}
`);

const dockerHeader = `# One image = the whole app (static frontend + API). Built ONLY in CI
# (.github/workflows/release-image.yml); the deploy server never builds — it pulls
# ${image}:<git-sha>.
# - Commit package-lock.json: with it the build uses \`npm ci\` (reproducible).
# - Runs as non-root uid 10001 with a HEALTHCHECK on /readyz.
# - ENTRYPOINT, not CMD: \`docker run <image> <args>\` passes args to the app instead of
#   replacing it (a CMD here once broke a one-off \`migrate\` run on this server).
`;
const npmInstall = `RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi`;
const healthcheck = `HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \\
  CMD wget -qO- http://127.0.0.1:8080/readyz >/dev/null || exit 1`;

if (backend === "go") {
  file("infra/docker/Dockerfile", `${dockerHeader}# - go.sum must be committed (run \`go mod tidy\` once after scaffolding).
# - golang-migrate ships inside the image so the server can migrate without a Go toolchain.

FROM node:22-alpine AS web
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/web ./apps/web
${npmInstall}
RUN npm run build -w apps/web

FROM golang:1.27-alpine AS api
ENV CGO_ENABLED=0 GOFLAGS=-buildvcs=false
WORKDIR /src/apps/api
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api ./
RUN go build -trimpath -ldflags "-s -w" -o /out/api ./cmd/server

FROM alpine:3.24
RUN apk add --no-cache ca-certificates tzdata wget \\
 && addgroup -S app && adduser -S -G app -u 10001 app
WORKDIR /app
COPY --from=api /out/api ./api
COPY --from=migrate/migrate:v4.18.1 /usr/local/bin/migrate /usr/local/bin/migrate
COPY apps/api/migrations ./migrations
COPY infra/deploy/.env.production.example ./env.production.example
COPY --from=web /repo/apps/web/dist ./public
# DATA_DIR: mounted from ~/<slug>/data on the server; owned by the app user for local runs.
RUN mkdir -p /app/data && chown app:app /app/data
# GOMEMLIMIT: the Go GC aims below the compose memory limit (512M) instead of being OOM-killed.
ENV APP_ENV=production APP_PORT=8080 PUBLIC_DIR=/app/public DATA_DIR=/app/data GOMEMLIMIT=400MiB
USER app
EXPOSE 8080
${healthcheck}
ENTRYPOINT ["./api"]
`);
} else {
  const entry = backend === "nestjs" ? "apps/api/dist/main.js" : "apps/api/dist/index.js";
  const prisma = backend === "nestjs";
  file("infra/docker/Dockerfile", `${dockerHeader}${prisma ? "# - Prisma CLI + engines stay in node_modules so the server runs `prisma migrate deploy` from\n#   this same image (openssl is required by the Prisma engines on Alpine).\n" : ""}
FROM node:22-alpine AS build
${prisma ? "RUN apk add --no-cache openssl\n" : ""}WORKDIR /repo
COPY . .
${npmInstall}
${prisma ? "RUN npx prisma generate --schema apps/api/prisma/schema.prisma\n" : ""}RUN npm run build -w apps/web && npm run build -w apps/api \\
 && mkdir -p apps/api/node_modules

FROM node:22-alpine
RUN apk add --no-cache ${prisma ? "openssl " : ""}tzdata \\
 && addgroup -S app && adduser -S -G app -u 10001 app
WORKDIR /app
COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
${prisma ? "COPY --from=build /repo/apps/api/prisma ./apps/api/prisma\n" : ""}COPY --from=build /repo/infra/deploy/.env.production.example ./env.production.example
COPY --from=build /repo/apps/web/dist ./public
ENV NODE_ENV=production APP_ENV=production APP_PORT=8080 PUBLIC_DIR=/app/public
USER app
EXPOSE 8080
${healthcheck}
ENTRYPOINT ["node", "${entry}"]
`);
}

// One-off migration runner, same image as the app (profile "ops" keeps it out of `up`).
const migrateService = {
  go: `
  # One-off: \`docker compose -f docker-compose.prod.yml --profile ops run --rm migrate\`
  # (deploy.sh runs it BEFORE the new container starts). Same image, golang-migrate entrypoint;
  # DB_DSN is read from .env.
  migrate:
    image: ${image}:\${IMAGE_TAG:?IMAGE_TAG is not set — run ./deploy.sh <git-sha>}
    profiles: ["ops"]
    entrypoint: ["migrate", "-path", "/app/migrations", "-database", "mysql://\${DB_DSN}?multiStatements=true"]
    command: ["up"]
    env_file: .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
`,
  nestjs: `
  # One-off: \`docker compose -f docker-compose.prod.yml --profile ops run --rm migrate\`
  # (deploy.sh runs it BEFORE the new container starts). Same image, Prisma entrypoint;
  # DATABASE_URL is read from .env.
  migrate:
    image: ${image}:\${IMAGE_TAG:?IMAGE_TAG is not set — run ./deploy.sh <git-sha>}
    profiles: ["ops"]
    entrypoint: ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"]
    env_file: .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
`,
  express: `
  # No migrate service yet: the Express migration tool is not locked (apps/api/MIGRATION.md).
  # Once chosen, add a profile-"ops" migrate service here (same image) and wire it in deploy.sh.
`,
}[backend];

file("infra/deploy/docker-compose.prod.yml", `# PRODUCTION on the deploy server — copied to ~/${slug}/docker-compose.prod.yml, next to
# ~/${slug}/.env (chmod 600) and ~/${slug}/deploy.sh. Deploy: \`cd ~/${slug} && ./deploy.sh <git-sha>\`.
#
# IMAGE-ONLY — no \`build:\`. The server only pulls images built by
# .github/workflows/release-image.yml. Never build on the server.
#
# IMAGE_TAG is REQUIRED (no \`latest\` fallback): deploy.sh writes it into .env, so a manual
# \`docker compose up\` stays on the version last deployed instead of a stale local \`latest\`.
services:
  app:
    image: ${image}:\${IMAGE_TAG:?IMAGE_TAG is not set — run ./deploy.sh <git-sha>}
    container_name: ${slug}-app
    restart: unless-stopped
    env_file: .env
    extra_hosts:
      - "host.docker.internal:host-gateway" # MySQL runs on the host, never in a container
    ports:
      - "127.0.0.1:${hostPort}:8080" # loopback only; host nginx + TLS sits in front
${backend === "go" ? `    # DATA_DIR: the one place the app writes (uploads, …) — survives deploys, owned by uid 10001
    # (deploy.sh sees to it), backed up nightly with the database by the server's backup job.
    volumes:
      - ./data:/app/data
` : `    # Anything the app writes needs an explicit volume owned by uid 10001, e.g.
    #   volumes: ["./data:/app/data"]
`}    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - "no-new-privileges:true"
    stop_grace_period: 30s
    deploy:
      resources:
        limits:
          memory: 512M # shared small host — raise only with a measured reason
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/readyz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    logging: # cap logs so the disk never fills
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
${migrateService}`);

const migrateStep = backend === "express"
  ? `if [ "\${SKIP_MIGRATE:-0}" = "1" ]; then
  echo "  (SKIP_MIGRATE=1 — skipped)"
else
  echo "  ✗ no migration tool chosen yet (apps/api/MIGRATION.md). Add a migrate service to"
  echo "    docker-compose.prod.yml and call it here, or rerun with SKIP_MIGRATE=1."
  exit 1
fi`
  : backend === "go"
  ? `if [ "\${SKIP_MIGRATE:-0}" = "1" ]; then
  echo "  (SKIP_MIGRATE=1 — skipped)"
else
  # Where the database is, and the newest migration this image ships.
  current="$($COMPOSE --profile ops run --rm migrate version 2>&1 | tail -1 || true)"
  newest="$($COMPOSE --profile ops run --rm --entrypoint sh migrate -c 'ls /app/migrations' 2>/dev/null \\
    | sed -n 's/^\\([0-9][0-9]*\\)_.*\\.up\\.sql$/\\1/p' | sort -n | tail -1 || true)"
  case "$current" in
    *dirty*)
      echo "  ✗ the database is marked dirty: a migration failed half-way (\${current})."
      echo "    Nothing was started. Recovery: knowledge/DEPLOYMENT.md › A migration failed."
      exit 1 ;;
  esac
  cur="$(printf '%s' "$current" | grep -oE '^[0-9]+' || true)"
  if [ -n "$cur" ] && [ -n "$newest" ] && [ "$cur" -gt "$newest" ]; then
    # A rollback: this older image does not know the newer migrations. The schema stays —
    # releases follow expand/contract, so the previous version runs on it.
    echo "  ! database is at \${cur}, newer than this image (\${newest}): rollback — migrate skipped"
  else
    $COMPOSE --profile ops run --rm migrate
  fi
fi`
  : `if [ "\${SKIP_MIGRATE:-0}" = "1" ]; then
  echo "  (SKIP_MIGRATE=1 — skipped; use it to roll back past a schema change)"
else
  $COMPOSE --profile ops run --rm migrate
fi`;

file("infra/deploy/deploy.sh", `#!/usr/bin/env bash
# ${name} — deploy on the deploy server (procedure: knowledge/DEPLOYMENT.md).
# The server NEVER builds: CI (release-image.yml) builds & pushes to GHCR; this script only does
#   preflight -> pull -> DB backup -> migrate -> up -> wait for /readyz.
#
# Usage (on the server, from ~/${slug}):
#   ./deploy.sh <git-sha>         deploy that exact, immutable image
#   ./deploy.sh <older-git-sha>   rollback (migrations are forward-only)
#
# Optional env:
#   SKIP_BACKUP=1     skip the DB dump (FIRST deploy only, while the database is still empty)
#   SKIP_PULL=1       use an image already on the machine (production always pulls)
#   MYSQLDUMP="..."   dump command (default: sudo -n mysqldump — MySQL root via auth_socket)
#   SKIP_MIGRATE=1    do not migrate (Go detects a rollback past a schema change by itself)
#
# Scheduled, rotated backups are the server's job, not this script's (knowledge/DEPLOYMENT.md
# › Backups). This script keeps one dump: the state right before migrating.
set -euo pipefail
umask 077 # dumps and logs are readable by the owner only from the moment they exist
cd "$(dirname "$0")"

APP=${slug}
PORT=${hostPort}
IMAGE_REPO=${image}
COMPOSE="docker compose -f docker-compose.prod.yml"
MYSQLDUMP="\${MYSQLDUMP:-sudo -n mysqldump}"

TAG="\${1:-}"
if [ -z "$TAG" ]; then
  echo "usage: ./deploy.sh <git-sha>   (tag shown in GitHub Actions » release-image)" >&2
  exit 2
fi
if [ "$TAG" = "latest" ]; then
  echo "refused: 'latest' cannot be rolled back to — use the full <git-sha>." >&2
  exit 2
fi

envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }

echo "▶ [0/5] preflight"
if grep -qE '__[A-Z_]+__' "$0" docker-compose.prod.yml; then
  echo "  ✗ deploy facts still unset (placeholder markers left in deploy.sh / docker-compose.prod.yml)."
  echo "    Fill in the port and GHCR owner from knowledge/DEPLOYMENT.md first."
  exit 1
fi
[ -f .env ] || { echo "  ✗ .env missing (copy .env.production.example from the repo, fill real values)"; exit 1; }
perm="$(stat -c %a .env 2>/dev/null || stat -f %Lp .env)"
[ "$perm" = "600" ] || { echo "  ✗ .env must be chmod 600 (is $perm)"; exit 1; }
[ "$(envval APP_ENV)" = "production" ] || { echo "  ✗ APP_ENV in .env must be production"; exit 1; }
DB_NAME="$(envval DB_NAME)"
[ -n "$DB_NAME" ] || { echo "  ✗ DB_NAME is empty in .env"; exit 1; }
[ "$DB_NAME" = "\${APP}_db" ] || echo "  ! DB_NAME is $DB_NAME, convention is \${APP}_db"
mkdir -p backups
${backend === "go" ? `# DATA_DIR on the server: the app runs as uid 10001 on a read-only filesystem, so this folder
# is the only place it can write. Created and handed over once; the check costs nothing after.
# Not fatal: an app that stores no files runs without it, and one that does refuses to start
# with a clear message, which the health check then reports.
mkdir -p data
if [ "$(stat -c %u data 2>/dev/null || stat -f %u data)" != "10001" ] && ! sudo -n chown 10001:10001 data 2>/dev/null; then
  echo "  ! data/ does not belong to uid 10001 and sudo is not allowed here; an app that stores files needs: sudo chown 10001:10001 ~/\${APP}/data"
fi
` : ""}PREV_TAG="$(envval IMAGE_TAG || true)"
echo "  ✓ .env 600, APP_ENV=production, DB_NAME=\${DB_NAME}; previous version: \${PREV_TAG:-(none)}"

export IMAGE_TAG="$TAG"
IMAGE="\${IMAGE_REPO}:\${TAG}"

echo "▶ [1/5] pull \${IMAGE}"
if [ "\${SKIP_PULL:-0}" = "1" ]; then
  docker image inspect "$IMAGE" >/dev/null || { echo "  ✗ SKIP_PULL=1 but the image is not on this machine"; exit 1; }
  echo "  (SKIP_PULL=1 — using the local image)"
else
  $COMPOSE pull app
fi
# Every setting this version needs is in .env — checked before anything changes. The keys come
# from the image's own copy of .env.production.example; one written as <...> there must have a
# value here.
missing=""
while IFS= read -r line; do
  key="\${line%%=*}"
  example="\${line#*=}"
  if ! grep -qE "^\${key}=" .env; then
    missing="\${missing} \${key}"
  elif [ "\${example#<}" != "$example" ] && [ -z "$(envval "$key")" ]; then
    missing="\${missing} \${key}(empty)"
  fi
done < <(docker run --rm --entrypoint cat "$IMAGE" /app/env.production.example 2>/dev/null | grep -E '^[A-Z][A-Z0-9_]*=' || true)
if [ -n "$missing" ]; then
  echo "  ✗ .env lacks settings this version needs:\${missing}"
  echo "    Add them (see infra/deploy/.env.production.example) and rerun. Nothing was changed."
  exit 1
fi

echo "▶ [2/5] back up \${DB_NAME} before migrating"
if [ "\${SKIP_BACKUP:-0}" = "1" ]; then
  echo "  (SKIP_BACKUP=1 — skipped; first deploy on an empty database only)"
else
  # One dump, replaced each deploy: the state right before this migration. Written beside the
  # old one first, so a failed dump keeps the previous dump. pipefail: a failed dump fails
  # the deploy (never migrate without a backup).
  out="backups/pre-deploy.sql.gz"
  $MYSQLDUMP --single-transaction --routines --triggers --events --hex-blob \\
    --default-character-set=utf8mb4 --set-gtid-purged=OFF --no-tablespaces "$DB_NAME" | gzip -9 > "$out.tmp"
  gzip -t "$out.tmp"
  mv -f "$out.tmp" "$out"
  rm -f backups/pre-deploy-*.sql.gz # dumps from older versions of this script
  echo "  ✓ \${out} ($(du -h "$out" | cut -f1)) — before \${TAG:0:12}"
fi

echo "▶ [3/5] migrate"
${migrateStep}

echo "▶ [4/5] start app"
# Keep the outgoing version's log: it disappears with its container, and is what a rollback
# investigation needs. The last 5 are kept.
if docker inspect "\${APP}-app" >/dev/null 2>&1; then
  mkdir -p logs
  docker logs "\${APP}-app" > "logs/\${PREV_TAG:-previous}.log" 2>&1 || true
  ls -1t logs/*.log 2>/dev/null | tail -n +6 | xargs -r rm -f
fi
$COMPOSE up -d app
# Record the running version so a manual \`docker compose up\` stays on it.
if grep -qE '^IMAGE_TAG=' .env; then
  sed -i.bak -E "s|^IMAGE_TAG=.*|IMAGE_TAG=\${TAG}|" .env && rm -f .env.bak
else
  printf '\\n# managed by deploy.sh — image version currently running\\nIMAGE_TAG=%s\\n' "$TAG" >> .env
fi
chmod 600 .env

echo "▶ [5/5] wait for /readyz (max 120 s)"
for _ in $(seq 1 24); do
  if curl -fsS "http://127.0.0.1:\${PORT}/readyz" >/dev/null 2>&1; then
    # Keep this version and the previous one for a quick rollback; older ones only fill the disk.
    docker images "$IMAGE_REPO" --format '{{.Tag}}' | grep -vxF -e "$TAG" -e "\${PREV_TAG:-none}" \\
      | while read -r old; do docker rmi "\${IMAGE_REPO}:\${old}" >/dev/null 2>&1 || true; done
    docker image prune -f >/dev/null 2>&1 || true
    echo "✓ done. \${APP} is running \${IMAGE}"
    exit 0
  fi
  sleep 5
done
echo "  ✗ /readyz never became healthy — last log lines:"
docker logs --tail 60 "\${APP}-app" || true
if [ -n "$PREV_TAG" ]; then
  echo "  Rollback: ./deploy.sh \${PREV_TAG}   (migrations are forward-only)"
fi
exit 1
`);

const prodDbUrl = backend === "go"
  ? `# Go DSN (no scheme, no ?params). Used by the app AND by migrate (compose -> "mysql://\${DB_DSN}?multiStatements=true").
DB_DSN=${slug}_user:<random-hex>@tcp(host.docker.internal:3306)/${dbName}`
  : `# Prisma URI${backend === "nestjs" ? " — used by the app AND by the migrate service" : ""}.
DATABASE_URL=mysql://${slug}_user:<random-hex>@host.docker.internal:3306/${dbName}`;

file("infra/deploy/.env.production.example", `# PRODUCTION .env — deploy server. Copy to ~/${slug}/.env on the server, fill in real values,
# then \`chmod 600 .env\`. This file is SAFE to commit: it holds no secrets.
# Never commit a filled-in .env and never bake secrets into the image.
APP_ENV=production
APP_PORT=8080
APP_NAME=${name}
${backend === "go" ? "APP_TIMEZONE=Asia/Jakarta\n" : ""}
# --- Database: the host's shared MySQL, ONE database + ONE user for this app only ------
# Create both once on the host — the SQL is in knowledge/DEPLOYMENT.md.
# Password: \`openssl rand -hex 24\` (hex stays URL-safe inside the DSN).
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USER=${slug}_user
DB_PASSWORD=<random-hex>
DB_NAME=${dbName}
${prodDbUrl}

# --- App secrets (\`openssl rand -hex 32\`) ----------------------------------------------
JWT_SECRET=<random-hex>
JWT_EXPIRES_IN=24h

# --- HTTP behind the host nginx ---------------------------------------------------------
# Explicit public origin(s), comma-separated — never '*'.
CORS_ALLOWED_ORIGINS=https://${domain}
# nginx reaches the container from the docker bridge (172.16.0.0/12). Trust it for
# X-Forwarded-For, or every user looks like one IP to rate limiters.
TRUSTED_PROXIES=172.16.0.0/12,127.0.0.1/32

# Served from the image; leave as is.
PUBLIC_DIR=/app/public

# IMAGE_TAG is written here by deploy.sh — do not set it by hand.
`);

// CI: verify every push/PR; release-image builds the deployable image only after ci is green.
const ciApiJob = backend === "go"
  ? `  api:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: apps/api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: apps/api/go.mod
      - run: go build ./...
      - run: go vet ./...
      - run: go test ./...
  # Migrations meet a real MySQL before production does: order checked against the base branch
  # (an older timestamp would be skipped silently), then up, all the way down, and up again.
  migrations:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ALLOW_EMPTY_PASSWORD: "yes"
          MYSQL_DATABASE: ci_db
        ports: ["3306:3306"]
        options: >-
          --health-cmd="mysqladmin ping -h 127.0.0.1"
          --health-interval=5s --health-timeout=5s --health-retries=20
    env:
      DB_DSN: "root:@tcp(127.0.0.1:3306)/ci_db"
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/setup-go@v5
        with:
          go-version-file: apps/api/go.mod
      - name: golang-migrate
        run: go install -tags mysql github.com/golang-migrate/migrate/v4/cmd/migrate@v4.18.1 && echo "$(go env GOPATH)/bin" >> "$GITHUB_PATH"
      - run: node scripts/check-migrations.mjs "\${{ github.event.pull_request.base.sha || github.event.before }}"
      - run: node scripts/migrate.mjs up && node scripts/migrate.mjs down -all && node scripts/migrate.mjs up
      # The kernel's own MySQL tests: transactions, deadlock retry, tasks, events, schedules.
      - run: go test ./internal/kernel/...
        working-directory: apps/api
        env:
          KERNEL_TEST_DSN: "root:@tcp(127.0.0.1:3306)/"
`
  : "";
file(".github/workflows/ci.yml", `name: ci

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
${ciApiJob}  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: install
        run: if [ -f package-lock.json ]; then npm ci; else npm install; fi
      - run: npm run build:web
${isNodeBackend ? "      - run: npm run build:api\n" : ""}`);

file(".github/workflows/release-image.yml", `# Build & push the app image to GHCR — the deploy server only pulls it, never builds.
# Runs ONLY after the \`ci\` workflow passed for a push to main, on that exact commit
# (head_sha), so a published image is always one whose checks were green. Can also be
# triggered manually for a given ref.
name: release-image

on:
  workflow_run:
    workflows: [ci]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      ref:
        description: "Ref/commit to build (default: main)"
        required: false
        default: main

permissions:
  contents: read
  packages: write

concurrency:
  group: release-image
  cancel-in-progress: false

jobs:
  image:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push')
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.workflow_run.head_sha || inputs.ref }}

      - name: image name & tag
        id: meta
        run: |
          image="ghcr.io/$(echo "\${GITHUB_REPOSITORY}" | tr '[:upper:]' '[:lower:]')"
          sha="$(git rev-parse HEAD)"
          echo "image=\${image}" >> "$GITHUB_OUTPUT"
          echo "sha=\${sha}" >> "$GITHUB_OUTPUT"

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: build & push (linux/amd64 — the server architecture)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: infra/docker/Dockerfile
          platforms: linux/amd64
          push: true
          tags: |
            \${{ steps.meta.outputs.image }}:\${{ steps.meta.outputs.sha }}
            \${{ steps.meta.outputs.image }}:latest
          labels: |
            org.opencontainers.image.source=https://github.com/\${{ github.repository }}
            org.opencontainers.image.revision=\${{ steps.meta.outputs.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: summary
        run: |
          {
            echo "### Image published"
            echo ""
            echo "\\\`\${{ steps.meta.outputs.image }}:\${{ steps.meta.outputs.sha }}\\\`"
            echo ""
            echo "Deploy: \\\`ssh ${sshHost} 'cd ~/${slug} && ./deploy.sh \${{ steps.meta.outputs.sha }}'\\\`"
          } >> "$GITHUB_STEP_SUMMARY"
`);

// ---------------------------------------------------------------------------
// packages/
// ---------------------------------------------------------------------------
file("packages/shared/package.json", JSON.stringify({
  // No "main" yet: index.ts is raw TypeScript with no build step. Set it once this
  // package is actually consumed and has a real entry point to point to.
  name: `@${npmName}/shared`, version: "0.1.0", private: true,
}, null, 2) + "\n");
file("packages/shared/index.ts", "// Truly reusable cross-app code only. No premature packages.\nexport {};\n");
file("packages/api-contract/package.json", JSON.stringify({
  name: `@${npmName}/api-contract`, version: "0.1.0", private: true,
}, null, 2) + "\n");
file("packages/api-contract/README.md", `# API Contract\n\nOpenAPI / schema / API contract documentation for ${name}.\n`);

// ---------------------------------------------------------------------------
// apps/web — React 19 + Tailwind 4 base
// ---------------------------------------------------------------------------
file("apps/web/package.json", JSON.stringify({
  name: "web", private: true, version: "0.1.0", type: "module",
  scripts: { dev: "vite", build: "tsc --noEmit && vite build", preview: "vite preview" },
  // Alphabetical, as npm and the shadcn CLI rewrite them — so `shadcn add` shows up in a
  // diff as the one dependency it added. The shadcn/ui foundation is radix-ui,
  // class-variance-authority, cn, lucide-react, and tw-animate-css (references/frontend.md);
  // anything beyond it arrives with the module or preset that needs it.
  dependencies: {
    axios: "^1.7.0", "class-variance-authority": "^0.7.1", cn: "^0.4.0",
    "lucide-react": "^1.43.0", "radix-ui": "^1.8.1", react: "^19.0.0", "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0", "tw-animate-css": "^1.4.0", zod: "^3.23.0", zustand: "^5.0.0",
  },
  devDependencies: {
    "@tailwindcss/vite": "^4.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0", tailwindcss: "^4.0.0", typescript: "^5.6.0", vite: "^6.0.0",
  },
}, null, 2) + "\n");

file("apps/web/index.html", `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

file("apps/web/vite.config.ts", `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    rollupOptions: {
      output: {
        // Libraries change less often than the app: in their own chunks they stay cached
        // across deploys.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          ui: ["radix-ui", "lucide-react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Same origin in dev, same as the single-container production model.
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
`);

file("apps/web/tsconfig.json", JSON.stringify({
  compilerOptions: {
    target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"],
    module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx",
    strict: true, noUnusedLocals: true, noUnusedParameters: true,
    skipLibCheck: true, noEmit: true, isolatedModules: true,
    baseUrl: ".", paths: { "@/*": ["src/*"] },
  },
  include: ["src"],
}, null, 2) + "\n");

file("apps/web/eslint.config.js", `// Configure ESLint for the frontend as needed.\nexport default [];\n`);
// shadcn CLI config: \`npx shadcn@latest add <component>\` drops primitives straight into
// shared/components/primitives, wired to theme.css. cn() is the "cn" package (shadcn's
// replacement for clsx + tailwind-merge), which is what the CLI writes into every component.
file("apps/web/components.json", JSON.stringify({
  $schema: "https://ui.shadcn.com/schema.json",
  style: "new-york",
  rsc: false,
  tsx: true,
  tailwind: { config: "", css: "src/theme/theme.css", baseColor: "neutral", cssVariables: true, prefix: "" },
  iconLibrary: "lucide",
  aliases: {
    components: "@/shared/components",
    utils: "cn",
    ui: "@/shared/components/primitives",
    lib: "@/shared/lib",
    hooks: "@/shared/hooks",
  },
}, null, 2) + "\n");
file("apps/web/src/vite-env.d.ts", `/// <reference types="vite/client" />\n`);

file("apps/web/src/main.tsx", `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/app/App";
import "@/theme/fonts";
import "@/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`);

file("apps/web/src/app/App.tsx", `import { AppProvider } from "@/app/providers/AppProvider";
import { RouterProvider } from "@/app/providers/RouterProvider";
import { composition, moduleProviders } from "@/app/composition";
import { CompositionProvider } from "@/shared/composition";

export default function App() {
  const app = moduleProviders.reduceRight((child, Provider) => <Provider>{child}</Provider>, <RouterProvider />);
  return (
    <AppProvider>
      <CompositionProvider value={composition}>{app}</CompositionProvider>
    </AppProvider>
  );
}
`);

file("apps/web/src/shared/kernel.ts", `/**
 * The frontend half of the kernel contract — the same number as kernel.Version in
 * apps/api/internal/kernel (see the changelog there). Library modules state the minimum they
 * need; the module installer reads it from here when a project has no Go API.
 */
export const KERNEL_VERSION = 7;
`);

file("apps/web/src/shared/access.tsx", `import { createContext, useContext } from "react";

/** What the signed-in user may do. Permissions are "<module>.<action>", e.g. "users.manage". */
export interface Access {
  can: (permission: string) => boolean;
  /** False while the provider is still loading the user's permissions. */
  ready: boolean;
}

// Without an authorization module everything is allowed — the backend's default policy is
// "signed in = allowed" too. An rbac module provides the real answer.
const AccessContext = createContext<Access>({ can: () => true, ready: true });

/** Provided by the module that does authorization. */
export const AccessProvider = AccessContext.Provider;

export function useAccess(): Access {
  return useContext(AccessContext);
}

/** Whether to show what needs permission. The API enforces it either way. */
export function useCan(permission: string): boolean {
  return useAccess().can(permission);
}
`);

file("apps/web/src/shared/app-events.ts", `/**
 * App-wide events — how one module tells others something happened without importing them.
 * Add a name here only for something every module may care about.
 */
export type AppEvent =
  /** Someone signed in or out, or the session expired. */
  | "session:changed"
  /** The signed-in user's own profile changed (their name): whoever shows it reloads it. */
  | "profile:changed"
  /** The active company or branch changed (shared/scope.ts): every page reloads its data. */
  | "scope:changed";

const listeners = new Map<AppEvent, Set<() => void>>();

export function emitAppEvent(event: AppEvent): void {
  listeners.get(event)?.forEach((fn) => fn());
}

/** Runs fn on every event; returns a function that stops it. */
export function onAppEvent(event: AppEvent, fn: () => void): () => void {
  const set = listeners.get(event) ?? new Set();
  set.add(fn);
  listeners.set(event, set);
  return () => {
    set.delete(fn);
  };
}
`);

file("apps/web/src/shared/scope.ts", `import { useEffect, useState } from "react";
import { emitAppEvent, onAppEvent } from "@/shared/app-events";

/**
 * The company and branch this tab works in — "<company>" or "<company>:<branch>", empty for the
 * user's default. Sent with every request as X-Scope; the API validates it against where the
 * user is placed. Set by an organization module's picker (slot "shell:scope"); an app with one
 * company never sets it.
 */
const KEY = "rudis.scope";

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function getScope(): string {
  return read();
}

/** Switches this tab to scope and tells every page to reload ("scope:changed"). */
export function setScope(scope: string): void {
  try {
    if (scope) sessionStorage.setItem(KEY, scope);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the scope lasts until the page reloads.
  }
  emitAppEvent("scope:changed");
}

/** The current scope; the component re-renders when it changes. */
export function useScope(): string {
  const [scope, set] = useState(read);
  useEffect(() => onAppEvent("scope:changed", () => set(read())), []);
  return scope;
}
`);

file("apps/web/src/app/providers/AppProvider.tsx", `import type { ReactNode } from "react";

export function AppProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
`);

file("apps/web/src/app/providers/RouterProvider.tsx", `import { Suspense } from "react";
import { RouterProvider as ReactRouterProvider } from "react-router-dom";
import { router } from "@/app/routes";
import { LoadingState } from "@/shared/components/feedback/LoadingState";

export function RouterProvider() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ReactRouterProvider router={router} />
    </Suspense>
  );
}
`);

// App-level paths only. A module owns its own paths in its module.tsx, so installing a
// module never edits this file.
file("apps/web/src/app/routes/route-paths.ts", `export const ROUTE_PATHS = {
  home: "/",
  /** Where "/" sends a visitor. */
  start: "/dashboard",
} as const;
`);

file("apps/web/src/shared/types/frontend-module.ts", `import type { ComponentType, ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import type { NavItem, SlotName } from "@/shared/composition";

/**
 * What a frontend module exports from its module.tsx. Modules never import each other: they
 * contribute routes, navigation, and slot content here, and app/ composes them.
 */
export interface FrontendModule {
  id: string;
  /** Reachable without signing in. Pages must be lazy-loaded. */
  public?: RouteObject[];
  /** Behind the guard (when a module provides one), inside the layout (likewise). */
  protected?: RouteObject[];
  /** Entries for the app's navigation, rendered by whichever module provides the layout. */
  nav?: NavItem[];
  /** Content for named places in the layout, e.g. the user menu in "sidebar-footer". */
  slots?: Partial<Record<SlotName, ReactNode>>;
  /** Wraps all protected routes; renders <Outlet /> when access is allowed. At most one module. */
  guard?: ReactNode;
  /** The frame around protected pages; renders <Outlet />. At most one module. */
  layout?: ReactNode;
  /** Wraps the whole app, e.g. to provide AccessContext. Providers nest in registry order. */
  provider?: ComponentType<{ children: ReactNode }>;
}
`);

file("apps/web/src/shared/composition.tsx", `import { createContext, useContext } from "react";
import type { ComponentType, ReactNode } from "react";

/** One navigation entry a module contributes. */
export interface NavItem {
  label: string;
  to: string;
  icon?: ComponentType<{ className?: string }>;
  /** Group heading; entries without one form the first, unlabeled group. */
  group?: string;
  /** Lower comes first within its group. */
  order?: number;
  /** Shown only to users who hold it (see useCan). The backend still enforces it. */
  permission?: string;
}

/** Named places in the layout that modules can fill. */
/**
 * Where modules put content into another module's screen. Open by design: a module hosting a
 * slot names it "<owner>:<place>" (e.g. "user-menu:items", "settings:sections") and documents
 * it; the frame's own are "sidebar-footer", "header-end", and "shell:scope" (the company/branch
 * picker an organization module puts in the header).
 */
export type SlotName = "sidebar-footer" | "header-end" | "shell:scope" | (string & {});

export interface Composition {
  nav: NavItem[];
  slots: Partial<Record<SlotName, ReactNode[]>>;
}

const CompositionContext = createContext<Composition>({ nav: [], slots: {} });

/** Provided once by app/ from the registered modules. */
export const CompositionProvider = CompositionContext.Provider;

/** Navigation entries from every module, sorted by order. */
export function useNavItems(): NavItem[] {
  return useContext(CompositionContext).nav;
}

/** Everything modules put into the named slot, in registration order. */
export function useSlot(name: SlotName): ReactNode[] {
  return useContext(CompositionContext).slots[name] ?? [];
}
`);

file("apps/web/src/app/modules.ts", `// Every frontend module — the one place a module is registered.
// Tooling inserts lines between the rudis:* markers. Keep the markers; add modules between
// them, never around them.
import type { FrontendModule } from "@/shared/types/frontend-module";
// rudis:modules:imports:begin
import { authModule } from "@/modules/auth/module";
import { dashboardModule } from "@/modules/dashboard/module";
// rudis:modules:imports:end

export const frontendModules: FrontendModule[] = [
  // rudis:modules:begin
  authModule,
  dashboardModule,
  // rudis:modules:end
];
`);

file("apps/web/src/app/composition.ts", `import { Fragment, createElement } from "react";
import type { Composition, SlotName } from "@/shared/composition";
import { frontendModules } from "@/app/modules";

// Each module's slot content is keyed by the module, so a slot renders as a proper list.
const slots: Composition["slots"] = {};
for (const m of frontendModules) {
  for (const [name, node] of Object.entries(m.slots ?? {})) {
    (slots[name as SlotName] ??= []).push(createElement(Fragment, { key: m.id }, node));
  }
}

/** Providers modules contribute, outermost first. */
export const moduleProviders = frontendModules.flatMap((m) => (m.provider ? [m.provider] : []));

/** Navigation and slot content gathered from every registered module. */
export const composition: Composition = {
  nav: frontendModules
    .flatMap((m) => m.nav ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  slots,
};
`);

file("apps/web/src/app/routes/index.tsx", `import { Navigate, createBrowserRouter } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { ROUTE_PATHS } from "@/app/routes/route-paths";
import { frontendModules } from "@/app/modules";
import { BareLayout } from "@/app/layouts/BareLayout";
import { NotFoundPage, RouteErrorPage } from "@/shared/components/feedback/RouteError";

const publicRoutes = frontendModules.flatMap((m) => m.public ?? []);
// An unknown address inside the app shows "not found" in the app's own frame.
let protectedRoutes: RouteObject[] = [...frontendModules.flatMap((m) => m.protected ?? []), { path: "*", element: <NotFoundPage /> }];

// A layout module frames the protected pages (BareLayout until one is installed); a guard
// module decides who reaches them.
const layout = frontendModules.find((m) => m.layout)?.layout ?? <BareLayout />;
protectedRoutes = [{ element: layout, children: protectedRoutes }];
const guard = frontendModules.find((m) => m.guard)?.guard;
if (guard) protectedRoutes = [{ element: guard, children: protectedRoutes }];

// One root catches whatever a page throws (or a page chunk an older tab can no longer load)
// with the app's own error page instead of the router's built-in one.
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: ROUTE_PATHS.home, element: <Navigate to={ROUTE_PATHS.start} replace /> },
      ...publicRoutes,
      ...protectedRoutes,
    ],
  },
]);
`);

file("apps/web/src/modules/auth/module.tsx", `import { lazy } from "react";
import type { FrontendModule } from "@/shared/types/frontend-module";

const LoginPage = lazy(() => import("@/modules/auth/pages/LoginPage"));

export const AUTH_PATHS = {
  login: "/login",
} as const;

export const authModule: FrontendModule = {
  id: "auth",
  public: [{ path: AUTH_PATHS.login, element: <LoginPage /> }],
};
`);

file("apps/web/src/modules/dashboard/module.tsx", `import { lazy } from "react";
import { LayoutDashboard } from "lucide-react";
import type { FrontendModule } from "@/shared/types/frontend-module";

const DashboardPage = lazy(() => import("@/modules/dashboard/pages/DashboardPage"));

export const DASHBOARD_PATHS = {
  home: "/dashboard",
} as const;

export const dashboardModule: FrontendModule = {
  id: "dashboard",
  protected: [{ path: DASHBOARD_PATHS.home, element: <DashboardPage /> }],
  nav: [{ label: "Dashboard", to: DASHBOARD_PATHS.home, icon: LayoutDashboard, order: 0 }],
};
`);

file("apps/web/src/shared/components/feedback/LoadingState.tsx", `import { Spinner } from "@/shared/components/primitives/spinner";

export function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
      <Spinner />
      <span aria-hidden="true">Memuat…</span>
    </div>
  );
}
`);

file("apps/web/src/shared/components/feedback/RouteError.tsx", `import type { ReactNode } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { Button } from "@/shared/components/primitives/button";

function Message({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      <div className="mt-2">{action}</div>
    </div>
  );
}

/** An address no module serves. */
export function NotFoundPage() {
  return (
    <Message
      title="Halaman tidak ditemukan"
      body="Alamat ini tidak ada atau sudah dipindahkan."
      action={
        <Button asChild variant="outline">
          <Link to="/">Kembali ke beranda</Link>
        </Button>
      }
    />
  );
}

/**
 * What the router shows when a page throws. A page chunk that fails to load usually means the
 * app was updated while this tab was open: reloading fetches the new version.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  const stale = error instanceof Error && /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message);
  return (
    <Message
      title={stale ? "Aplikasi baru saja diperbarui" : "Terjadi kesalahan"}
      body={stale ? "Muat ulang halaman untuk memakai versi terbaru." : "Halaman ini gagal ditampilkan. Coba muat ulang; jika berulang, hubungi admin."}
      action={<Button onClick={() => window.location.reload()}>Muat ulang</Button>}
    />
  );
}
`);

file("apps/web/src/modules/auth/schemas/login.schema.ts", `import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Kata sandi minimal 8 karakter"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
`);

file("apps/web/src/modules/auth/pages/LoginPage.tsx", `import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/shared/components/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/primitives/card";
import { Input } from "@/shared/components/primitives/input";
import { Label } from "@/shared/components/primitives/label";
import { loginSchema } from "@/modules/auth/schemas/login.schema";
import type { LoginFormValues } from "@/modules/auth/schemas/login.schema";

type FieldErrors = Partial<Record<keyof LoginFormValues, string>>;

export default function LoginPage() {
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const result = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginFormValues;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-xl">Masuk</CardTitle>
          <CardDescription>Gunakan akun Anda untuk melanjutkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Kata sandi</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
              />
              {errors.password && <p id="password-error" className="text-sm text-destructive">{errors.password}</p>}
            </div>
            <Button type="submit" className="w-full">Masuk</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
`);

file("apps/web/src/modules/dashboard/services/health.service.ts", `import { httpClient } from "@/shared/services/http-client";

export interface HealthResponse {
  success: boolean;
  message: string;
  data: unknown;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await httpClient.get<HealthResponse>("/api/v1/health");
  return data;
}
`);

file("apps/web/src/modules/dashboard/stores/health.store.ts", `import { create } from "zustand";
import { fetchHealth } from "@/modules/dashboard/services/health.service";
import type { HealthResponse } from "@/modules/dashboard/services/health.service";

interface HealthState {
  status: "idle" | "loading" | "success" | "error";
  result: HealthResponse | null;
  error: string | null;
  check: () => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  status: "idle",
  result: null,
  error: null,
  check: async () => {
    set({ status: "loading", error: null });
    try {
      const result = await fetchHealth();
      set({ status: "success", result });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Kesalahan tidak diketahui" });
    }
  },
}));
`);

file("apps/web/src/modules/dashboard/pages/DashboardPage.tsx", `import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/primitives/card";
import { Spinner } from "@/shared/components/primitives/spinner";
import { useHealthStore } from "@/modules/dashboard/stores/health.store";

export default function DashboardPage() {
  const { status, result, error, check } = useHealthStore();

  useEffect(() => {
    check();
  }, [check]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Kesehatan API</CardTitle>
          <CardDescription>GET /api/v1/health</CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" && <Spinner />}
          {status === "error" && <p className="text-sm text-destructive">{error}</p>}
          {status === "success" && (
            <pre className="font-mono text-sm">{JSON.stringify(result, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
`);

// Pages carry no outer padding or frame of their own: the layout owns them.
file("apps/web/src/app/layouts/BareLayout.tsx", `import { Outlet } from "react-router-dom";

/** The frame around protected pages until a layout module (an app shell) is installed. */
export function BareLayout() {
  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <Outlet />
    </main>
  );
}
`);

file("apps/web/src/shared/services/http-client.ts", `import axios from "axios";
import { getScope } from "@/shared/scope";

export const httpClient = axios.create({
  // Empty = same origin. Proxied by Vite in dev, served by the same container in
  // production. Only set VITE_API_BASE_URL when web and api are deployed separately.
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  // A separate API origin only receives the session cookie when asked to.
  withCredentials: Boolean(import.meta.env.VITE_API_BASE_URL),
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// Hooks for the auth module, so it plugs in without editing this file.
let authToken: string | null = null;
const unauthorizedHandlers = new Set<() => void>();

/** Sets the bearer token sent with every request; null clears it. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Runs handler whenever the API answers 401. Returns a function that removes it. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

httpClient.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = \`Bearer \${authToken}\`;
  // The company/branch this tab works in; the API checks it against the user's placement.
  const scope = getScope();
  if (scope) config.headers["X-Scope"] = scope;
  return config;
});

httpClient.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    unauthorizedHandlers.forEach((handler) => handler());
  }
  return Promise.reject(error);
});
`);

file("apps/web/src/shared/types/api.ts", `// The API envelope (.claude/rules/api-standard.md), as the frontend sees it.

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ApiPage<T> extends ApiSuccess<T[]> {
  meta: PageMeta;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors: ApiFieldError[] | unknown[];
}
`);

file("apps/web/src/shared/services/api-error.ts", `import axios from "axios";
import type { ApiFailure, ApiFieldError } from "@/shared/types/api";

function failure(err: unknown): ApiFailure | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const body = err.response?.data as Partial<ApiFailure> | undefined;
  return body && body.success === false ? (body as ApiFailure) : undefined;
}

/** The API's own message for a failed request, or a plain fallback when there is none. */
export function apiErrorMessage(err: unknown, fallback = "Permintaan gagal. Coba lagi."): string {
  return failure(err)?.message ?? (err instanceof Error && !axios.isAxiosError(err) ? err.message : fallback);
}

/** Field errors from a 422 (validator.FieldError on the backend), keyed by field name. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of (failure(err)?.errors ?? []) as ApiFieldError[]) {
    if (e && typeof e.field === "string") out[e.field] ??= e.message;
  }
  return out;
}
`);

file("apps/web/src/shared/services/api-endpoints.ts", `export const API = {
  base: "/api/v1",
} as const;
`);

// theme.css is the Tailwind entry and the token contract (references/frontend.md);
// globals.css holds app-wide styles beyond it.
template("web/theme.css", "apps/web/src/theme/theme.css");
file("apps/web/src/theme/fonts.ts", `// Font imports for the theme (e.g. "@fontsource-variable/inter"). The scaffold uses system
// fonts; a preset replaces this file together with theme.css.
export {};
`);
file("apps/web/src/styles/globals.css", `/* App-wide styles beyond the theme. Tailwind and every token come from theme.css. */
@import "../theme/theme.css";
`);
// The minimum shadcn primitives the starter pages need. The rest come from
// \`npx shadcn@latest add\` or the module library.
for (const p of ["badge", "button", "card", "dialog", "input", "label", "skeleton", "spinner"]) {
  template(`web/primitives/${p}.tsx`, `apps/web/src/shared/components/primitives/${p}.tsx`);
}
template("web/field-classes.ts", "apps/web/src/shared/lib/field-classes.ts");

// Frontend empty dirs (structure scaffold) — modules with real content still get the
// remaining stub subfolders so every module has the full seven-folder shape.
function scaffoldWebModuleKeep(mod) {
  keep(
    `apps/web/src/modules/${mod}/pages`,
    `apps/web/src/modules/${mod}/components`,
    `apps/web/src/modules/${mod}/services`,
    `apps/web/src/modules/${mod}/schemas`,
    `apps/web/src/modules/${mod}/stores`,
    `apps/web/src/modules/${mod}/hooks`,
    `apps/web/src/modules/${mod}/types`,
  );
}
["auth", "dashboard"].forEach(scaffoldWebModuleKeep);

keep(
  "apps/web/public",
  "apps/web/src/shared/components/ui", "apps/web/src/shared/components/patterns",
  "apps/web/src/shared/layouts", "apps/web/src/shared/stores", "apps/web/src/shared/hooks",
  "apps/web/src/shared/constants",
);

// ---------------------------------------------------------------------------
// apps/api — backend base per stack
// ---------------------------------------------------------------------------
function scaffoldModuleKeep(base, mod) {
  keep(
    `${base}/${mod}/contracts`,
    `${base}/${mod}/ports`,
    `${base}/${mod}/application`,
    `${base}/${mod}/domain/events`,
    `${base}/${mod}/infrastructure`,
    `${base}/${mod}/presentation`,
  );
}

if (backend === "go") {
  file("apps/api/go.mod", `module ${goModule}

go 1.26

require (
	github.com/go-sql-driver/mysql v1.8.1
	github.com/joho/godotenv v1.5.1
)
`);
  file("apps/api/.air.toml", `root = "."
tmp_dir = "tmp"

[build]
# Always ".exe", on every OS. Windows only runs files with an executable extension: a plain
# "tmp/main" builds fine but air cannot start it, so dev:api stops. macOS/Linux run
# "main.exe" just the same, so one committed config works for the whole team.
cmd = "go build -o ./tmp/main.exe ./cmd/server"
bin = "./tmp/main.exe"
include_ext = ["go", "tpl", "tmpl", "html"]
exclude_dir = ["tmp", "vendor", "node_modules", "migrations"]

[log]
time = true

[misc]
clean_on_exit = true
`);
  // Every module adds its own sql: block between the markers (one generated package per
  // module keeps its generated queries private to it). sqlc refuses a config with no block at
  // all ("no packages"); scripts/sqlc.mjs skips it until a module with queries is in.
  file("apps/api/sqlc.yaml", `version: "2"
sql:
  # rudis:sqlc:begin
  # rudis:sqlc:end
`);
  // The kernel — the stable surface every module is built against (references/backend-go.md).
  for (const rel of [
    "cmd/server/main.go",
    "internal/config/config.go",
    "internal/database/database.go",
    "internal/kernel/auth.go",
    "internal/kernel/authz.go",
    "internal/kernel/kernel.go",
    "internal/kernel/jobs.go",
    "internal/kernel/jobs_test.go",
    "internal/kernel/calendar.go",
    "internal/kernel/calendar_test.go",
    "internal/kernel/audit.go",
    "internal/kernel/audit_test.go",
    "internal/kernel/clock.go",
    "internal/kernel/scope.go",
    "internal/kernel/scope_test.go",
    "internal/kernel/tx.go",
    "internal/kernel/tx_test.go",
    "internal/kernel/tasks.go",
    "internal/kernel/events.go",
    "internal/kernel/events_test.go",
    "internal/kernel/http.go",
    "internal/kernel/kernel_mysql_test.go",
    "internal/kernel/kerneltest/kerneltest.go",
    "internal/kernel/kerneltest/kerneltest_test.go",
    "internal/modules/registry.go",
    "internal/server/server.go",
    "internal/server/middleware.go",
    "internal/server/middleware_test.go",
    "internal/shared/apperror/apperror.go",
    "internal/shared/logger/logger.go",
    "internal/shared/pagination/pagination.go",
    "internal/shared/request/request.go",
    "internal/shared/request/request_test.go",
    "internal/shared/request/stream.go",
    "internal/shared/request/stream_test.go",
    "internal/shared/response/response.go",
    "internal/shared/validator/validator.go",
  ]) {
    template(`go/${rel}.tmpl`, `apps/api/${rel}`, { __GO_MODULE__: goModule });
  }
  // Timestamp-versioned, so migrations added on two branches never collide. golang-migrate
  // fails `up` on an empty directory, which would break the first deploy — hence a no-op
  // baseline that also creates schema_migrations.
  const baseline = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  file(`apps/api/migrations/${baseline}_baseline.up.sql`, `-- Baseline: golang-migrate fails \`up\` on an empty migrations directory.\nSELECT 1;\n`);
  file(`apps/api/migrations/${baseline}_baseline.down.sql`, `SELECT 1;\n`);
  // The kernel's own tables (tasks, schedules) — right after the baseline.
  const kernelMigration = String(BigInt(baseline) + 1n);
  for (const dir of ["up", "down"]) template(`go/migrations/kernel_6.${dir}.sql.tmpl`, `apps/api/migrations/${kernelMigration}_kernel_6.${dir}.sql`, {});
  file("scripts/sqlc.mjs", `#!/usr/bin/env node
// sqlc wrapper. sqlc refuses a config with no sql: block ("no packages") — the normal state
// of a project until a module with queries is installed — so skip instead of failing.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!/^\\s*- engine:/m.test(readFileSync("apps/api/sqlc.yaml", "utf8"))) {
  console.log("sqlc: no module has queries yet — nothing to generate.");
  process.exit(0);
}
const r = spawnSync("sqlc", ["generate"], { cwd: "apps/api", stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
`);
  file("scripts/check-migrations.mjs", `#!/usr/bin/env node
// golang-migrate keeps ONE version per database and only applies files above it. A migration
// added on a branch with a timestamp older than one already merged would never run anywhere
// that ran the newer one — silently. CI runs this against the base commit; it fails on such a
// file, and --fix gives it (and its .down) a fresh timestamp after the newest one.
//
// Usage: node scripts/check-migrations.mjs <base-commit> [--fix]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";

const DIR = "apps/api/migrations";
const [base, flag] = process.argv.slice(2);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const version = (f) => f.match(/^(\\d{14})_/)?.[1];

if (!base || /^0+$/.test(base)) {
  console.log("check-migrations: no base commit (first push of a branch) — skipped");
  process.exit(0);
}
try {
  git("cat-file", "-e", \`\${base}^{commit}\`);
} catch {
  console.log(\`check-migrations: \${base} is not in this checkout (fetch-depth 0?) — skipped\`);
  process.exit(0);
}
const before = git("ls-tree", "--name-only", \`\${base}:\${DIR}\`).split("\\n").map(version).filter(Boolean);
const newest = before.sort().at(-1) ?? "0";
const added = git("diff", "--name-only", "--diff-filter=A", base, "--", DIR)
  .split("\\n").filter(Boolean).map((p) => p.split("/").at(-1)).filter((f) => version(f));
const late = [...new Set(added.filter((f) => version(f) <= newest).map((f) => f.replace(/\\.(up|down)\\.sql$/, "")))];

if (late.length === 0) {
  console.log(\`check-migrations: \${added.length} new migration file(s), all after \${newest}\`);
  process.exit(0);
}
if (flag !== "--fix") {
  console.error(\`✗ older than \${newest}, the newest migration on the base branch — they would never run:\`);
  for (const b of late) console.error(\`  \${b}\`);
  console.error("  Fix: node scripts/check-migrations.mjs " + base + " --fix   (renames them; they have not run anywhere yet)");
  process.exit(1);
}
// Fresh, ordered timestamps after everything that exists — on the base branch and here.
const all = readdirSync(DIR).map(version).filter(Boolean).concat(newest).sort();
let t = Math.max(Date.now(), Date.parse(all.at(-1).replace(/^(\\d{4})(\\d\\d)(\\d\\d)(\\d\\d)(\\d\\d)(\\d\\d)$/, "$1-$2-$3T$4:$5:$6Z")) + 1000);
const lockFile = "modules.lock.json";
let lock = existsSync(lockFile) ? readFileSync(lockFile, "utf8") : null;
for (const oldBase of late.sort()) {
  const stamp = new Date(t).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const newBase = stamp + oldBase.slice(14);
  for (const dir of ["up", "down"]) {
    if (existsSync(\`\${DIR}/\${oldBase}.\${dir}.sql\`)) renameSync(\`\${DIR}/\${oldBase}.\${dir}.sql\`, \`\${DIR}/\${newBase}.\${dir}.sql\`);
  }
  if (lock) lock = lock.replaceAll(\`"\${oldBase}"\`, \`"\${newBase}"\`);
  console.log(\`  \${oldBase} → \${newBase}\`);
  t += 1000;
}
if (lock) writeFileSync(lockFile, lock);
console.log("✓ renamed — commit the change");
`);

  file("scripts/migrate.mjs", `#!/usr/bin/env node
// golang-migrate wrapper that works the same in PowerShell, cmd, and sh.
// npm runs scripts through cmd.exe on Windows, which does not expand $VAR — so the DB
// connection is read here from .env and passed as a literal argument instead.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\\r?\\n/)) {
    const m = line.match(/^\\s*([A-Z0-9_]+)\\s*=\\s*(.*)\\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const dsn = process.env.DB_DSN;
if (!dsn) {
  console.error("DB_DSN not found. Copy .env.example to .env and fill in DB_DSN.");
  process.exit(1);
}

// multiStatements: a migration file may hold several statements (a table and its seed rows).
// No shell: the DSN's "tcp(host:port)" would be parsed as shell syntax.
const url = \`mysql://\${dsn}\${dsn.includes("?") ? "&" : "?"}multiStatements=true\`;
const r = spawnSync("migrate", ["-path", "migrations", "-database", url, ...process.argv.slice(2)], {
  cwd: "apps/api",
  stdio: "inherit",
});
if (r.error) console.error(\`migrate: \${r.error.message} — install golang-migrate (references/backend-go.md)\`);
process.exit(r.status ?? 1);
`);
}

if (backend === "nestjs") {
  file("apps/api/package.json", JSON.stringify({
    name: "api", private: true, version: "0.1.0",
    scripts: {
      "start": "node dist/main.js",
      "start:dev": "nest start --watch",
      "build": "nest build",
      "prisma:migrate": "prisma migrate dev",
      "prisma:deploy": "prisma migrate deploy",
      "prisma:reset": "prisma migrate reset",
      "prisma:generate": "prisma generate",
    },
    dependencies: {
      "@nestjs/common": "^10.0.0", "@nestjs/core": "^10.0.0",
      "@nestjs/config": "^3.0.0", "@nestjs/serve-static": "^4.0.0",
      "@nestjs/platform-express": "^10.0.0", "@prisma/client": "^5.0.0",
      "reflect-metadata": "^0.2.0", "rxjs": "^7.8.0",
    },
    devDependencies: {
      "@nestjs/cli": "^10.0.0", "@nestjs/schematics": "^10.0.0",
      prisma: "^5.0.0", typescript: "^5.6.0",
      "@types/node": "^20.0.0",
    },
  }, null, 2) + "\n");
  file("apps/api/nest-cli.json", JSON.stringify({
    $schema: "https://json.schemastore.org/nest-cli",
    collection: "@nestjs/schematics",
    sourceRoot: "src",
    entryFile: "main",
    compilerOptions: { deleteOutDir: true },
  }, null, 2) + "\n");
  file("apps/api/prisma/schema.prisma", `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
}
`);
  file("apps/api/src/main.ts", `import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // /readyz stays outside the prefix: it is the image HEALTHCHECK / deploy.sh probe.
  app.setGlobalPrefix("api/v1", { exclude: ["readyz"] });
  await app.listen(process.env.APP_PORT ?? 8080);
}
bootstrap();
`);
  file("apps/api/src/app.controller.ts", `import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return { success: true, message: "ok", data: null };
  }
  // Readiness probe (unprefixed). Once the database is wired, check it here and throw a
  // ServiceUnavailableException while it is unreachable.
  @Get("readyz")
  readyz() {
    return { success: true, message: "ready", data: null };
  }
}
`);
  file("apps/api/src/app.module.ts", `import { existsSync } from "node:fs";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { AppController } from "./app.controller";

// Skipped without error when PUBLIC_DIR is empty or the directory doesn't exist —
// that's the normal case in dev, where the frontend is served by Vite instead.
const publicDir = process.env.PUBLIC_DIR;
// NOTE: exclude patterns are matched with the path-to-regexp version @nestjs/serve-static
// bundles (0.2.5 as of this writing), where a bare trailing "*" is a literal character, not
// a wildcard — "/api/v1*" never matches anything and silently lets the SPA fallback shadow
// every /api/v1 route. "(.*)" is the wildcard syntax that version actually supports.
const serveStatic = publicDir && existsSync(publicDir)
  ? [ServeStaticModule.forRoot({ rootPath: publicDir, exclude: ["/api/v1", "/api/v1/(.*)", "/readyz"] })]
  : [];

@Module({
  // .env lives at the repo root; the API runs from apps/api, hence "../../.env".
  // A local .env is also checked as a fallback. Missing files are ignored — in
  // the container, env is injected via env_file.
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    ...serveStatic,
  ],
  controllers: [AppController],
})
export class AppModule {}
`);
  file("apps/api/tsconfig.json", JSON.stringify({
    compilerOptions: {
      module: "commonjs", target: "ES2021", experimentalDecorators: true,
      emitDecoratorMetadata: true, outDir: "./dist", baseUrl: "./", strict: true,
      strictPropertyInitialization: false, esModuleInterop: true, skipLibCheck: true,
    },
  }, null, 2) + "\n");
  keep("apps/api/src/shared");
  for (const m of starterApiModules) scaffoldModuleKeep("apps/api/src/modules", m);
}

if (backend === "express") {
  file("apps/api/package.json", JSON.stringify({
    name: "api", private: true, version: "0.1.0",
    scripts: {
      "start": "node dist/index.js",
      "dev": "nodemon",
      "build": "tsc -p tsconfig.json",
    },
    dependencies: { express: "^4.19.0", dotenv: "^16.4.0" },
    devDependencies: {
      nodemon: "^3.1.0", typescript: "^5.6.0", "ts-node": "^10.9.0",
      "@types/express": "^4.17.0", "@types/node": "^20.0.0",
    },
  }, null, 2) + "\n");
  file("apps/api/nodemon.json", JSON.stringify({
    watch: ["src"], ext: "ts", exec: "ts-node src/index.ts",
  }, null, 2) + "\n");
  file("apps/api/tsconfig.json", JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "CommonJS", moduleResolution: "node",
      outDir: "./dist", rootDir: "./src", strict: true, esModuleInterop: true, skipLibCheck: true,
    },
    include: ["src"],
  }, null, 2) + "\n");
  file("apps/api/src/index.ts", `import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import express from "express";

// .env lives at the repo root; the API runs from apps/api. Errors are ignored:
// in the container, env is injected via env_file.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const app = express();
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.json({ success: true, message: "ok", data: null });
});
// Readiness probe for the image HEALTHCHECK and deploy.sh. Once the database is wired,
// check it here and answer 503 while it is unreachable.
app.get("/readyz", (_req, res) => {
  res.json({ success: true, message: "ready", data: null });
});

const publicDir = process.env.PUBLIC_DIR;
if (publicDir && fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
}

const port = process.env.APP_PORT ?? 8080;
app.listen(port, () => console.log(\`api listening on :\${port}\`));
`);
  file("apps/api/MIGRATION.md", `# Migration tool: TBD

The Express migration tool is **not locked** by the Rudis standard.
Decide on a tool (e.g. Knex, Drizzle, Prisma, node-pg-migrate) and document it here
before implementing migrations.
`);
  keep("apps/api/src/shared");
  for (const m of starterApiModules) scaffoldModuleKeep("apps/api/src/modules", m);
}

// scripts/ at repo root (kept for project scripts)
keep("scripts");

// ---------------------------------------------------------------------------
// Write everything
// ---------------------------------------------------------------------------
let written = 0;
for (const [rel, content] of Object.entries(files)) {
  const abs = join(targetDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  written++;
}
for (const dir of keepDirs) {
  const abs = join(targetDir, dir, ".gitkeep");
  mkdirSync(join(targetDir, dir), { recursive: true });
  writeFileSync(abs, "");
  written++;
}

process.stdout.write(
  `\n✓ Scaffolded "${name}" (${backend}) into ${targetDir}\n` +
  `  ${written} files written.\n\n` +
  `Next steps:\n` +
  `  1. Read the matching reference(s) in the skill and fill in modules + knowledge/.\n` +
  `  2. cp .env.example .env  and adjust.\n` +
  `  3. npm install\n` +
  `  4. npm run dev:web   /   npm run dev:api\n` +
  (backend === "go" ? `  5. cd apps/api && go mod tidy   (commit go.sum — the image build needs it)\n` : "") +
  `\nDeploy target: ${targetLabel} as "${slug}" — facts in knowledge/DEPLOYMENT.md.\n` +
  (missingDeploy.length
    ? `  ⚠ Not set yet: ${missingDeploy.join(", ")}. Placeholders were written; deploy.sh refuses to\n` +
      `    run until they are filled. Resolve the target first (SKILL.md › Step 0b) — never guess a port.\n`
    : "")
);
