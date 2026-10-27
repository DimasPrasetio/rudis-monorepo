# rudis-monorepo — Claude Code Skill

A Claude Code Skill that captures the locked Rudis monorepo project standard: a modular-monolith
backend (`apps/api`), a React 19 + Tailwind 4 frontend (`apps/web`), strict contracts-only module
boundaries, a Claude Code knowledge gateway, `/api/v1` conventions, and deployment to any
Docker host you configure (no server is built in): one image/one container built in CI and
pushed to GHCR, pulled (never built) by the server, host-level shared MySQL, a unique `127.0.0.1` port behind host nginx + certbot.

## Install on another device

The repo ships a prebuilt package at `dist/rudis-monorepo.skill` (a zip) and one-command
installers. Pick whichever fits the target machine.

```bash
git clone https://github.com/DimasPrasetio/rudis-monorepo.git
```

### One command (recommended)

Windows (PowerShell), from the repo folder:

```powershell
./install.ps1
```

macOS / Linux, from the repo folder:

```bash
bash install.sh
```

Both extract the skill into your **global** skills directory (`~/.claude/skills/rudis-monorepo`),
so it's available in every project. Re-running re-installs (overwrites) cleanly.

### Manual install

Global (all projects) — extract the package into `~/.claude/skills/`:

```bash
# macOS / Linux
unzip dist/rudis-monorepo.skill -d ~/.claude/skills/
```

```powershell
# Windows PowerShell
Expand-Archive -Path dist/rudis-monorepo.skill -DestinationPath $HOME/.claude/skills/ -Force
# (if Expand-Archive rejects the .skill extension, copy it to a .zip first)
```

Project-only (just one repo) — extract into that project's `.claude/skills/` instead of the
global path above.

> The package's top-level folder is `rudis-monorepo/`, and that name matches the `name:` in
> `SKILL.md` frontmatter — which is what makes Claude Code discover the skill. Don't rename the
> installed folder.

## Verify the install

In Claude Code, the skill appears in the available-skills list as `rudis-monorepo`. Trigger it by
asking to build a monorepo, e.g. *"buatkan monorepo Go + React untuk app kasir"*, or explicitly with
`/rudis-monorepo`.

## Use

The skill bundles a zero-dependency Node scaffolder so every generated project starts from an
identical, standard-compliant skeleton:

```bash
node scripts/scaffold.mjs --name my-app --backend go --dir ./my-app \
  --slug myapp --port 8085 --ghcr-owner <owner> --domain myapp.example.com --ssh-host <ssh-host>
node scripts/scaffold.mjs --help
```

- `--backend` is one of `go` | `nestjs` | `express` (frontend is always React 19 + Tailwind 4).
- `--slug`, `--port`, `--ghcr-owner`, `--repo`, `--domain`, `--ssh-host`, `--playbook`, `--target`
  are the deploy facts. No server is built in: the target comes from the project's
  `knowledge/DEPLOYMENT.md`, the device config `~/.config/rudis-monorepo/targets.json`, or the
  user (SKILL.md › Step 0b). Never guess a port. Omitted facts become `__PLACEHOLDER__` markers that `deploy.sh` refuses to run with.
- It lays down the full tree, root config, `CLAUDE.md`, `knowledge/` (the project's single
  knowledge rack — see `references/knowledge-gateway.md`), `.claude/rules/`, `analysis/`,
  the deploy setup (Dockerfile, `infra/deploy/` compose + `deploy.sh` + env example, host nginx
  site, `ci` + `release-image` workflows), the frontend base, and a backend base for the chosen stack.
- Claude then reads the relevant `references/` file and fills in modules, code, and project knowledge.

## Repo layout

```txt
rudis-monorepo/
├── SKILL.md                       # lean skill body: structure, rules, stack selection, pointers
├── README.md                      # this file
├── AGENTS.md                      # rules for changing the skill (CLAUDE.md imports it)
├── references/                    # detailed, stack-specific rules (loaded on demand)
│   ├── knowledge-gateway.md
│   ├── backend-modular-monolith.md
│   ├── backend-go.md
│   ├── backend-nestjs.md
│   ├── backend-express.md
│   ├── frontend.md
│   ├── design-research.md         # research how this app type is ideally designed, before any UI
│   ├── api-standard.md
│   └── docker-deployment.md       # deploy standard for the deploy server
├── scripts/
│   ├── scaffold.mjs               # zero-dependency Node scaffolder
│   ├── check-drift.mjs            # references ↔ scaffolder ↔ module contract
│   ├── module-contract.json       # fingerprints of the files library modules build on
│   ├── smoke-test.mjs
│   ├── package.mjs
│   └── server/                    # installed once per server: nightly rotated DB backups
├── evals/                         # dev/QA test cases (NOT shipped in the .skill)
├── dist/
│   └── rudis-monorepo.skill         # prebuilt install package
├── install.ps1                    # Windows global installer
├── install.sh                     # macOS/Linux global installer
└── .gitignore
```

`evals/`, `dist/`, `install.*`, `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are repo/distribution tooling — they are **not**
part of the installed skill. The `.skill` package contains only `SKILL.md`, `README.md`,
`references/`, and `scripts/`.

## Rebuild the package after editing the skill

If you change `SKILL.md`, a reference, or the scaffolder, run:

```bash
npm run verify
```

This runs, in order: `scripts/check-drift.mjs` (catches references/*.md drifting from what
`scaffold.mjs` actually emits, asserts the generated deploy files keep the deploy server rules,
and enforces one owner per fact across the generated knowledge base — see *One owner per fact* in
[references/knowledge-gateway.md](references/knowledge-gateway.md)), `scripts/smoke-test.mjs` (scaffolds all three stacks, `npm
install`s them, type-checks, and boots `dev:api`/`dev:web` for real), then
`scripts/package.mjs` (rebuilds `dist/rudis-monorepo.skill` from source and verifies the
archive contains only the payload — no `evals/`, `dist/`, or `install.*`). No change
to `SKILL.md`, `references/`, or `scaffold.mjs` is done until `npm run verify` is green. Then
re-run the installer on each device.

`check-drift.mjs` also guards the **module contract** — the generated files the module library
builds on — and the kernel version; [AGENTS.md](AGENTS.md) says what to do when it fails. The
repository's pre-commit hook (`git config core.hooksPath .githooks`, once per clone) runs
`check-drift.mjs` and `package.mjs --check`; CI runs those and the smoke test.
