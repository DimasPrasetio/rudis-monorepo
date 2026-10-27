# Claude Code Knowledge Gateway

Every generated monorepo must include a project knowledge gateway for AI agents and future
developers. This is what lets Claude Code work effectively in the repo without re-discovering
context every time.

## One knowledge rack, not two

`knowledge/` is the project's **only** knowledge base. There is no separate `docs/` for a
stakeholder audience — a one-person team is its own stakeholder, and while two racks stand,
every fact has two homes that must be kept in sync, which reliably fails. The axis that
actually matters for a solo project isn't *who reads it*, but *what happens to the document
over time*:

| Time property | Location |
|---|---|
| Consolidated — changes with the project, read every session | `knowledge/` |
| Decision — barely changes, binding, tracked | `knowledge/decisions/` |
| Operational rule — enforced while editing code | `.claude/rules/` |
| Per-task artifact — accumulates, never re-edited | `analysis/` |

Four axes, zero overlap — a document has exactly one time property.

If a project later genuinely needs a stakeholder-facing document, it may come back — but as a
**derived** document generated from `knowledge/`, never as a second parallel source. Designing
for that hypothetical audience up front is the overengineering this standard argues against.

## One owner per fact

Four axes with no overlap keeps *documents* from colliding. It does not stop a *fact* from
being copied across them — and that copy is the failure this standard actually suffers, because
both copies look authoritative and nothing flags the day they disagree.

So: every fact is stated in exactly one file, and everything else points at it.

| Kind of fact | Owner | Everyone else |
|---|---|---|
| What is allowed while editing code | `.claude/rules/<scope>.md` | points at the rule |
| What this project is, holds, exposes | `knowledge/<TOPIC>.md` | points at the file |
| Why a decision was taken | `knowledge/decisions/ADR-*` | records *why*, never repeats *what* |
| How to run and deploy it | `knowledge/DEPLOYMENT.md` | points at it |
| Dev commands | `CLAUDE.md` (agents), `README.md` (humans) | points at those |

Two deliberate exceptions, both earned rather than accidental:

- **`CLAUDE.md` restates a handful of invariants.** It is always loaded and `.claude/rules/` is
  not, so the boundary rule, the primitive-ID rule, and the one-container rule are worth their
  duplicated lines. `CLAUDE.md` says so in place and names the rules file as authoritative.
- **`MODULE_MAP.md` carries an owned-tables column.** A name-only index for fast boundary
  checks; `DATABASE.md` stays authoritative for schema detail.

Anything beyond these two is drift. When a fact seems to need a second home, the question to
ask is which single file should own it — not which second file should also carry it.

### Enforcement

`npm run verify` (in this skill repo) compares the two copies of every fact that is duplicated
on purpose and fails on any that appeared by accident:

- **single-owner facts** — a marker per fact (`dev:web`, `host.docker.internal`, `Zustand`,
  `/api/v1`, …) must appear in exactly the generated files listed in `FACT_OWNERS`; a fact
  copied into a third file fails the run, as does an owner that stopped stating what it owns.
- **the anti-overengineering list** — `SKILL.md` and the generated `.claude/rules/monorepo.md`
  must hold the same set of items. A *partial* copy is the dangerous case: the shorter list
  still reads as complete, so items silently stop being forbidden.
- **the `knowledge/` file list** — the tree below, the generated directory, and the routing
  links in `INDEX.md` must agree, so the base never grows a file nobody routes to.

When a duplicate is legitimate, add it to `FACT_OWNERS` in `scripts/check-drift.mjs` on
purpose. That table is where the intent is recorded; a duplicate that is not in it is a bug.

## `CLAUDE.md`

`CLAUDE.md` is the root AI gateway. Keep it concise — it is a gateway, not a documentation dump.

It must include:

- Project identity and purpose.
- Required commands (`npm run dev:web`, `npm run dev:api`, build, migrate).
- Critical architecture rules (modular monolith, modules never import each other, host-level DB).
- Pointers to files in `knowledge/`, including `knowledge/SOURCE_PRIORITY.md`.
- An instruction to read the relevant `knowledge/` file before changing code.

Do not import every `knowledge/` file into `CLAUDE.md`. The point of the gateway is to keep the always-loaded context small and route the agent to the right detail on demand. The invariants it does restate must say so in place, and name `.claude/rules/` as the authoritative copy.

## `knowledge/`

`knowledge/` is the project knowledge base. Required files:

```txt
knowledge/
├── INDEX.md              # table of contents / routing for the other files
├── SOURCE_PRIORITY.md    # which source wins when two disagree
├── PROJECT.md            # what the project is and why it exists; features, scope, user stories
├── ARCHITECTURE.md       # apps, modules, data flow, boundaries
├── MODULE_MAP.md         # each module's responsibility, public contract, owned tables, external integrations
├── GLOSSARY.md           # shared terminology
├── API.md                # endpoint list and API conventions specific to this project
├── DATABASE.md           # tables, fields, ownership per module, relations as primitive IDs
├── FRONTEND.md           # frontend conventions specific to this project
├── DESIGN.md             # design brief: researched UI direction for this app type + dated sources
├── BACKEND.md            # backend conventions specific to this project
├── DEPLOYMENT.md         # deploy target facts (SSH host, slug, port, DB, image, domain), release + first-time setup
└── decisions/            # Architecture Decision Records (ADRs)
    ├── ADR-0001-monorepo-structure.md
    ├── ADR-0002-modular-monolith.md
    ├── ADR-0003-frontend-standard.md
    └── ADR-0004-deploy-image-from-ci.md
```

Use these files to store *project-specific* knowledge: requirements, architecture decisions, module responsibilities, terminology, API rules, DB rules, deployment, and frontend/backend guides. The skill holds the *standard*; `knowledge/` holds the *project*.

Four of them pair one-to-one by topic with a file in `.claude/rules/` — `API.md`/`api-standard.md`, `DATABASE.md`/`database.md`, `FRONTEND.md`/`frontend-react.md`, `BACKEND.md`/`backend-modular-monolith.md`. That pairing is where redundancy creeps back in once the TODOs get filled, so each of those four files carries a delta-only instruction: record what is specific to this project, and leave the standing rule where it already lives.

### `SOURCE_PRIORITY.md`

When two sources describe the same fact and disagree, higher wins — but a real conflict is
always a finding to raise, never a choice to make silently:

```md
1. knowledge/decisions/ADR-*     ratified decisions
2. This monorepo standard + .claude/rules/
3. Code, config, active migrations
4. knowledge/*
5. AI observations & hypotheses
```

### `MODULE_MAP.md`

Beyond responsibility and public contract, every module row also carries **owned tables** and
**external integrations**. These two columns are what let later analysis (see the
`monorepo-analyze` skill) catch a cross-module join, or a secondary integration a requirement
implies but doesn't state (e.g. "forgot password" implying an email send), by reading instead
of guessing.

"Owned tables" here is a name-only index, not a second schema — `DATABASE.md` stays the
authoritative source for schema detail (fields, types, constraints). This is deliberate: it
keeps "where is table ownership recorded" a one-answer question (`DATABASE.md`) while still
giving `MODULE_MAP.md` a fast, module-scoped lookup for boundary checks.

## `analysis/`

Per-requirement analysis artifacts, one folder per requirement — `analysis/<id>/analysis.md`
plus diagrams. Committed on purpose, and never edited after being written (a changed
understanding gets a new folder). See `analysis/README.md` in the generated project.

## `.claude/rules/`

Use `.claude/rules/` for scoped technical rules that Claude Code applies while editing code.

Recommended files:

```txt
.claude/rules/
├── monorepo.md
├── backend-modular-monolith.md
├── frontend-react.md
├── database.md
├── api-standard.md
├── modules.md         # registries, rudis:* markers, module contract, customizing installed modules
└── deployment.md      # infra/**, .github/workflows/**: deploy rules
```

Scope rules by path when possible — e.g. backend rules apply to `apps/api/**`, frontend rules apply to `apps/web/**`. Path-scoped rules keep guidance relevant and avoid contradicting each other.

`deployment.md` is the rule; `knowledge/DEPLOYMENT.md` holds the concrete values (port, names,
image, domain) and the procedure — the rule never restates a value, the knowledge file never
restates a rule.

Rules must not copy each other either. `database.md` and `backend-modular-monolith.md` share a scope (`apps/api/**`), so the cross-module boundary rules live in the latter only and `database.md` points at them.
