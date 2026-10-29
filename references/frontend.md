# Frontend Standard: `apps/web`

## Locked stack

```txt
React 19
Tailwind CSS 4
shadcn/ui on Radix (radix-ui, class-variance-authority, cn, lucide-react, tw-animate-css)
react-router-dom
Lazy-loaded routes/pages
Zustand
Zod
Axios
@/* import alias
```

Do **not** use by default: TanStack Query / Router / Table, Redis, Memcache. Use simple/static data patterns unless the user explicitly asks for advanced server-state, caching, or table libraries.

**Research first.** Before generating UI for a new project or a new screen type, do the design
research in [design-research.md](design-research.md) and write the brief to `knowledge/DESIGN.md`;
`frontend-design` then works from that brief.

When generating frontend UI inside `apps/web`, use the Claude skill named `frontend-design` as the UI/design authority — it drives aesthetic direction, typography, and layout so the result doesn't read as a templated default.

If `frontend-design` is not available (the skill isn't installed), **install it first, then use it** — do not silently skip it. It is an official Anthropic skill.

Source: https://github.com/anthropics/skills/tree/main/skills/frontend-design

Install it into the global skills directory (`~/.claude/skills/frontend-design`) so it's available in every project. Git sparse-checkout needs no extra tooling:

```bash
tmp="$(mktemp -d)"
git clone --depth 1 --filter=blob:none --sparse https://github.com/anthropics/skills.git "$tmp"
git -C "$tmp" sparse-checkout set skills/frontend-design
mkdir -p ~/.claude/skills
cp -R "$tmp/skills/frontend-design" ~/.claude/skills/
rm -rf "$tmp"
```

Windows PowerShell equivalent:

```powershell
$tmp = Join-Path $env:TEMP ([System.Guid]::NewGuid())
git clone --depth 1 --filter=blob:none --sparse https://github.com/anthropics/skills.git $tmp
git -C $tmp sparse-checkout set skills/frontend-design
New-Item -ItemType Directory -Force -Path "$HOME/.claude/skills" | Out-Null
Copy-Item -Recurse -Force "$tmp/skills/frontend-design" "$HOME/.claude/skills/"
Remove-Item -Recurse -Force $tmp
```

After installing, invoke `frontend-design` for the UI work. If installation genuinely can't proceed (e.g. no network), follow the frontend rules in this file and state clearly that `frontend-design` is the project's UI standard and was unavailable.

`frontend-design` decides the visual direction; shadcn/ui is the technical foundation that
direction is built on. They don't compete: the direction lands in the token values of
`theme.css` and in how primitives are composed, never in a second component system.

## UI foundation: shadcn/ui

The UI is built on [shadcn/ui](https://ui.shadcn.com) (style `new-york`, Radix base). Its
components are copied into the project, not imported from a package, so they are ours to
adjust. Locked because the module library's components and the `bingkai-navy` preset are
built on it — a project on another foundation could not install them.

- `apps/web/components.json` configures the CLI. `npx shadcn@latest add <name>` writes the
  component to `shared/components/primitives/` and adds any dependency it needs, with no edit
  afterwards.
- Class merging uses `cn` from the [`cn`](https://github.com/shadcn-ui/cn) package — shadcn's
  drop-in replacement for `clsx` + `tailwind-merge`, and what the CLI writes into every
  component (`import { cn } from "cn"`). That is why `aliases.utils` is `"cn"`. Do not add
  `clsx`, `tailwind-merge`, or a local `cn()` helper.
- The scaffold ships the primitives its starter pages use: `badge`, `button`, `card`, `dialog`,
  `input`, `label`, `skeleton`, `spinner`. Add the rest when a screen needs them.
- Icons: `lucide-react`. Anything beyond the foundation (toasts, command palette, charts,
  fonts) arrives with the module or preset that needs it, not up front.
- The scaffold's primitives are already styled the way the library's kits expect: `Button`
  variants mean `default` = primary, `outline` = secondary (bordered card surface with the card
  shadow), `ghost` = quiet text-primary action, `destructive` = danger; sizes `sm` 32px,
  `default` 36px, `lg` 44px; `loading` shows a spinner and disables the button. Every text
  field, select trigger, and textarea shares one look through `FIELD` in
  `shared/lib/field-classes.ts` — use it for any new field-like control instead of restating
  the classes.
- Keyboard focus is solid `--ring`: `Button` draws a 2px outline 2px out, `FIELD` turns its
  border `--ring` and adds a 1px `--ring` ring (`--destructive` when `aria-invalid`), and every
  other element gets the 2px outline from `theme.css`. A preset keeps `--ring` at 3:1 or more
  against `--card` and `--background` (WCAG 2.2 · 1.4.11); never a translucent `ring-ring/50`.

### UI kits: check them before writing a component

Generic UI beyond the primitives comes from four library kits, installed into `shared/` (and
auto-added by `module.mjs add`/`upgrade` when a module needs them):

| Kit | What it gives |
| --- | --- |
| `ui-core` | More primitives (table, select, tabs, popover, sheet, switch, …) and the page vocabulary: `Page`, `PageHeader`, `SectionCard`, `SummaryCard`, `StatusBadge` (tones success/warning/danger/info/neutral/muted), `Notice`, empty/error/not-found states, skeletons, `DescriptionList`, `Money`/`Qty`/`DocNumber`, `Modal`, `FormSheet`, `lib/format` (id-ID), and `hooks/use-resource` — how a page loads data (below). |
| `ui-data` | `DataTable` (sort, selection + bulk actions, column chooser, loading/error/empty), `Pagination`, `Toolbar`, `FilterBar`, `SearchInput`, `ActionMenu`, `NavTabs`. |
| `ui-forms` | `FormField` (label, hint, error, aria wiring), `PasswordInput`, `SearchSelect`, `AsyncSearchSelect`, `HierarchicalSelect`, `Segmented`, `MultiToggle`, `DateRangeFields`, `KeyValueEditor`, `LineItemsEditor`, `FileDropzone`, `Stepper`, form layout parts. |
| `ui-feedback` | Toasts (`notify.success/error(err)`), a global request loader, `ConfirmDialog`, `ReasonDialog`, error boundary. Registers its provider through `FrontendModule.provider`. |

Before writing a generic component, look in these kits (the `ui-gallery` module renders all of
them on one page). Default copy is Indonesian and every visible string is a prop, so a kit is
adjusted by passing text, not by forking it. A component the kits lack is built in `shared/`
in the same style and is a candidate to promote into a kit.

**Loading data on a page** goes through `useResource(load, deps)` from `ui-core`: when the
inputs change (page, search, filter) it aborts the previous request and drops any late answer,
so an old search can never overwrite the new one, and it keeps the last data while reloading.
Services accept the `AbortSignal` it passes (`httpClient.get(url, { params, signal })`). There is
no query cache by design (TanStack is outside the standard); a page owns its data.

**Errors and unknown addresses.** The router's root `errorElement` shows the app's own error
page (`shared/components/feedback/RouteError.tsx` — it recognises a page chunk an open tab can no
longer load after a deploy and offers a reload), and a catch-all route inside the layout shows
"not found" in the app's frame. Slot content is keyed by module, so a slot renders as a list.

## Structure

```txt
apps/web/
├── public/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── providers/
│   │   │   ├── AppProvider.tsx
│   │   │   └── RouterProvider.tsx
│   │   ├── modules.ts           # module registry (rudis:* markers)
│   │   ├── composition.ts       # nav + slots gathered from the registry
│   │   ├── layouts/
│   │   │   └── BareLayout.tsx   # frame for protected pages until a layout module is installed
│   │   └── routes/
│   │       ├── index.tsx        # builds the router: public, then guard → layout → protected
│   │       └── route-paths.ts   # app-level paths only
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   ├── schemas/
│   │   │   ├── stores/
│   │   │   ├── hooks/
│   │   │   ├── types/
│   │   │   └── module.tsx       # FrontendModule: paths, lazy pages, nav, slots
│   │   └── dashboard/
│   ├── shared/
│   │   ├── components/
│   │   │   ├── primitives/  # shadcn/ui as the CLI writes it (button, input, dialog, …)
│   │   │   ├── ui/          # generic compositions (data-table, form-field, page-header, …)
│   │   │   ├── patterns/    # page patterns (toolbar, stepper, sticky-footer, …)
│   │   │   └── feedback/    # LoadingState, EmptyState, ErrorState
│   │   ├── layouts/
│   │   ├── services/
│   │   │   ├── http-client.ts
│   │   │   ├── api-error.ts     # apiErrorMessage, apiFieldErrors (the API's own messages)
│   │   │   └── api-endpoints.ts
│   │   ├── stores/
│   │   ├── hooks/
│   │   ├── lib/             # formatter.ts, storage.ts
│   │   ├── composition.tsx  # NavItem, slots, useNavItems / useSlot
│   │   ├── types/           # frontend-module.ts, api.ts, pagination.ts
│   │   └── constants/
│   ├── theme/
│   │   ├── theme.css        # Tailwind entry + the token contract
│   │   └── fonts.ts         # font imports (a preset replaces it)
│   ├── styles/
│   │   └── globals.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── components.json          # shadcn CLI config
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── eslint.config.js
```

`primitives/` holds shadcn components as the CLI writes them; `ui/` composes them into generic
building blocks; `patterns/` composes those into page-level patterns. A component never imports
from a tier above its own.

## Module components vs shared components

`modules/<module>/components/` holds components specific to that module's domain (e.g. `OrderTable`, `OrderForm`, `OrderStatusBadge`, `DeleteOrderModal`).

`shared/components/` holds generic, domain-agnostic UI (e.g. `Button`, `Input`, `Modal`, `Table`).

Rules:

- A component stays in a module if it imports that module's types, services, stores, hooks, schemas, or domain constants.
- Do not move a component to shared just because it is used more than once *inside the same module*.
- Move to shared only when it is truly domain-agnostic and reusable *across* modules.
- Shared UI must not know domain statuses like `ORDER_PAID`, `STOCK_LOW`, or `PAYMENT_FAILED`.
- A frontend module never imports another module — the same rule as the backend
  ([backend-modular-monolith.md](backend-modular-monolith.md#core-rule)). What modules share
  goes through `shared/` (`http-client` hooks, shared stores, types); composing modules on one
  screen happens in `app/`. This is what lets a module be installed from the library on its own.

## Modules, routing, and composition

Use `react-router-dom`; pages must be lazy-loaded. Each module describes itself in
`modules/<module>/module.tsx` as a `FrontendModule` and is registered in `app/modules.ts` — the
frontend's one registry, which the module library installs into. A module never imports another
module; everything it contributes goes through this object:

| Field | What it contributes |
|---|---|
| `public` / `protected` | Its routes. Protected routes sit behind the guard and inside the layout. |
| `nav` | Entries for the app's navigation (`label`, `to`, `icon`, `group`, `order`). |
| `slots` | Content for named places in another module's screen. The frame's own are `"sidebar-footer"` and `"header-end"`; a module hosting a slot names it `"<owner>:<place>"` and documents it in its README (e.g. auth's `"user-menu:items"`, settings' `"settings:sections"`). Each module's content is keyed by its id. Slot names are open strings, so the compiler no longer catches a misspelled one — copy the name from the host's README. |
| `guard` | An element wrapping every protected route (renders `<Outlet />` when allowed). One module at most — normally auth. |
| `layout` | The frame around protected pages (renders `<Outlet />`). One module at most — normally the app shell. |
| `provider` | A component wrapping the whole app, e.g. the authorization module's `AccessContext`. |

### Permissions and app events

- `useCan("users.manage")` (`@/shared/access`) says whether to show something that needs a
  permission; `NavItem.permission` hides a nav entry the same way. Without an authorization
  module it is always `true` (matching the backend's "signed in = allowed"). It only hides UI —
  the API enforces every permission itself.
- `@/shared/app-events` (`emitAppEvent` / `onAppEvent`) is how a module tells the others
  something happened without importing them — e.g. auth emits `"session:changed"` and the
  authorization module reloads the user's permissions; users emits `"profile:changed"` and auth
  reloads the name in the user menu; `"scope:changed"` fires when the active company or branch
  changes, and every page reloads its data. Add an event name only for something every module
  may care about.
- `@/shared/scope` — the company/branch this tab works in: `useScope()`, `setScope("2:5")`
  (`"<company>"` or `"<company>:<branch>"`; empty = the user's default). The http client sends it
  as `X-Scope` on every request; the API refuses a scope the user is not placed in. Only an
  organization module's picker (slot `"shell:scope"` in the header) calls `setScope`; an app
  with one company never does.
- `shared/kernel.ts` states the kernel version (see [backend-go.md](backend-go.md#kernel-versions)).

```tsx
// modules/dashboard/module.tsx
import { lazy } from "react";
import { LayoutDashboard } from "lucide-react";
import type { FrontendModule } from "@/shared/types/frontend-module";

const DashboardPage = lazy(() => import("@/modules/dashboard/pages/DashboardPage"));

export const DASHBOARD_PATHS = {
  home: "/dashboard",
} as const;

export const dashboardModule: FrontendModule = {
  id: "dashboard",
  protected: [{ path: DASHBOARD_PATHS.home, element: <DashboardPage /> }],
  nav: [{ label: "Dashboard", to: DASHBOARD_PATHS.home, icon: LayoutDashboard, order: 0 }],
};
```

```ts
// app/modules.ts
// rudis:modules:imports:begin
import { authModule } from "@/modules/auth/module";
import { dashboardModule } from "@/modules/dashboard/module";
// rudis:modules:imports:end

export const frontendModules: FrontendModule[] = [
  // rudis:modules:begin
  authModule,
  dashboardModule,
  // rudis:modules:end
];
```

- `app/routes/index.tsx` builds the router: public routes, then the protected routes nested in
  the layout, nested in the guard. `app/composition.ts` gathers `nav` and `slots`;
  `App.tsx` provides them, and the layout reads them with `useNavItems()` / `useSlot()` from
  `@/shared/composition`. This is how an app shell shows a user menu from auth without either
  importing the other.
- `provider` wraps the whole app (registry order, outermost first) — how an authorization module
  supplies `AccessContext`.
- A module's paths live in its own `module.tsx`; `app/routes/route-paths.ts` holds app-level
  paths only. Installing a module never edits a file outside the registry.
- Keep the `rudis:*` markers; add registrations between them.
- Wrap lazy pages in Suspense/loading states.
- Pages have no outer frame or padding of their own: the layout owns them (`BareLayout` until a
  layout module such as the library's app shell is registered).
- Show the API's own error message (`apiErrorMessage`) and map 422 field errors onto the form
  (`apiFieldErrors`); never a generic "Something went wrong" when the API said why.

## Zustand

- Global app state → `shared/stores`.
- Module-specific state → `modules/<module>/stores`.
- Do not put everything in one giant global store.
- Use local `useState` / `useReducer` for local UI state.

## Zod

Schemas live in `modules/<module>/schemas/`.

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
```

Do not duplicate manual form types when `z.infer` can derive them. Keep module-specific schemas in their module.

## Axios

Centralized client in `src/shared/services/http-client.ts`:

```ts
import axios from "axios";
import { getScope } from "@/shared/scope";

export const httpClient = axios.create({
  // Empty = same origin. Proxied by Vite in dev, served by the same container in
  // production. Only set VITE_API_BASE_URL when web and api are deployed separately.
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  // A separate API origin only receives the session cookie when asked to.
  withCredentials: Boolean(import.meta.env.VITE_API_BASE_URL),
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// Hooks for the auth module, so it plugs in without editing this file.
let authToken: string | null = null;
const unauthorizedHandlers = new Set<() => void>();

/** Sets the bearer token sent with every request; null clears it. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Runs handler whenever the API answers 401. Returns a function that removes it. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

httpClient.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  // The company/branch this tab works in; the API checks it against the user's placement.
  const scope = getScope();
  if (scope) config.headers["X-Scope"] = scope;
  return config;
});

httpClient.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    unauthorizedHandlers.forEach((handler) => handler());
  }
  return Promise.reject(error);
});
```

- All HTTP requests go through `shared/services/http-client.ts`.
- `setAuthToken` and `onUnauthorized` are how an auth module attaches its token and reacts to
  an expired session — it never adds its own interceptor or edits this file.
- Modules must not create their own Axios instances.
- Module API calls live in `modules/<module>/services`.
- API paths follow `/api/v1`.

### Dev connectivity: proxy, not CORS

`httpClient`'s `baseURL` defaults to empty (same origin). In dev, `vite.config.ts` proxies
`/api` to the backend (`VITE_DEV_API_TARGET`, default `http://localhost:8080`); no CORS
headers are needed on any backend by default. This keeps dev on the same single-origin model
as production, where one container serves both the API and the built SPA. Only set
`VITE_API_BASE_URL` when web and api are genuinely deployed as separate origins.

## Import alias

Use `@/*` consistently. Avoid long relative imports (`../../../../shared/...`).

```ts
import { Button } from "@/shared/components/primitives/button";
import { userService } from "@/modules/users/services/user.service";
import { ROUTE_PATHS } from "@/app/routes/route-paths";
```

## Theme: the token contract

`src/theme/theme.css` is the one source of color, type, radius, and elevation. It is also the
Tailwind entry (`@import "tailwindcss"`, `tw-animate-css`) and the file `components.json` points
the shadcn CLI at; `styles/globals.css` imports it and holds only app-wide extras. The scaffold
copies it from this skill's `scripts/templates/web/theme.css` — read that file for the full
content rather than a copy here.

**Token names are a contract; token values belong to the project.** The names follow the shadcn
convention plus a few extensions, and every shared and library component is built against
them. A preset or the researched direction in `knowledge/DESIGN.md` changes the values; nothing
renames or removes a name. The scaffold's values are neutral on purpose.

The contract — every one of these is defined in `:root` (or `@theme inline` for the font and
text tokens):

```txt
--radius
--background --foreground --card --card-foreground --popover --popover-foreground
--muted --muted-foreground --secondary --secondary-foreground --border --input
--primary --primary-hover --primary-foreground --accent --accent-foreground --ring
--success --success-soft --warning --warning-soft
--destructive --destructive-foreground --destructive-soft --info --info-soft
--chart-1 --chart-2 --chart-3 --chart-4 --chart-5
--sidebar --sidebar-foreground --sidebar-muted --sidebar-strong --sidebar-accent
--sidebar-accent-foreground --sidebar-active --sidebar-primary --sidebar-primary-foreground
--sidebar-border --sidebar-ring
--row-py
--shadow-card --shadow-md --shadow-pop --shadow-glow
--font-sans --font-display --font-mono --text-2xs
```

`@theme inline` maps the colors to Tailwind utilities, so components use semantic classes:
`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary text-primary-foreground`,
`text-destructive`, `bg-success-soft text-success`, `font-display`, `text-2xs`. Table density
follows `<html data-density="compact|comfortable">` through `--row-py`.

- No raw colors in components: no hex, no palette utilities (`bg-blue-600`), no arbitrary
  values (`text-[#1e3a5f]`). If a needed color has no token, add the token to `theme.css`.
- `dark:` utilities apply under `<html class="dark">`. Dark values are defined by a preset or
  the project; the scaffold sets none.
- Changing the theme never requires editing a component.

## Presets

A preset is a ready-made set of token values plus the fonts that go with them, kept in the
module library (`rudis-modules`, `themes/<name>/`), e.g. `bingkai-navy` for dense
back-office apps. Applying one (`module.mjs preset <id>` — see
[module-library.md](module-library.md)) replaces `theme.css` (same token names, its own values)
and `fonts.ts`, and adds the font packages. With no fitting preset, set the values directly from
the design brief. Which preset (if any) a project uses
is a design decision recorded in `knowledge/DESIGN.md` — see
[design-research.md](design-research.md).
