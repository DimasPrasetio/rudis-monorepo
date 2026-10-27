# API Standard

## Versioning

Use API versioning by default: `/api/v1`.

```txt
GET    /api/v1/orders
POST   /api/v1/orders
GET    /api/v1/products
POST   /api/v1/auth/login
```

## Response shapes

Success:

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": []
}
```

Paginated:

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "total_pages": 10
  }
}
```

## Config and environment standard

Always create `.env.example`. Never create real `.env` files containing secrets.

Minimum variables:

```env
APP_ENV=development
APP_PORT=8080
APP_NAME=app-name

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=app_db

JWT_SECRET=change-me
JWT_EXPIRES_IN=24h

PUBLIC_DIR=
VITE_API_BASE_URL=
```

The DB connection string has **two different valid formats** — pick the one that matches the stack, never a value that mixes both:

```env
# Go — DSN consumed by database/sql, no URI scheme
DB_DSN=root:@tcp(localhost:3306)/app_db

# NestJS/Express — Prisma-style URI
DATABASE_URL=mysql://root:password@localhost:3306/app_db
```

- Go uses `DB_DSN` (`user:pass@tcp(host:port)/db`), not a scheme-prefixed URI. `database/sql` cannot parse a `mysql://` prefix, and golang-migrate's own URL is derived from this DSN at the point it's invoked (see `scripts/migrate.mjs`), not stored as a second variable.
- NestJS/Express use `DATABASE_URL` (`mysql://user:pass@host:port/db`). Prisma rejects the Go `@tcp(...)` form.
- Never combine both formats into one variable.
- Do not hardcode secrets; sensitive config uses environment variables.
- Frontend env variables must use the `VITE_` prefix. `VITE_API_BASE_URL` defaults to empty (same-origin, proxied by Vite in dev — see `references/frontend.md`); only set it when web and api are deployed separately.
- Do not add CORS middleware to any backend by default — dev connectivity is handled by the Vite proxy, not CORS. Same-origin in dev matches the same-origin production model (one container serving both API and SPA).
