---
name: rudis-monorepo
description: Use this skill whenever the user asks to create, scaffold, bootstrap, plan, audit, or restructure a monorepo, or to prepare or audit its deploy to a server. Enforces the locked Rudis standard — apps/web (React 19 + Tailwind 4), apps/api modular monolith (Go / NestJS / Express i.e. plain Node.js) with modules that never import each other (ports + contracts, wired in one composition root), a Claude Code knowledge gateway, /api/v1 conventions, and the standard deployment (one image built in CI → GHCR and only pulled by the server, host-level shared MySQL with one DB + user per app, unique 127.0.0.1 port behind host nginx + certbot). Before any frontend UI it researches on the internet how that kind of app (POS, ERP, booking, dashboard, landing page…) is ideally designed today and writes a design brief first. Before writing features it assembles what the rudis module library already has (auth, users, app shell, UI kits, theme presets) with module.mjs and builds only what is custom; also use it to install, upgrade, detach, or promote library modules ("pasang modul", "upgrade modul"). Trigger even when the user only says "buatkan project", "setup fullstack repo", "new backend + frontend project", or names a stack like "Go + React monorepo" without the word "monorepo".
---

# Rudis Monorepo Standard

This skill is the source of truth for the agreed Rudis monorepo standard. Use it whenever the user asks to create, scaffold, plan, audit, or restructure a monorepo. Do not invent a different structure unless the user explicitly asks to override a rule.

## Operating Principle

**The backend stack is the very first thing to confirm — if the user did not explicitly name it in their prompt, ask before doing anything else (see [Step 0](#how-to-use-this-skill)).** Do not assume. Follow the locked standards. If a stack choice is **not locked** here and the user has not specified it, ask one concise clarification before implementing that part (e.g. Express migration tool).

The standard is intentionally anti-overengineering: a modular monolith with clean boundaries, simple data patterns, and a single Docker app container. Prefer the boring, locked choice over a fancier one.

**The deploy convention is binding on every generated project, whatever server it runs on**: build in CI, the server only pulls; one container per app; host MySQL; loopback port behind host nginx. No server is built into this skill — the target (SSH host, optional server playbook, registry owner, domain) is configuration, resolved in Step 0b. If the target keeps its own playbook, it wins over this skill where they disagree — see [references/docker-deployment.md](references/docker-deployment.md).

## How to use this skill

> ### Step 0 (MANDATORY FIRST): Confirm the backend stack
>
> Before scaffolding, planning, or writing **any** code, the backend stack must be known. This skill locks **three** backend stacks. The frontend is always React 19 + Tailwind 4 (locked) — never ask about it.
>
> | Pass to `--backend` | User might call it |
> |---|---|
> | `go` | Go, Golang |
> | `nestjs` | NestJS, Nest (Node.js framework) |
> | `express` | Express, ExpressJS, **plain Node.js / "NodeJS"** (Node without a framework) |
>
> **If the user did not explicitly name one of these in their prompt, STOP and ask which backend before doing anything else.** Never assume or silently default to one. A request like "buatkan fullstack project" / "setup repo backend + frontend" with no backend named MUST be answered with this question first. If the user says only "Node" or "NodeJS" with no framework, that maps to `express` (the locked plain-Node option) — confirm if there is any doubt. Only proceed once the stack is fixed.

> ### Step 0b: Resolve the deploy target, then collect the deploy facts
>
> No server is hard-coded in this skill. Resolve the target in this order and **never guess**:
>
> 1. **Existing repo** — `knowledge/DEPLOYMENT.md` owns the project's target (SSH host, playbook, slug, port, image, domain). Use it.
> 2. **Device config** — `~/.config/rudis-monorepo/targets.json` (resolve `~` to the user's home directory; never keep it inside this skill's folder, which an install replaces). No secrets go in it:
>    ```json
>    { "default": "<name>", "library": "<path to rudis-modules, optional>",
>      "targets": { "<name>": { "ssh_host": "<Host alias in ~/.ssh/config>", "playbook": "<path on the server> | null",
>          "registry_owner": "<GitHub owner>", "domain_suffix": "<example.com> | null", "backup_root": "/var/backups/rudis" } } }
>    ```
> 3. **Not configured** — ask the user: the SSH host alias (and whether its key and `~/.ssh/config` entry already exist — the user sets those up), whether the server keeps a playbook / app registry and where, the registry owner, and the domain. Then ask whether to save the answers to `targets.json`, and write it only on a yes. If the user has no server yet, scaffold without the deploy flags (the markers stay) and say so.
>
> | Flag | Fact | Source |
> |---|---|---|
> | `--slug` | server app name → `~/<slug>`, `<slug>-app`, `<slug>_db`, `<slug>_user` | default: `--name` lowercased, letters/digits only |
> | `--port` | unique `127.0.0.1` port on the server | the target's app registry / playbook if it keeps one, else ask; always confirm with `ssh <ssh-host> 'sudo ss -tlnp'` |
> | `--ghcr-owner` (`--repo`) | GitHub owner (and repo) → image `ghcr.io/<owner>/<repo>` | the target's `registry_owner`, the user, or the repo's remote |
> | `--domain` | public domain for the host nginx site | the user; may come later |
> | `--ssh-host`, `--playbook`, `--target` | how the project's docs reach the server | the resolved target |
>
> Reading the server is **read-only** (`ssh <ssh-host> 'cat <playbook>'`, `sudo ss -tlnp`). Never read secrets on the server, never guess a port, and never change the server (DB/user, nginx, certbot, `docker login`, deploy, registry edit) without the user's explicit go-ahead. If a fact is unknown, scaffold without its flag: a `__PLACEHOLDER__` marker is written and `deploy.sh` refuses to run until it's filled. Ask the backend question and these in one message.

1. **Scaffold the skeleton with the bundled script** — it lays down the full standard-compliant tree, config files, knowledge gateway, and `.claude/rules` deterministically so every project is identical. Use an absolute path to this skill's directory. The standard install location is `~/.claude/skills/rudis-monorepo` (global) or `<project>/.claude/skills/rudis-monorepo` (per-project). Do not use a relative path — the CWD when the skill runs is the user's project folder, not this skill's folder.
   ```bash
   # macOS / Linux
   node ~/.claude/skills/rudis-monorepo/scripts/scaffold.mjs \
     --name <project-name> --backend <go|nestjs|express> --dir <target-dir> \
     --slug <app> --port <host-port> --ghcr-owner <owner> --domain <domain> \
     --ssh-host <ssh-host> --playbook <path> --target <name>

   # Windows PowerShell
   node "$HOME/.claude/skills/rudis-monorepo/scripts/scaffold.mjs" `
     --name <project-name> --backend <go|nestjs|express> --dir <target-dir> `
     --slug <app> --port <host-port> --ghcr-owner <owner> --domain <domain> `
     --ssh-host <ssh-host> --playbook <path> --target <name>
   ```
   If the target directory already has files in it (e.g. an existing `.git/`), add `--force`.

   Run `node scripts/scaffold.mjs --help` for options. After scaffolding, read the relevant reference file(s) below and fill in project-specific code, modules, and `knowledge/` content.

   The local databases come from `node scripts/db-local.mjs`, which **the user runs in their own terminal** — it asks their MySQL admin password itself, so never ask for it, never run it for them, and never fill a DSN into `.env` or `.env.example` yourself. Until then, nothing in the project touches MySQL. A script that drops or rebuilds a database checks its target with `scripts/db-guard.mjs` first, and its refusals are tested on the guard, never by running it with a bad value — [references/local-database.md](references/local-database.md).
2. **Before building any UI, research the design** — follow [references/design-research.md](references/design-research.md): pin down the app type, users, primary device, and locale; research current sources on the internet (real products of that app type, a fitting design system, UX research); write the brief into `knowledge/DESIGN.md`; then build the screens through `frontend-design` from that brief. Never start UI from a generic template or from memory alone. Not needed when only restyling or fixing a screen the brief already covers. The brief also decides whether a theme preset from the module library is the starting point.
3. **Assemble from the module library before writing features** (Go backend) — follow [references/module-library.md](references/module-library.md): read the library's `CATALOG.md`, split the requirement into capabilities, decide per capability *install / install + adapt / build*, confirm that table with the user once, install with `module.mjs` (preset → ui kits → providers → consumers, ports wired), then build only what is custom — to the same standard, so it could join the library later. Applies to a new project and to every new feature.
4. **For auditing/restructuring an existing repo**, skip the script and check the repo against the [Final Checklist](#final-checklist) plus the relevant references.
5. **For deploy work on an existing repo** (preparing or fixing its deploy), compare it with what the scaffolder emits under `infra/`, `.github/workflows/`, `knowledge/DEPLOYMENT.md`, and `.claude/rules/deployment.md` — scaffold a throwaway copy with the same flags and diff against it.

## Read the right reference

The body below is the always-loaded summary. Detailed, stack-specific rules live in `references/` — read the file that matches the task:

| Topic | File |
|---|---|
| Knowledge gateway: `CLAUDE.md`, `knowledge/`, `.claude/rules/` | [references/knowledge-gateway.md](references/knowledge-gateway.md) |
| Backend modular-monolith rules (all stacks) | [references/backend-modular-monolith.md](references/backend-modular-monolith.md) |
| Go backend (kernel, module contract + registry, Air, golang-migrate, sqlc) | [references/backend-go.md](references/backend-go.md) |
| NestJS backend (Prisma, watch) | [references/backend-nestjs.md](references/backend-nestjs.md) |
| Express backend (nodemon) | [references/backend-express.md](references/backend-express.md) |
| Frontend `apps/web` (React 19, shadcn/ui, token contract, route registry, Zustand, Zod, Axios) | [references/frontend.md](references/frontend.md) |
| Design research before UI: what to research, source quality, the `knowledge/DESIGN.md` brief | [references/design-research.md](references/design-research.md) |
| Module library: find, install, wire, upgrade, and promote reusable modules (`module.mjs`, `modules.lock.json`) | [references/module-library.md](references/module-library.md) |
| API conventions + env standard | [references/api-standard.md](references/api-standard.md) |
| Local databases (`db-local.mjs`), the MySQL account plugin and Error 1524, guarding scripts that rebuild a database, `check-migrations` | [references/local-database.md](references/local-database.md) |
| Deployment: Docker image, CI → GHCR, deploy server (compose, deploy.sh, nginx, MySQL) | [references/docker-deployment.md](references/docker-deployment.md) |

## High-Level Monorepo Structure

```txt
project-name/
├── CLAUDE.md                 # AI gateway (concise, points to knowledge/)
├── knowledge/                # the project's ONE knowledge rack (see knowledge-gateway.md)
│   ├── INDEX.md
│   ├── SOURCE_PRIORITY.md    # which source wins when two disagree
│   ├── PROJECT.md ... DEPLOYMENT.md
│   └── decisions/            # ADRs
├── .claude/
│   └── rules/                # path-scoped technical rules
├── apps/
│   ├── api/                  # modular-monolith backend
│   └── web/                  # React 19 + Tailwind 4 frontend
├── packages/
│   ├── shared/               # truly reusable cross-app code only
│   └── api-contract/         # OpenAPI/schema/API contract docs
├── analysis/                 # per-requirement analysis artifacts (see analysis/README.md)
├── specs/                    # RUDIS SDD: one folder per build / install + adapt row (frozen once merged into main)
├── .rudis/                   # RUDIS SDD tooling + project constitution (see knowledge-gateway.md)
├── infra/
│   ├── docker/               # Dockerfile — the one image (web + api)
│   ├── deploy/               # server files: docker-compose.prod.yml, deploy.sh, .env.production.example
│   └── nginx/                # host nginx site template
├── .github/workflows/        # ci.yml + release-image.yml (build → GHCR)
├── scripts/
├── .env.example              # never a real .env with secrets
├── .dockerignore
├── .gitignore
├── docker-compose.yml        # local build check only — production is image-only
├── package.json
└── README.md
```

## Root Development Commands

Frontend and backend start **separately** from the root terminal:

```bash
npm run dev:web
npm run dev:api
```

Do not make `npm run dev` start both by default, and do not use `concurrently` as the default workflow unless the user explicitly asks for a combined command. Each command must run from the root. Per-stack script definitions are in the backend reference files.

## Stack-Locked Choices (summary)

These are fixed per stack — do not pick randomly. Details + examples in the references.

| | Go | NestJS | Express / Node |
|---|---|---|---|
| Watcher | Air | `nest start --watch` (`start:dev`) | nodemon |
| Migration | golang-migrate | Prisma | **not locked → ask** |
| DB access | sqlc + `database/sql` (not GORM) | Prisma | user-defined |

Forbidden as the default dev workflow: `go run main.go`, `node server.js`, production-mode start.

## Backend & Frontend (summary)

- **Backend** is always a Modular Monolith. Modules never import each other — not even another module's `contracts/`. A module offers `contracts/` and declares what it needs as ports in its own `ports/`; only the composition root connects them, through small adapters. Cross-module DB joins and foreign keys are forbidden. Full rules: [references/backend-modular-monolith.md](references/backend-modular-monolith.md). In Go, every module is built on the kernel (`kernel.Deps`, `shared/response`, `shared/apperror`, …) and wired only in `internal/modules/registry.go` — [references/backend-go.md](references/backend-go.md#the-kernel).
- **Frontend** is React 19 + Tailwind 4 on shadcn/ui (Radix) with react-router-dom (lazy routes; each module contributes routes, navigation, and slot content through the registry `app/modules.ts`), Zustand, Zod, Axios, and the `@/*` alias. Every color, font, radius, and shadow comes from the token contract in `src/theme/theme.css` through semantic classes — token names are fixed, values belong to the project or a preset. Use the `frontend-design` skill as the UI authority — if it isn't installed, install it first from the source in [references/frontend.md](references/frontend.md) rather than skipping it. Full rules: [references/frontend.md](references/frontend.md). Before the first UI, research how this kind of app is ideally designed today and write the brief to `knowledge/DESIGN.md` — [references/design-research.md](references/design-research.md).

## Deployment (summary)

- **One image, one container** for the whole monorepo, built only by `.github/workflows/release-image.yml` (after `ci` is green on `main`) and pushed to GHCR as `:<git-sha>`. The server only pulls — never `docker build`, never `build:` in the prod compose.
- On the server: `~/<slug>/` holds `docker-compose.prod.yml` (image-only, required `IMAGE_TAG`), `deploy.sh`, and `.env` (`chmod 600`, the only home of secrets). Deploy/rollback: `./deploy.sh <git-sha>` = preflight → pull → DB backup → migrate → up → wait for `/readyz`.
- Database: the host's shared MySQL, `<slug>_db` + `<slug>_user@'172.%'`, reached via `host.docker.internal`. Read `SELECT VERSION()` before `CREATE USER`: a new account uses `caching_sha2_password` on MySQL 8.0+; an existing `mysql_native_password` account on 8.0 is left as it is, and switched only before the server moves to 8.4+. Never a database container.
- Network: `127.0.0.1:<port>` only, host nginx site with its own `server_name` (never `default_server`), TLS via certbot.
- Image: non-root uid 10001, `ENTRYPOINT`, `HEALTHCHECK` on `/readyz`, migration tool inside.

Full rules, the generated files, and the incidents behind each rule: [references/docker-deployment.md](references/docker-deployment.md).

## Documentation Standard

There is a single knowledge rack, not a separate stakeholder-facing `docs/`: `knowledge/` holds
project brief, architecture, module map, API, database, frontend, backend, and deployment —
`knowledge/SOURCE_PRIORITY.md` resolves any disagreement between sources.

**One owner per fact.** Every fact is stated in one file; everything else points at it.
`.claude/rules/` is authoritative for what is allowed, `knowledge/` for what this project is,
ADRs for why a decision was taken, `CLAUDE.md` only for the few invariants worth paying
always-loaded context for. Before writing a fact into a second file, update the file that
already owns it instead — a helpful-looking copy is how two files end up both looking
authoritative and quietly disagreeing. Full rules, the ownership table, and why two racks were
rejected: [references/knowledge-gateway.md](references/knowledge-gateway.md).

A custom module specified with RUDIS SDD keeps RUDIS's own output locations (`specs/`, `.rudis/`,
a few `docs/` subfolders). None is a second knowledge rack: the generated
`.claude/rules/monorepo.md` lists each one and whether it is committed, and
[references/knowledge-gateway.md](references/knowledge-gateway.md#rudis-sdd-output) says why.

## Anti-Overengineering Rules

Do not use by default unless explicitly requested: Microservices, Kubernetes, Turborepo complexity, Nx, Redis, Memcache, TanStack libraries, multiple frontend containers, separate backend/frontend production containers, Dockerized database, cross-module foreign keys, cross-module joins, GORM (or GORM AutoMigrate) for Go.

## Final Checklist

Before delivering the structure or changing code, verify:

- Includes `apps/web` and `apps/api`?
- Includes `CLAUDE.md`, `knowledge/`, and `.claude/rules/`?
- Backend follows Modular Monolith: no module imports another (not even `contracts/`), needs declared in `ports/`, connections only in the composition root?
- No cross-module FKs or joins? Adapters in the composition root free of business logic?
- Backend watcher fixed by stack? Migration tool fixed for Go/NestJS (asked for Express)?
- For Go: golang-migrate, sqlc, `database/sql` — not GORM?
- Frontend uses React 19, Tailwind 4, shadcn/ui (`components.json`, `cn` package), react-router-dom, lazy routes, Zustand, Zod, Axios, `@/*`?
- Design researched before UI — current, dated sources (real products + design system + UX research) recorded with findings and direction in `knowledge/DESIGN.md`?
- `frontend-design` used for UI, working from that brief? Shared components domain-agnostic?
- Components use only semantic token classes — no raw colors? Every contract token still defined in `theme.css`?
- Modules wired only through their registries (`registry.go` for Go, `app/modules.ts`), `rudis:*` markers intact?
- Library checked before building: everything the catalog covers installed with `module.mjs` (not copied by hand), the assembly table confirmed with the user, `modules.lock.json` committed?
- Go: kernel present (`config`, `database`, `kernel`, `server`, `shared/`), `/readyz` pings the database, migrations timestamp-versioned?
- Root commands `npm run dev:web` and `npm run dev:api` are separate?
- Docker defaults to one app container + host-level database?
- Deploy facts settled (slug, port from the playbook, GHCR owner, domain) — or left as markers on purpose?
- Prod compose image-only with required `IMAGE_TAG`, `127.0.0.1:<port>:8080`, no DB service? CI builds the image; nothing builds on the server?
- Image non-root with `ENTRYPOINT` and a `/readyz` HEALTHCHECK? `deploy.sh` backs up the DB before migrating?
- `.claude/rules/deployment.md` and `knowledge/DEPLOYMENT.md` present, with no secret committed anywhere?
- `.env.example` present, with no real secrets?
- `knowledge/` matches the new file list, with no parallel `docs/` rack (only the RUDIS SDD output folders `.claude/rules/monorepo.md` lists)?
- RUDIS SDD in use: each `specs/<NNN>-<slug>/` named in its `analysis.md`, its contracts and tables moved to their owners with a `FROZEN.md` before handover, and the folder frozen once merged into main?
- `knowledge/SOURCE_PRIORITY.md` present?
- Every fact has one owner — no rule text copied between `.claude/rules/` files, no rule
  restated inside `knowledge/`, ADRs recording *why* rather than repeating *what*?
- `CLAUDE.md` restates only the always-loaded invariants and names `.claude/rules/` as
  authoritative for them?
- `MODULE_MAP.md` has owned-tables and external-integrations columns?
- `analysis/` present with its README?
