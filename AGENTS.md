# Working on the rudis-monorepo skill

This file is for anyone who changes this skill — a person or an AI agent. The skill is the
**source of truth for the architecture** of every project it scaffolds and of every module in
the module library (`rudis-modules`). The architecture is locked: changes refine it, they
do not redesign it, and they never leave the references, the scaffolder, and the library out of
step.

## What is locked

| Part | Lives in | What a change must not do |
|---|---|---|
| Stack and repo shape | `SKILL.md`, `references/` | Swap a locked tool (React 19 + Tailwind 4 + shadcn/ui, Go modular monolith with sqlc + golang-migrate, MySQL, the image-from-CI deploy) or add a layer the anti-overengineering list forbids. |
| Module boundaries | `backend-modular-monolith.md` | Let a module import another module — not its internals, not its `contracts/`. Ports in the consumer, contracts in the provider, adapters only in the composition root. |
| Go kernel and module contract | `backend-go.md`, `scripts/templates/go/internal/kernel/` | Change `kernel.Deps`, `d.Auth`, `d.Authz`, the `rudis:*` markers, `New`/`Routes`/`Client`, or `shared/` without the kernel-version process below. |
| Frontend contract | `frontend.md`, `scripts/templates/web/`, the web files `scaffold.mjs` writes | Change `FrontendModule`, `@/shared/composition`, `@/shared/access`, `@/shared/app-events`, the http client, the token names, `FIELD`, or the primitives without the same process. |
| One home per fact | `references/knowledge-gateway.md` | Restate a fact in a second file. The second copy drifts; `check-drift.mjs` exists to catch it. |

## The module contract

The library installs code that builds on 42 generated files (kernel, config, shared Go
packages, the registries, the web's shared contract, primitives, theme). Their fingerprints are
in `scripts/module-contract.json`, recorded for the current kernel version. When one changes,
`check-drift.mjs` fails until you decide:

- **Compatible** — library modules for this kernel still compile and behave the same (a comment,
  a clearer message, a style refinement every module should get): run
  `node scripts/check-drift.mjs --accept-contract` and commit the updated
  `module-contract.json` with the change.
- **Breaking or additive** — a module could now rely on something new, or an existing module
  would stop working: raise the kernel version in all three places (`const Version` in
  `scripts/templates/go/internal/kernel/kernel.go.tmpl`, `KERNEL_VERSION` in `scaffold.mjs`,
  a new row in `backend-go.md` › Kernel versions with how to upgrade), update the library's
  modules (`requires_kernel`, versions) and run its testbed, then `--accept-contract`.

`check-drift.mjs` also fails when the three kernel version numbers disagree.

## Before you commit

```bash
npm run verify        # check-drift → smoke-test (needs Go, Node, MySQL) → package
```

The pre-commit hook runs the fast part (`check-drift.mjs` and `package.mjs --check`, so
`dist/rudis-monorepo.skill` never lags its sources); CI runs all of it. A change to the
kernel or the frontend contract is also checked against the library before it is released:
`node $RUDIS_MODULES/scripts/testbed.mjs --skill <this folder>`.

## Releasing the kernel to the module library

The library does not read this skill. It pins one kernel release in its `kernel/` folder (a
project scaffolded from a release tag, the references, and a lock of every file's hash), and
its module developers work from that alone — they cannot change the kernel, only ask for a
change ("Kernel request" issue there). So a kernel change reaches the library in these steps:

1. Change the kernel here, decide compatible / additive / breaking (above), and run the
   library's testbed against this working copy (`--skill`, above): modules released for the
   previous kernel must still pass — the kernel only adds (`backend-go.md` › Kernel versions).
2. Commit. The post-commit hook tags the release `rudis-monorepo/kernel/v<N>.<R>` whenever
   the commit changes what a project or the references contain (`scripts/kernel-tag.mjs`; CI
   fails on push for an untagged one). Push with `git push --follow-tags`.
3. In the library: `npm run kernel:sync -- --skill <this folder>` (the newest tag; it scaffolds
   from the tag, never from a working tree), `npm run testbed`, and commit `kernel/` by itself.
   Then update modules that should use what is new (`requires_kernel`, versions).

Never bypass the hook (`git commit --no-verify`) to land a failing check. If a check is wrong,
fix the check and say why in the same commit.

## One-time setup in a clone

```bash
git config core.hooksPath .githooks     # run from the repository root
```
