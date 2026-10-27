# Express / Node.js Backend Standard

Read this together with [backend-modular-monolith.md](backend-modular-monolith.md) — the module boundary rules apply unchanged.

## Locked stack

```txt
Watcher    = nodemon     (never `node server.js` as the dev workflow)
Migration  = NOT LOCKED  (ask the user)
```

The migration tool for Express is **not locked** by this standard. If the user selects Express and does not specify a migration tool, ask a concise clarification before implementing database migration — do not silently pick one.

## Root commands (Express)

```json
{
  "scripts": {
    "dev:web": "npm run dev -w apps/web",
    "dev:api": "npm run dev -w apps/api",
    "build:web": "npm run build -w apps/web",
    "build:api": "npm run build -w apps/api"
  }
}
```

## Watcher: nodemon

`apps/api/package.json` just delegates to nodemon's own config, so the entrypoint has one home:

```json
{
  "scripts": {
    "dev": "nodemon"
  }
}
```

`apps/api/nodemon.json` owns the actual entrypoint:

```json
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "ts-node src/index.ts"
}
```

Keep `nodemon` as the watcher; adjust `nodemon.json`'s `exec` to match the generated structure
rather than duplicating the entrypoint in `package.json` too.

## Module and TypeScript

Express uses **CommonJS** (`module: "CommonJS"`, `moduleResolution: "node"`), without
`"type": "module"`. This is deliberate: `ts-node` + nodemon work without an extra loader, and
relative imports don't need a `.js` extension.

Do not use `moduleResolution: "bundler"` — there is no bundler in this flow, and its emitted
output fails at Node runtime as soon as there's a second file.

## Module structure

Express has no framework-imposed module system, so enforce the modular monolith by folder convention: each module keeps `contracts/`, `application/`, `domain/` (+ `events/`), `infrastructure/`, `presentation/`, and a module wiring file. Only `contracts/` is importable by other modules.
