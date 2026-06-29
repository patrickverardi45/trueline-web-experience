# FieldRoute Web

FieldRoute is a simple OSP/HDD construction redline-intelligence platform. Upload a
project's source package once — plan PDFs, KMZ/KML route, bore logs, photos — and the
engine extracts the route and redline context, shows it on a clean map and a source-backed
proof view, and only asks you to review the items it flags as uncertain. Then it assembles
a closeout/export package.

> **Brand:** the product is **FieldRoute**. "TrueLine" is an internal engine codename only
> and must never appear in a customer-facing surface. See
> [`docs/product/fieldroute_product_direction.md`](docs/product/fieldroute_product_direction.md)
> — the canonical product-direction doc — before changing UI, routes, copy, or workflow.

## The product

One workspace, one page, one workflow:

```
Create / open a project
  → Upload source package (plan PDF, KMZ/KML, bore log, photos)
  → Auto context (route geometry, bore rows, redline candidates, uncertainty)
  → Simple map + source-backed proof review
  → Review only the uncertain items (accept / reject)
  → Closeout review → export / print package
```

## Routes

- `/` — landing page.
- `/intake` — **the customer workspace** (project list + the single-page workflow above).
- `/showcase` — finished-redline gallery (real engine output; read-only).
- `/internal/product-direction` — internal-only panel, gated behind
  `NEXT_PUBLIC_FR_INTERNAL=1` (404 otherwise).

The original V1/V2 mock surfaces (`/map`, `/plans`, `/redlines`, `/closeout`, `/evidence`,
`/feed`, `/packet`, `/settings`, `/projects`) and the mock-data layer have been **deleted** —
they were demo scaffolding, not the product.

## Data: live engine, no mock fallback

The workspace reads the real, tenant-scoped `/v2/product` API
(`src/lib/api/productWrites.ts`, `src/lib/api/liveV2Product.ts`). There is **no silent
fallback to mock data**: a failed read/write surfaces an honest error or empty state. The
redline comes from the real engine — recognized projects render automatically; uploaded
projects produce an engine REVIEW candidate the user accepts or rejects; when evidence is
missing the engine abstains with a named reason. Nothing is invented.

Product mode is enabled with `NEXT_PUBLIC_TL2_PRODUCT_API=1` plus `NEXT_PUBLIC_TL2_API_BASE`
and `NEXT_PUBLIC_TL2_TENANT`. (These env var names are internal and are never shown to
customers.)

## Internal / dev tooling

Manual bore-log row entry, manual on-plan route drawing, raw diagnostics, the file
inventory, and the product-direction panel are engineering/QA fallbacks. They are gated
behind `NEXT_PUBLIC_FR_INTERNAL=1` and never appear in the customer UI. The customer
workflow never requires hand-clicking geometry or recreating bore-log rows by hand.

## Run it

```sh
npm install
npm run dev      # http://localhost:3000
```

Verify: `npx tsc --noEmit`, `npm run lint`, `node scripts/check-live-product-read.mjs`.
Contract parity (vs. the mobile app) is checked by `npm run contracts:check`, which skips
cleanly when the mobile checkout isn't present (set `FIELDROUTE_MOBILE_ROOT` to run it).

## Architecture

```
src/
  contracts/        shared product contracts (mirrored in the mobile app)
  lib/
    api/            live /v2/product client (productWrites.ts, liveV2Product.ts) + types
    internalMode.ts the NEXT_PUBLIC_FR_INTERNAL dev/internal tooling gate
    jobLabels.ts    customer-facing labels + neutral aliases for seeded project ids
    workspaceSections.ts  the workspace section spine
  components/
    ui/             design system (Card, EmptyState, PageHeader, …)
    shell/          sidebar + topbar
    Product*.tsx    the /intake workspace (upload, map, bore log, redline, review, closeout)
  app/              /, /intake, /showcase, /internal/product-direction
docs/
  product/          canonical product direction
  audits/           senior audit, issue register, follow-up notes
```

## Boundaries

Independent product. Never imports the v2 engine or any other repo. No competitor UI,
code, or workflow is referenced or reproduced — competitive parity is built through our own
engine and architecture.
