# NestJS Backend Standard

Read this together with [backend-modular-monolith.md](backend-modular-monolith.md) — the module boundary rules apply unchanged.

## Locked stack

```txt
Watcher    = nest start --watch  (via `npm run start:dev`)
Migration  = Prisma migration    (not TypeORM unless explicitly requested)
```

- Place the Prisma schema in `apps/api/prisma/schema.prisma`.
- Place migrations in `apps/api/prisma/migrations`.

## Root commands (NestJS)

```json
{
  "scripts": {
    "dev:web": "npm run dev -w apps/web",
    "dev:api": "npm run start:dev -w apps/api",
    "build:web": "npm run build -w apps/web",
    "build:api": "npm run build -w apps/api",
    "migrate:up": "npm run prisma:migrate -w apps/api",
    "migrate:deploy": "npm run prisma:deploy -w apps/api",
    "migrate:reset": "npm run prisma:reset -w apps/api"
  }
}
```

## `apps/api/package.json` scripts

```json
{
  "scripts": {
    "start:dev": "nest start --watch",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:reset": "prisma migrate reset",
    "prisma:generate": "prisma generate"
  }
}
```

The root `npm run dev:api` must delegate to `start:dev` (watch mode). Never run the API in production mode for local development.

## Module mapping in NestJS

Express the modular monolith using Nest modules. Each Nest module folder keeps the strict layered structure (`contracts/`, `application/`, `domain/`, `infrastructure/`, `presentation/`, plus the `*.module.ts` wiring). Only `contracts/` is importable by other modules.
