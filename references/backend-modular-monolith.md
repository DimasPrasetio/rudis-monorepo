# Backend Standard: Modular Monolith (`apps/api`)

The backend must be a **Modular Monolith** regardless of language or framework (Go, NestJS, Express/Node, or another stack the user explicitly requests). The architecture stays the same across stacks — only the implementation details differ.

The reason for the modular monolith is to get clean module boundaries (so the codebase stays maintainable and could later be split) without paying the operational cost of microservices up front.

## Core rule

Each module is a boundary, and **a module never imports another module — not its internals,
not even its `contracts/`**. A module states what it needs as **ports** in its own `ports/`
folder and what it offers as **contracts** in its own `contracts/` folder. The two are
connected only in the **composition root** — the one place the app is assembled — by a small
adapter.

Why: a module that imports no other module can be installed, tested, upgraded, and replaced on
its own. That is what lets a module live in a shared library and be reused across projects: an
`auth` module works with the library's `users` module or with a project's own user table,
because it only depends on the port it declared.

## Strict module structure

Each backend module uses this structure:

```txt
modules/order/
├── contracts/          # what this module OFFERS: its client interface + the types it returns
├── ports/              # what this module NEEDS from outside: interfaces + types, owned here
├── application/        # use cases, application services, internal orchestration
├── domain/             # entities, value objects, domain rules
│   └── events/         # domain events (must exist as a concept; not every module emits events)
├── infrastructure/     # repositories, database queries, external adapters
├── presentation/       # HTTP handlers, controllers, routes
└── order.module        # module wiring/bootstrap
```

`events/` must exist as an architectural concept. Not every module needs to define events.
`ports/` exists only when the module needs something from outside itself.

## Ports, contracts, and the composition root

- **`contracts/` is owned by the provider.** It is the module's public surface: a client
  interface (`ProductClient`) and the plain types it returns. It never exposes domain
  entities, repositories, or services.
- **`ports/` is owned by the consumer.** It describes exactly what this module needs, in this
  module's own words and types — `order/ports.ProductCatalog` with only the two methods order
  calls, not all of `ProductClient`.
- **Only the composition root sees both.** It builds the provider, wraps the provider's client
  in an adapter that satisfies the consumer's port, and passes it to the consumer. Adapters are
  small (field mapping and a call), live in the composition root, never inside a module, and
  hold no business logic.

| Stack | Composition root |
|---|---|
| Go | `internal/modules/registry.go` (+ adapters beside it) — see [backend-go.md](backend-go.md#module-contract-and-the-registry) |
| NestJS | the root `AppModule`: bind each port token with `useFactory` over the provider's client |
| Express | the app bootstrap that builds the modules and mounts their routers |

Correct:

```txt
OrderModule  -> order/ports/ProductCatalog            (its own port)
composition root: productCatalogAdapter(ProductModule.Client()) satisfies order/ports/ProductCatalog
```

Forbidden:

```txt
OrderModule -> ProductModule/contracts/ProductClient   (imports another module)
OrderModule -> ProductModule/application/ProductService
OrderModule -> ProductModule/infrastructure/ProductRepository
OrderModule -> ProductModule/domain/ProductEntity
```

A port names what the consumer needs, not who provides it: `ports.UserStore`, not
`ports.UsersModule`. Keep ports narrow — only the methods the module actually calls.

## Core modules

`auth` and `users` are normal modules but considered core. Other modules must not query
users/auth tables directly; they declare a port for what they need about a user.

```txt
modules/
├── auth/
├── users/
├── roles/
├── permissions/
└── ...
```

Correct: `OrderModule -> order/ports.UserDirectory.GetUser(id)`, wired to the users module's client
Forbidden: `OrderRepository JOIN users`

## Backend shared folder

Backend `shared/` contains only technical utilities — never domain logic.

```txt
shared/
├── errors/
├── response/
├── request/
├── logger/
├── validator/
├── pagination/
└── utils/
```

(Go names the error package `apperror/` so it never shadows the standard library's `errors`.
The Go kernel and its module contract are in [backend-go.md](backend-go.md#the-kernel).)

Do not put order/product/payment/customer business rules in `shared/`.

## Database boundary

- A repository may only access tables owned by its own module.
- Cross-module joins are forbidden by default.
- Cross-module relations are stored as primitive IDs, not physical foreign keys.

```txt
orders.customer_id   # primitive ID, OK
orders.product_id    # primitive ID, OK
```

Do not create DB-level foreign keys to `customers` or `products` across module boundaries. Validate and look up through the module's own ports instead:

```txt
order/ports.CustomerDirectory.Exists(customerId)
order/ports.ProductCatalog.GetPrice(productId)
```

## Transaction and orchestration

- Cross-module flows are handled by an application service / orchestrator through the module's ports.
- **Go (kernel 6+): one transaction across modules.** The orchestrator wraps the flow in
  `d.Tx.Do(ctx, …)`; every port it calls receives that `ctx` and its provider's repository
  joins the transaction (`queries.New(d.Tx.Conn(ctx))`). Stock, sales, and ledger commit or roll
  back together — one MySQL, one process, no saga. Effects outside the database never run inside
  it: they are tasks (`d.Tasks.Enqueue`) written in the same transaction.
- **Reactions are events, not calls**: what other modules do *because* something happened
  (notify, recalculate, post to the ledger later) is `d.Events.Publish` inside the transaction —
  each subscriber runs later in its own transaction, at least once, unordered. What must be true
  *in the same commit* is a port call inside `d.Tx`, never an event.
- NestJS / Express have no shared transaction in their kernel: DB transactions stay inside one
  module and the rules below apply.

Example flow:

```txt
OrderApplicationService
  -> ports.ProductCatalog.CheckStock()
  -> OrderRepository.Create()
  -> ports.ProductCatalog.DecreaseStock()
  -> ports.Payments.CreatePayment()
```

Never call another module's repository directly.

Without a shared transaction (Node stacks, or a step that calls an outside system), a flow
across modules is **not atomic** — each step commits on its own. Order the steps
so that a failure part-way leaves nothing wrong: check first, then the step that is easiest to
undo, the hardest last; make each step safe to repeat (an idempotency key, or "set" rather than
"add"); and on failure after a commit, run the compensating call (`ReleaseStock` for
`DecreaseStock`) or record the flow as failed for someone to finish. When a flow must be all or
nothing, the data belongs in one module.

## Company and branch scope

An app may serve several companies or branches (one client, one deployment). The request's
scope — one company, optionally one branch — is resolved by the kernel (Go:
`kernel.ScopeFrom(ctx)`); the organization structure itself is a module. A module whose data
belongs to a company declares it (`"scoped": true`): every table carries `company_id` (and
`branch_id` where it means something), business keys include it, and every query filters by it
**explicitly** — there is no hidden global filter. Modules whose data is not a company's
(sessions, a CMS) carry nothing. Without an organization module everything is company 1.

## Deleting data other modules point at

Records other modules refer to — people, customers, products — are **deactivated, never
deleted**: references stay valid, history stays readable, and no module has to be told. Lists
and pickers show active records; a lookup by ID still returns inactive ones (with their state)
so old documents render. Hard delete is only for data nothing else can refer to.
