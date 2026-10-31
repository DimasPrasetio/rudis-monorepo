# Local database

How a project gets a `.env` that runs and its MySQL databases on a developer's machine, which
account plugin to use, and how scripts that rebuild a database are kept from rebuilding the
wrong one. Server databases and accounts are in [docker-deployment.md](docker-deployment.md).

## `.env` runs as soon as it is written

The scaffold writes `.env` (gitignored) next to `.env.example` with values that work on a
developer's machine, through `scripts/env-local.mjs` (every backend). Run it again after each
`module.mjs add`: the module's keys reach `.env.example`, and this gives them local values.
It never changes a value already set; an empty or placeholder one (`change-me`, `__X__`,
`<x>`) gets:

| Key | Local value |
|---|---|
| `*_SECRET` (`JWT_SECRET`) | 64 random hex characters |
| `*BOOTSTRAP*EMAIL` (`USERS_BOOTSTRAP_EMAIL`, `RBAC_BOOTSTRAP_ADMIN_EMAIL`) | `admin@example.com` |
| `*BOOTSTRAP*PASSWORD` | `admin123` |
| `*BOOTSTRAP*NAME` | `admin` |
| the database keys | left to `db-local.mjs` (below); one with a placeholder anywhere in it (`__ISI_USER__:__ISI_SANDI__@tcp(…)/app_db`, `DB_USER=__ISI_USER__`) is emptied, and `db-local.mjs` does not count it as another account |
| anything else | the value `.env.example` gives — empty means the module's default |

A placeholder it has no value for is named, and it exits 1. The users module signs in by
email (there is no user name; `admin` is the display name), and its 8-character minimum
accepts `admin123`. The local sign-in exists only on developers' machines: the server's `.env`
is written from `.env.production.example`, which never holds it, and `deploy.sh` refuses a
`.env` that does.

## One command for the databases

```bash
node scripts/db-local.mjs --admin-password-empty   # root without a password (Laragon, XAMPP): asks nothing
node scripts/db-local.mjs                          # asks the MySQL admin password (hidden)
node scripts/db-local.mjs --print-sql              # the SQL it would run — connects to nothing
```

Every backend gets `scripts/db-local.mjs`. An agent runs the first form: it signs in as root
with an empty password, on `localhost` or `127.0.0.1` only (any other `--host` is refused),
through the same private option file. It stops, changes nothing, and prints one command for
the developer to run in their own terminal — `node scripts/db-local.mjs`, which asks the
password itself (hidden, never stored) — when:

| Exit | Why |
|---|---|
| 3 | the sign-in failed: root has a password, or no MySQL answers |
| 4 | `<slug>_db`, `<slug>_test` or `<slug>_dev` already exists. Unattended it never reuses them: a new password for the account would cut off another checkout's `.env`, and a same-named database may belong to something else. Copying `.env` from the checkout that created them is the other way out |
| 1 | anything else (no `mysql` client, `.env` not ignored by git, keys pointing at another account) — the message says what |

So a password never passes through an agent, a chat, a command line, or a file in the repo; an
agent never asks for it. The interactive form reuses what exists and gives the account a new
password — a person's decision.

What it does, in order:

1. Refuses before anything changes when `.env` is not ignored by git, or when the two keys
   below already point at another account (`--replace` overwrites them).
2. Finds the `mysql` client — `--mysql <path>`; on Windows the one next to the running
   `mysqld.exe` (Laragon, XAMPP and the installers keep it off `PATH`); `PATH`; then
   `Program Files\MySQL|MariaDB\*\bin` — and signs in as `--admin-user` (default `root`)
   through a private, temporary option file, never a command-line password.
3. Reads `SELECT VERSION()` and picks the account plugin from it (next section). With
   `--admin-password-empty`, stops here (exit 4) when either database or the account exists.
   Then completes `.env` with `env-local.mjs` (above) — still before anything on the server
   changes.
4. Creates `<slug>_db` and `<slug>_test` (`utf8mb4_unicode_ci`) if missing, and the account
   `<slug>_dev@'127.0.0.1'` with a random 36-character password and `ALL PRIVILEGES` on
   those two databases only — nothing global, and the `_` in their names escaped (in a
   database-level `GRANT`, `_` is a wildcard). The password mixes upper and lower case, digits
   and `-`, so `validate_password`'s MEDIUM policy (on in some MySQL packages) accepts it, and
   needs no escaping in SQL, a DSN, or a URL. The asking form run again keeps the data and
   gives the account a new password.
5. Writes the two keys to `.env` — the account already has the new password: `DB_DSN` + `TEST_DB_DSN` (Go,
   `<user>:<password>@tcp(127.0.0.1:<port>)/<db>`) or `DATABASE_URL` + `TEST_DATABASE_URL`
   (Prisma, `mysql://…`) — and, where `.env` has them, the split
   `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`, replaced to name the same account.
6. Signs in as that account over TCP, as the app will, and checks it sees both databases.

The admin password goes to the client through an option file in a private temporary folder,
removed after each call and on any exit, Ctrl+C included.

The account host is `'127.0.0.1'`, and so is the DSN's: MySQL matches an account's host as a
string, and an app on TCP to the loopback address arrives as `127.0.0.1` whatever
`skip_name_resolve` says. That holds for a MySQL installed on the machine; a MySQL in a
container sees the docker gateway's address instead, and step 6 says so.

In Git Bash (mintty) Node has no terminal to hide the password in — run it from PowerShell,
cmd, or a terminal, or prefix `winpty`.

`.env.example` — and so `.env` until `db-local.mjs` runs — leaves both keys **empty**. A placeholder shaped like a DSN
(`root:@tcp(localhost:3306)/app_db`, `__FILL__:__FILL__@tcp(…)`) is a working connection
string the moment `.env.example` is copied: tools then sign in to whatever MySQL listens on
3306. Empty fails loudly instead — the Go API refuses to start, `migrate.mjs` says to run
`db-local.mjs`.

## The account plugin: read the version first

| Server (`SELECT VERSION()`) | `CREATE USER … ` | Why |
|---|---|---|
| MySQL 8.0 | `IDENTIFIED WITH caching_sha2_password BY` | the default since 8.0 |
| MySQL 8.4 | same | `mysql_native_password` is disabled by default |
| MySQL 9.x | same | `mysql_native_password` is removed from the server |
| MariaDB | `IDENTIFIED BY` | MariaDB has no `caching_sha2_password` |
| MySQL 5.7 | `IDENTIFIED BY` | end of life — upgrade |

The scaffold's drivers need no TLS for `caching_sha2_password`: on a full authentication over
plain TCP they ask the server for its RSA public key themselves — which drivers do, which need
an option, and which cannot: [docker-deployment.md › Drivers on the docker bridge](docker-deployment.md#drivers-on-the-docker-bridge-without-tls).

### `Error 1524: Plugin 'mysql_native_password' is not loaded`

Two different things end in this error on MySQL 8.4+:

1. **The account really uses `mysql_native_password`** — created that way (`IDENTIFIED WITH
   mysql_native_password`, the old default) and the server is 8.4, where the plugin is off
   unless started with `mysql_native_password=ON`, or 9.x, where it no longer exists. `CREATE
   USER … IDENTIFIED WITH mysql_native_password` fails the same way. Fix: `ALTER USER
   '<user>'@'<host>' IDENTIFIED WITH caching_sha2_password BY '<password>'` — or rerun
   `db-local.mjs`, which does that for its own account.
2. **The account does not exist** — a placeholder user, a typo. So that a client cannot tell a
   real account from a missing one, the server answers a missing account through a built-in
   authentication plugin picked at random and remembered per name (`decoy_user()` in
   `sql/auth/sql_authentication.cc`). MySQL 8.4.0 could pick the disabled
   `mysql_native_password`, so a wrong user name sometimes got 1524 instead of `1045 Access
   denied` (MySQL Bug #114876, verified; current 8.4 sources pick among enabled plugins only).
   Read 1524 for an account you did not create as "this account does not exist".

The inventory project hit case 2: a smoke script sent a `.env` placeholder account to the
developer's MySQL. Nothing was created; the fix is what the rest of this file describes.

Sources: [MySQL 8.4 manual — Native Pluggable Authentication](https://dev.mysql.com/doc/refman/8.4/en/native-pluggable-authentication.html)
(deprecated 8.0.34, disabled by default in 8.4, removed in 9.0.0; `--mysql-native-password=ON`) ·
[MySQL 9.0.0 release notes](https://dev.mysql.com/doc/relnotes/mysql/9.0/en/news-9-0-0.html)
(plugin and its server options removed) ·
[MySQL Bug #114876](https://bugs.mysql.com/bug.php?id=114876) (1524 for a non-existent user on 8.4.0) ·
`decoy_user` in `sql_authentication.cc`: [tag mysql-8.4.0](https://github.com/mysql/mysql-server/blob/mysql-8.4.0/sql/auth/sql_authentication.cc)
(`random_number % PLUGIN_LAST` — every built-in plugin) and [branch 8.4](https://github.com/mysql/mysql-server/blob/8.4/sql/auth/sql_authentication.cc)
(`% enabled_plugins.size()`).

## Scripts that rebuild a database

A Go project gets three files for this:

| File | What it is |
|---|---|
| `scripts/db-guard.mjs` | `checkTestDsn` (the rule below), `resolveTestDsn`, `parseDsn`, and `loadDotEnv` — no side effects |
| `scripts/db-guard.test.mjs` | its refusals, no database: `npm run test:scripts` (also in CI) |
| `scripts/smoke.mjs` | `npm run smoke`: guard → `migrate drop` + `up` on the test database → build and start the API → `checks()`; add the app's own flows to `checks()` |

The rules, for these and for any script a project adds that drops or rebuilds a database:

- **The target is checked before `.env` is loaded.** A variable set in the environment is the
  answer even when it is `""` — it is refused, never refilled from `.env`. Only an unset one is
  read from the file, and is checked the same way. PowerShell (`$env:X = ""`) and cmd
  (`set X=`) cannot hold an empty variable — they remove it — so to switch a run off there,
  set a value the guard refuses, such as `TEST_DB_DSN=off`.
- **The check parses, it does not search.** The DSN must be exactly
  `user:password@tcp(localhost|127.0.0.1[:port])/<name>_test[?params]`: user and password are
  everything before the last `@tcp(`, the database is what follows the `)/` that closes the
  address — the split the Go driver makes — and parameters may not hold `/`. A regular
  expression over the raw string (`/_test(\?|$)/`) accepts `u:p@tcp(h)/prod?x=/y_test` and
  `u:p/x_test?@tcp(h)/prod`, both of which name `prod`.
- **The host is `localhost` or `127.0.0.1`**, the name ends in `_test`, and a placeholder
  (`__X__`, `<x>`) is refused.
- **A `.env` loader never overwrites a variable that is already set, even to `""`**
  (`loadDotEnv`; `scripts/migrate.mjs` uses it).
- **Refusals are tested on the guard function**, with no database — never by running the
  destructive script with a bad value. If the guard is wrong, that run destroys the database
  the test was meant to protect.

## `check-migrations.mjs`: not applicable before there is a base

CI runs `node scripts/check-migrations.mjs <base-sha>` to refuse a migration older than the
newest one on the base branch. With nothing to compare against it prints `not applicable`
and exits 0 — not a failure: no base commit (a branch's first push), a base outside the
checkout, or a base without `apps/api/migrations` yet — the project's first commit, where
every migration is new.
