# Go Backend Standard

Read this together with [backend-modular-monolith.md](backend-modular-monolith.md) — the module boundary rules apply unchanged.

## Locked stack

```txt
Watcher          = Air                      (never `go run main.go`)
Migration        = golang-migrate
Database access  = sqlc
Driver           = database/sql + MySQL driver
ORM default      = NOT GORM
```

The generated `apps/api/cmd/server/main.go` loads `.env` via `github.com/joho/godotenv`
(`../../.env` first, since the API runs from `apps/api` while `.env` lives at the repo root;
then a local `.env` as fallback — errors from both are ignored, since in a container env comes
from `env_file`). Run `go mod tidy` once after scaffolding to resolve `go.sum`.

`migrate:up`/`migrate:down` run through `scripts/migrate.mjs`, a dependency-free Node wrapper
around the `migrate` CLI. This is deliberate: npm runs scripts through `cmd.exe` on Windows,
which does not expand `$DATABASE_URL`, so a literal `-database "$DATABASE_URL"` argument
fails there. The wrapper reads `DB_DSN` from `.env` itself and passes it through explicitly,
working the same in PowerShell, cmd, and sh.

Rules:

- Use `golang-migrate` for migrations.
- Use `sqlc` for type-safe DB access, generated **per module**: `sqlc.yaml` has one `sql:` block per module, reading from `internal/modules/<module>/infrastructure/queries` and writing to `internal/modules/<module>/infrastructure/sqlc`. A single project-wide `sqlc` package would let any module import any other module's generated queries, breaking the module boundary. **Every new module must add its own `sql:` block** — otherwise its queries never get generated.
- Use `database/sql` with the MySQL driver for the connection.
- Do not use GORM by default. GORM may be used only when the user explicitly asks.
- Do not use GORM AutoMigrate or ORM-based schema generation.
- Do not create cross-module ORM relations, preloads, associations, or foreign keys.

## Root commands (Go)

```json
{
  "scripts": {
    "dev:web": "npm run dev -w apps/web",
    "dev:api": "cd apps/api && air",
    "build:web": "npm run build -w apps/web",
    "build:api": "cd apps/api && go build -o ../../dist/api ./cmd/server",
    "migrate:up": "node scripts/migrate.mjs up",
    "migrate:down": "node scripts/migrate.mjs down 1",
    "migrate:create": "cd apps/api && migrate create -ext sql -dir migrations",
    "sqlc:generate": "node scripts/sqlc.mjs"
  }
}
```

## Watcher: `apps/api/.air.toml`

`npm run dev:api` must run `cd apps/api && air`. Install air from its current module path
(the old `cosmtrek/air` path is deprecated) and keep it recent — since v1.6x air stops the
running binary before rebuilding on Windows, which otherwise locks the `.exe` and fails the
rebuild:

```bash
go install github.com/air-verse/air@latest   # lands in $(go env GOPATH)/bin — put that on PATH
```

Always create `.air.toml`:

```toml
root = "."
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
```

Never drop the `.exe` from `cmd`/`bin` to make it "look Unix": air applies its Windows
`.exe` handling only to `full_bin`, not to `bin`, so on Windows a suffix-less binary is built
and then never runs — `npm run dev:api` just exits.

## Go structure

```txt
apps/api/
├── cmd/
│   └── server/
│       └── main.go            # assembles config → logger → database → kernel.Deps → server
├── internal/
│   ├── config/                # config.Load(), Get, Require
│   ├── database/              # Open (pool, parseTime), Ping
│   ├── kernel/                # Deps + Version — the contract modules build against
│   ├── server/                # health, /readyz, JSON 404, SPA, middleware
│   ├── shared/
│   │   ├── apperror/          # the client-facing error type
│   │   ├── logger/            # slog setup + request-scoped logger
│   │   ├── pagination/        # ?page=&limit= → Params, Meta
│   │   ├── request/           # DecodeJSON, PathInt64
│   │   ├── response/          # OK, Created, Paginated, Fail, Error — the envelope
│   │   └── validator/         # field-by-field input errors
│   └── modules/
│       ├── registry.go        # composition root: builds + mounts modules (rudis:* markers)
│       ├── adapter_order_productcatalog.go   # connects one port to a provider
│       └── order/             # example module
│           ├── contracts/
│           ├── ports/
│           ├── application/
│           ├── domain/
│           │   └── events/
│           ├── infrastructure/
│           │   ├── queries/
│           │   │   └── order.sql
│           │   ├── sqlc/
│           │   └── repository.go
│           ├── presentation/
│           └── order.module.go
├── migrations/
│   ├── 20261024093000_baseline.up.sql
│   ├── 20261024093000_baseline.down.sql
│   ├── 20261102101500_create_orders_table.up.sql
│   └── 20261102101500_create_orders_table.down.sql
├── sqlc.yaml
├── .air.toml
├── go.mod
└── go.sum
```

The scaffold creates everything above except the example module: a Go project starts with no
domain modules, and each one is built or installed from the module library through the
registry. The kernel files are copied from this skill's `scripts/templates/go/` — read them
there for the full code.

## The kernel

`internal/config`, `database`, `kernel`, `server`, and `shared/` are the **kernel**: the stable
surface every module — hand-written or from the module library — is built against.

- **`kernel.Deps`** (`Config`, `DB`, `Log`, `Auth`, `Authz`, `Jobs`, `Audit`, `Tx`, `Tasks`,
  `Events`, `Clock`, `Scope`, `HTTP`) is what a module's `New` receives. A module keeps what it
  needs and never reaches for globals.
- **`Deps.Auth`** is the one kernel-level port: authentication. A module guards a handler with
  `d.Auth.Require(h)` and reads the signed-in user with `d.Auth.UserID(r.Context())`; the
  composition root fills the slot with `d.Auth.Provide(...)` from whichever module does auth.
  It lives in the kernel rather than in each module's `ports/` because nearly every module needs
  it — and `users` (guarded by auth) is also what `auth` needs, so per-module ports would make
  the two depend on each other. Until a provider is set, guarded routes answer 401.
- **`Deps.Authz`** is authorization, the second kernel-level port. A module **declares** the
  permissions it guards with in `New` — `d.Authz.Declare(kernel.Permission{Name: "users.manage",
  Module: "users", Description: "…"})`, named `<module>.<action>` — and guards with
  `d.Authz.Require("users.manage", h)` (401 without a session, 403 without the permission) or
  checks `d.Authz.Can(ctx, …)`. Guarding with an undeclared permission panics at startup. Without
  a provider the policy is "signed in = allowed", so a module works alone; an authorization
  module (the library's `rbac`) fills the slot with `d.Authz.Provide(...)` and reads the catalog
  from `d.Authz.Permissions()`. Permissions come from code; who holds them is data.
  `d.Authz.Covers(ctx, target)` asks whether the signed-in user holds every permission the target
  user holds — a module managing people checks it before touching someone else's account.
  Two modules declaring one name stop the API; a **production** server with declared
  permissions and no provider refuses to start (development only warns).
- **`Deps.Jobs`** runs scheduled background work: `d.Jobs.Every("<module>.<job>", interval, fn)`
  in `New`. One scheduler for the whole app — at most two jobs at once, a job never overlaps
  itself, a panic is logged — started after the registry and stopped after the HTTP server drains.
  Each run holds a MySQL named lock scoped to the app's database, so while a deploy briefly runs
  two containers a job still runs in one place. A job that works through rows still claims them
  (`FOR UPDATE SKIP LOCKED`) and is safe to repeat; a run may be cut short by shutdown.
  **Calendar schedules** — `d.Jobs.Daily(name, "02:00", fn)`, `Weekly(name, time.Monday, "07:30",
  fn)`, `Monthly(name, 1 | kernel.LastDay, "23:00", fn)` — run in `APP_TIMEZONE`, once per tick
  across containers (the one that records the tick in `kernel_schedule_runs` runs it), catch up a
  tick missed within 24 h once (never one from before the job was first deployed) — looking
  again every minute, so a tick cut short by shutdown runs again and one whose container died is
  taken over once its timeout passed (`CatchUp(0)` gives that up) — time out after 30 min
  (`Timeout`, `CatchUp` options), and count
  failures in `kernel_schedules` (warned at 5 in a row; never switched off by themselves). A
  local time that does not exist (DST gap) fires at the first instant after it; one that exists
  twice fires at the first. A calendar job waits on real time, not `kerneltest`'s clock: test
  its function directly.
- **`Deps.Audit`** records who changed what: `d.Audit.Record(ctx, kernel.AuditEntry{Kind,
  Module, Action: "<thing>.<verb>", Target: "<type>:<id>", Summary, Data})`. `Kind` is
  `AuditChange` (default), `AuditAccess` (sensitive personal data viewed — NIK, salary, bank
  account), `AuditExport` (data downloaded), or `AuditSecurity` (failed sign-ins, permission
  changes): UU PDP Art. 46 asks a breach notice to say which data, when, and how. The kernel
  adds the time, the user (signed in, `Actor`, or the user a task acts for), the client IP, the
  request ID, and the scope (none — company 0, a system record — for a record made without one
  in an app with several companies, such as a failed sign-in). Inside `d.Tx` the sink writes in that transaction — the record
  commits or rolls back with the change. Without a provider a record is a log line; an audit
  module (the library's `audit-log`) stores it — `d.Audit.Provide(...)`. A storage failure is
  logged, not returned — but one that ends the transaction (a deadlock) still fails `d.Tx`.
  Never put secrets in `Data`.
- **`Deps.Tx`** makes changes in several modules commit or roll back together:
  `d.Tx.Do(ctx, func(ctx context.Context) error { … })`. The transaction travels in `ctx`; a
  repository builds its queries per call with `queries.New(d.Tx.Conn(ctx))` (the transaction
  when `ctx` carries one, else the pool), so a port called inside `Do` works inside the same
  transaction — modules never pass `*sql.Tx` around and never call `BeginTx`. A nested `Do` joins
  the outer one (no savepoint); only the outermost commits, **retries the whole closure** after a
  deadlock (MySQL 1213) or lock wait timeout (1205 — the kernel rolls back the rest of the
  transaction first; MySQL undoes only the statement), up to 4 attempts, and then runs the hooks
  of `d.Tx.AfterCommit(ctx, fn)` (dropped on rollback; immediate outside a transaction). Options:
  `kernel.ReadCommitted()`, `kernel.NoRetry()` (also from a nested `Do`: the whole transaction
  then never repeats). After a deadlock or a lost connection the transaction is gone on the
  server: the driver reports it wherever it surfaces (an Exec, a QueryRow's Scan, reading rows),
  later statements in it are refused, and `Do` fails with it — and retries — even when the code
  ignored the error. (The watch travels in `ctx`: a statement run on the pool with `fn`'s ctx,
  not through `d.Tx.Conn(ctx)`, counts as the transaction's too — another reason not to.) **Never call the outside world inside `Do`**
  (email, payment, tax APIs): a retry repeats it and a rollback cannot take it back — enqueue a
  task instead. Lock what you change with `SELECT … FOR UPDATE`, parents first, in ID order.
- **`Deps.Tasks`** is the durable background queue (table `kernel_tasks`):
  `d.Tasks.Register("<module>.<task>", handler, kernel.TaskKind{Lane, Concurrency, Timeout,
  MaxAttempts})` in `New`, `d.Tasks.Enqueue(ctx, kind, payload, kernel.After(d) | kernel.At(t) |
  kernel.Dedupe(key))` anywhere (`Dedupe`: at most one *waiting* task per key — one enqueued
  while it runs queues behind it, so work that reads the current state sees every change).
  Inside `d.Tx` the task is written in that transaction — it
  exists only if the transaction commits. Two lanes: `short` (2 workers, 60 s default timeout)
  and `long` (1 worker, 30 min) — with the 2 job slots (each holding its run lock's connection
  too), background work holds about 7 of the pool's 10 connections at most. A worker claims a task with `FOR UPDATE SKIP LOCKED` under a lease; the
  handler runs inside `d.Tx` and the task is marked done **in the same transaction**, only while
  the lease holds — so its database effects happen exactly once. A failure retries after 30 s,
  doubling up to 1 h, then the task is `failed` until an administrator retries or discards it
  (`List`, `Retry`, `Discard`); a dead worker's task is reclaimed when its lease expires (failed
  if that was its last attempt); done tasks are purged after 7 days. On `SIGTERM` workers stop
  claiming at once and finish what runs while requests drain; a task still running at the end
  is cancelled and goes back in the queue, its attempt not counted (a handler that ignores its
  cancelled ctx is abandoned after 3 s and reclaimed when its lease ends). Effects outside the
  database (email, an API) can repeat after a crash: make them idempotent. `NonTransactional: true` (long batch work that commits itself)
  makes database effects at-least-once too. A handler runs with the actor, scope, and request
  ID of the request that enqueued it (`kernel.ActorFrom(ctx)`, `kernel.ScopeFrom(ctx)`; no scope
  when it had none).
- **`Deps.Events`** carries what happened between modules that never import each other:
  `d.Events.Publish(ctx, "<module>.<thing>.<past-verb>", version, payload)` (a publisher declares
  its events — name, version, fields — in `module.json` `emits` and its README); subscribers are
  wired only in the composition root, `d.Events.On(name, "<module>.<reaction>", handler)`, written
  by the installer from `listens`. Each delivery is a task in the publisher's transaction: an
  event exists only if its change committed, survives a crash, and runs in the subscriber's own
  transaction — one failing subscriber neither blocks the others nor undoes the publisher. At
  least once, **not ordered**: subscribers check the document's version or time. There are no
  synchronous listeners — what must happen in the same transaction is a port call inside `d.Tx`.
  The payload is JSON: a subscriber decodes it into its own struct (no import of the
  publisher's `contracts/`). Within a version a publisher only adds fields.
- **`Deps.Clock`** is the time (`Now()`, UTC) and `APP_TIMEZONE` (`Location()`, default
  `Asia/Jakarta`; an invalid name stops the API). `kernel.Today(ctx, d.Clock)` is the business
  date in the request's scope (a branch's time zone, else the app's). Tests move it
  (`kerneltest`). The binary embeds the time zone database (`time/tzdata`).
- **`Deps.Scope`** — the company and branch a request works in: `kernel.ScopeFrom(ctx)`
  (`CompanyID` ≥ 1, `BranchID` 0 = the whole company, `Location`). `d.Auth.Require` resolves it
  for the signed-in user from the `X-Scope` header the web sends, through the resolver an
  organization module provides (`d.Scope.Provide`) — a scope the user is not placed in is
  refused (403). Without a resolver every request works in company 1, and so does work with no
  scope (a calendar job, a public route, a task either enqueues). With a resolver there is no
  default: `ScopeFrom` on a ctx without a scope panics (a failed task, a 500) rather than file
  data under the wrong company — background work over company data loops
  `d.Scope.Companies(ctx)` with `kernel.WithScope`, a public route picks its company itself, and
  `kernel.HasScope(ctx)` tells whether ctx carries one. Work that may run at installation level
  (an outbox worker, a reset-by-token email) asks `kernel.CompanyOf(ctx)` instead of
  `ScopeFrom`: the company, or `(0, false)` where `ScopeFrom` would panic; `d.Scope.Several()`
  says whether the app has several companies. `d.Authz.Units(ctx,
  permission)` says which branches a permission reaches (a provider implementing
  `kernel.ScopedAuthorizer` answers per branch; otherwise the whole company when `Can`). Tasks
  and events carry the scope; `d.Scope.Companies(ctx)` lists companies for per-company jobs. A
  module that keeps company data declares `"scoped": true` in `module.json`: every table of it
  has `company_id BIGINT NOT NULL DEFAULT 1` (plus `branch_id` where it means something), its
  business keys include `company_id`, and every query names `company_id = ?` explicitly — no
  hidden filter; a system query across companies (a purge) is marked `-- all companies` and
  named `System…`. Modules that are not scoped (sessions, a blog) carry nothing.
- **`Deps.HTTP`** and **`database.OpenWith`** are where kits plug in: `d.HTTP.Use(name, mw)` in
  the composition root adds middleware after the kernel's own and before the routes;
  `database.OpenWith(dsn, database.Options{Wrap: …})` in `main.go` wraps the driver (metrics,
  tracing).
- **`kerneltest`** gives a module's unit tests a kernel without a database:
  `k := kerneltest.Deps(t)` (`k.Deps`, a movable `k.Clock`, `k.Audit.Records()`),
  `k.RunTasks()`, `k.Enqueued()`, `k.Published()`, `kerneltest.In(ctx, company, branch)`.
- **`kernel.Version`** is the contract version a library module's `requires_kernel` (in its
  `module.json`) is checked against — see [Kernel versions](#kernel-versions) for when it moves.
- **Settings**: `config.Config` holds only what the kernel needs (`APP_ENV`, `APP_PORT`,
  `APP_NAME`, `DB_DSN`, `PUBLIC_DIR`). A module reads its own settings with `config.Get` or
  `config.Require` in its `New`, so a missing required value stops the API at startup.
- **Database**: `database.Open` sets `parseTime` (sqlc scans DATETIME into `time.Time`) without
  putting it in `DB_DSN`, which golang-migrate also reads. It does not dial — the API starts
  while MySQL is down, and `/readyz` answers 503 until it is reachable. That is what the image
  HEALTHCHECK and `deploy.sh` wait on.
- **Responses** go through `shared/response` only: `OK`, `Created`, `Paginated`, `Fail`, and
  `Error(w, r, err)`. A handler returns client errors as `*apperror.Error` (`BadRequest`,
  `NotFound`, `Validation`, …); any other error becomes a logged, generic 500, so internals
  never leak.
- **Input**: `request.DecodeJSON` (only `application/json` — 415 otherwise, which is what keeps
  a cookie session safe from forged cross-site posts; 1 MiB cap; unknown fields rejected; messages
  never echo Go internals), `request.PathInt64`, `request.ClientIP` (the real client behind
  nginx, from `TRUSTED_PROXIES`; `ClientIPFrom(ctx)` and `RequestID(ctx)` where only the context
  is at hand), `request.AllowTransfer(w, bytes)` (first thing in a handler that takes an upload
  or sends a file: the server's 30 s read / 60 s write timeouts are sized for API calls),
  `request.AllowStream(w, r)` (a server-sent event stream: a 10 s deadline per write instead of
  the server's 60 s for the whole response, a heartbeat every
  20 s, its `Context()` ends when the client leaves or shutdown starts; `defer s.Close()`, hold no
  database connection while waiting, mount it at `/api/v1/<module>/stream…` — the deploy's nginx
  passes those unbuffered; an event is a hint, the client fetches the data again),
  `pagination.FromRequest`, and `validator.Validator`, which collects every field error into
  one 422.
- **Server**: `http.ServeMux` (method patterns such as `"GET /api/v1/orders/{id}"`), an unknown
  `/api/` path answers a JSON 404 instead of the SPA, and every request gets an `X-Request-ID`
  plus a logger carrying it and the client IP (`logger.From(r.Context())`). A state-changing
  `/api/` call a browser marks as coming from another site (`Sec-Fetch-Site`, or a foreign
  `Origin`) is refused with 403 — sibling subdomains share a "site" and its cookies, so this holds
  whatever domains the app runs on. Panics become a 500 envelope. `SIGTERM` (`docker stop`) drains
  in-flight requests, and lets running tasks finish, for up to 25 s (inside the compose
  `stop_grace_period`); open streams end at once, and jobs are cancelled (a calendar tick cut
  short runs again).
- **Config**: `APP_ENV` must be `development` or `production`, and explicit in the container
  (the image sets `PUBLIC_DIR`); the database session runs in UTC whatever the host MySQL's time
  zone is. `Config.DataDir` (`DATA_DIR`) is the one folder the app writes to: `/app/data` in the
  image, mounted from `~/<slug>/data` on the server and backed up nightly; `data` (relative to
  `apps/api`) in development. A module keeps its files in `DataDir/<module>/` and checks in `New`
  that it can write there. `APP_TIMEZONE` (default `Asia/Jakarta`) places business dates and
  calendar schedules.
- **Time columns**: an instant (when something happened) is `DATETIME(6)` holding UTC — the
  session is UTC, and `TIMESTAMP` ends on 19 January 2038, too close for business records kept
  10 years; a business date (invoice date, attendance day) is `DATE`, from `kernel.Today`.
  Tables created before kernel 6 with `TIMESTAMP(6)` move with an expand/contract migration when
  their module is next changed.
- The kernel owns the tables `kernel_tasks`, `kernel_schedules`, and `kernel_schedule_runs`
  (migration `<ts>_kernel_6`); no module reads or writes `kernel_*` — it uses the slots.
- `shared/apperror` is not named `errors` so it never shadows the standard library package.

### Kernel versions

`kernel.Version` (and `apps/web/src/shared/kernel.ts`) is the contract number a library module's
`requires_kernel` is checked against — as a minimum. Bump it whenever the kernel gains or changes
something a module may rely on — an addition included, since a module using it must be able to
refuse an older kernel. A change no module can notice (a comment, a clearer message) is not a
bump. Record what changed in the comment above `Version`. The skill's `check-drift.mjs` holds
the line: it fails when the three version numbers disagree or a contract file changed without a
decision (the skill's `AGENTS.md`).

**Compatibility.** A new kernel only adds: every module released for kernel N compiles and
behaves the same on N+1 — proven by running the library's testbed before the release. Removing
or changing something a module may rely on takes two kernels: one marks it deprecated (a doc
comment and a row here), a later one — declared breaking, with upgrade notes in its row —
removes it. Releases are tagged `rudis-monorepo/kernel/v<N>.<R>`; the module library pins
one (its `kernel/`) and its module developers build on that alone.

| Version | Adds |
|---|---|
| 1 | `Deps` (`Config`, `DB`, `Log`, `Auth`), `shared/`, the module registries |
| 2 | `Deps.Authz` (`authz.go`); web: `shared/access.tsx` (`useCan`), `shared/app-events.ts`, `FrontendModule.provider`, `NavItem.permission`, `shared/kernel.ts` |
| 3 | web: `shared/lib/field-classes.ts` (`FIELD`), the Bingkai Navy primitives (`button` with `loading`, `input`, `card`, `dialog`), the `--animate-loader-slide` token in `theme.css`; Indonesian default messages in the kernel and starter pages |
| 4 | security and safety: `DecodeJSON` JSON-only (415) with safe messages; cross-site writes refused; `request.ClientIP` + `TRUSTED_PROXIES`; `Authorizer.Covers` / `d.Authz.Covers`; duplicate permission names and production-without-provider refused; explicit `APP_ENV`; UTC DB sessions; 25 s shutdown; tests for these in `server/` and `shared/request/`; web: route error and 404 pages, `http-client` sends cookies to a separate API origin |
| 5 | `Deps.Jobs` (`jobs.go`), `Deps.Audit` (`audit.go`), `request.RequestID` / `ClientIPFrom` / `AllowTransfer`, `Config.DataDir` and the `./data:/app/data` volume (compose, Dockerfile, deploy.sh), tests for jobs and audit; web: open slot names, the `profile:changed` app event |
| 6 | `Deps.Tx` (`tx.go`), `Deps.Tasks` (`tasks.go`), `Deps.Events` (`events.go`), calendar schedules (`calendar.go`), `Deps.Clock` (`clock.go`) and `APP_TIMEZONE`, `Deps.Scope` (`scope.go`; `Authz.Units`, `ScopedAuthorizer`, scope resolved in `Auth.Require`), `AuditEntry.Kind` and the record's scope, `Deps.HTTP` (`http.go`), `kernel.NewDeps`, `database.OpenWith` / `Retryable`, `request.AllowStream`, the `kerneltest` package, MySQL tests (`kernel_mysql_test.go`, run with `KERNEL_TEST_DSN`), the kernel's tables (migration `<ts>_kernel_6`), `time/tzdata`; deploy: the nginx stream location, `APP_TIMEZONE` in the env examples, the kernel tests in CI; web: `shared/scope.ts` (`X-Scope`), the `scope:changed` app event, the `shell:scope` slot. `NewJobsSlot` and `NewAuditSlot` take a clock — built by `kernel.NewDeps` |
| 7 | `kernel.CompanyOf` and `ScopeSlot.Several` (`scope.go`): a module asks for the company of a ctx, or learns it runs at installation level, without recovering from `ScopeFrom`'s panic; web: `Button` and `FIELD` draw keyboard focus as a solid `--ring` edge (outline; border + 1px ring) instead of a translucent ring — WCAG 2.2 · 1.4.11 |

A project scaffolded on an older kernel moves up by copying the new kernel files from this
skill's `scripts/templates/` (for 2: `internal/kernel/authz.go`, the `Authz` field in `Deps`,
its construction in `main.go`, and the web files above; for 3: `web/field-classes.ts`, the
`web/primitives/*`, and the `@theme` block of `web/theme.css`; for 4: `internal/shared/request/`,
`internal/server/`, `internal/kernel/authz.go`, `internal/config/config.go`,
`internal/database/database.go`, `cmd/server/main.go`, `.dockerignore`, the Dockerfile lines,
`deploy.sh`, and the web files `shared/components/feedback/RouteError.tsx`,
`app/routes/index.tsx`, `shared/services/http-client.ts` — an authorization provider must
implement `Covers`; for 5: `internal/kernel/jobs.go` and `audit.go`, the `Jobs`/`Audit` fields in
`Deps` and their construction, start, and stop in `main.go`, `request.go`, `middleware.go`,
`config.go` (`DataDir`), `database.go` (`Name`), the `volumes:` entry in the prod compose, the
`data/` step in `deploy.sh`, the Dockerfile's `/app/data`, the `.gitignore` line
`apps/api/data/`, and the web files `shared/composition.tsx` and `shared/app-events.ts`; on the
server, re-install `scripts/server/rudis-backup.sh` with `APPS_ROOT` set so `data/` is
backed up; for 6: every file in `internal/kernel/` (with `kerneltest/`), `internal/config/`,
`internal/database/`, `internal/server/`, `internal/shared/request/`, and `cmd/server/main.go`;
`migrations/kernel_6.*.sql.tmpl` copied to `apps/api/migrations/<a fresh timestamp>_kernel_6.*.sql`;
`APP_TIMEZONE` in `.env.example` and the production example; the stream `location` in
`infra/nginx/nginx.conf` (then reload nginx on the server); the kernel-test step in
`.github/workflows/ci.yml`; and the web files `shared/scope.ts`, `shared/app-events.ts`,
`shared/composition.tsx`, `shared/services/http-client.ts`. Library modules for kernel 6 are
then upgraded with `module.mjs upgrade`; for 7: `internal/kernel/scope.go`, and the web files
`shared/components/primitives/button.tsx` and `shared/lib/field-classes.ts`), then raising both
version numbers.

## Module contract and the registry

A module never imports another module (rule and rationale:
[backend-modular-monolith.md](backend-modular-monolith.md#ports-contracts-and-the-composition-root)).
It depends only on the kernel and its own packages. What it needs from outside is a port in its
own `ports/`; what it offers is its `contracts/`.

A module's package root (`internal/modules/<name>/<name>.module.go`) exposes:

```go
// New builds the module from kernel.Deps plus one argument per port it needs — all of
// them types from its OWN ports package. An error (e.g. a required setting is missing, read
// with config.Require) stops the API at startup.
func New(d *kernel.Deps, users ports.UserStore) (*Module, error)

// Routes mounts the module's HTTP handlers.
func (m *Module) Routes(mux *http.ServeMux)

// Client returns the module's public contract — only for a module that offers one.
func (m *Module) Client() contracts.UserClient
```

`internal/modules/` (package `modules`) is the **composition root**, the only package that
imports modules. `registry.go` builds each module and mounts its routes; a module that offers
a contract comes before the modules wired to it. Each connection gets a small adapter in its
own file beside the registry, named `adapter_<consumer>_<port>.go`:

```go
// internal/modules/adapter_auth_userstore.go
// authUserStore satisfies auth's UserStore port with the users module's client.
type authUserStore struct{ users userscontracts.UserClient }

func (a authUserStore) FindByEmail(ctx context.Context, email string) (authports.User, error) {
	u, err := a.users.GetByEmail(ctx, email)
	if err != nil {
		return authports.User{}, err
	}
	return authports.User{ID: u.ID, Email: u.Email, PasswordHash: u.PasswordHash}, nil
}
```

```go
// internal/modules/registry.go
func Register(mux *http.ServeMux, d *kernel.Deps) error {
	// rudis:modules:begin
	usersModule, err := users.New(d)
	if err != nil {
		return err
	}
	usersModule.Routes(mux)
	authModule, err := auth.New(d, authUserStore{users: usersModule.Client()})
	if err != nil {
		return err
	}
	authModule.Routes(mux)
	d.Auth.Provide(authModule.Authenticator())
	// rudis:modules:end
	return nil
}
```

- An adapter only maps fields and forwards the call — no business logic. Logic belongs in a
  module.
- A port can be satisfied by anything: another module's client through an adapter, or code the
  project writes itself (e.g. its own user table) — the consumer never knows which.
- Imports go between `// rudis:imports:begin` and `// rudis:imports:end`. Keep every `rudis:*`
  marker: the module library's installer inserts lines between them, and generates the
  adapter when the provider is a library module it knows.

## Migrations and sqlc per module

- Migrations are **timestamp-versioned** (`npm run migrate:create -- <name>` →
  `<yyyymmddhhmmss>_<name>.up.sql`), so migrations added on two branches never collide. A
  module's migrations create only the tables it owns.
- `npm run migrate:up|down` runs the golang-migrate CLI (same version as in the image):
  `go install -tags mysql github.com/golang-migrate/migrate/v4/cmd/migrate@v4.18.1`. The wrapper
  and the prod compose add `multiStatements=true`, so one migration file may hold several
  statements (a table and its seed rows). Keep `DB_DSN` free of `?params` — the app sets
  `parseTime` in code.
- The scaffold ships a no-op `<timestamp>_baseline` migration: golang-migrate fails `up` on an
  empty directory, which would break the first deploy.
- Each module adds its own `sql:` block to `sqlc.yaml`, between `# rudis:sqlc:begin` and
  `# rudis:sqlc:end`:

  ```yaml
    - engine: "mysql"
      schema: "migrations"
      queries: "internal/modules/order/infrastructure/queries"
      gen:
        go:
          package: "sqlc"
          out: "internal/modules/order/infrastructure/sqlc"
  ```

  sqlc refuses a config with no block at all ("no packages"), so `npm run sqlc:generate` runs
  through `scripts/sqlc.mjs`, which skips with a message until a module with queries is in.
