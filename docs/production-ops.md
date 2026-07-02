# Production-ops notes (web)

Lightweight operational baseline for running the FieldRoute web app as real online software. Everything here
is **default-off**: local, staging, and CI behave identically until a deployment opts in. This is **not** an
auth implementation — authentication must be a proven external provider/edge (see "Auth").

## What this adds

| Concern | Seam | Default |
|---|---|---|
| CI | `.github/workflows/web-checks.yml` | typecheck + lint + pure checks + build on push/PR |
| Error observability | `src/lib/observability.ts` + `src/instrumentation.ts` | **off** (no DSN) |

## Environment variables

Runtime (product mode — existing):

- `NEXT_PUBLIC_TL2_PRODUCT_API=1` — enable the live `/v2/product` API client.
- `NEXT_PUBLIC_TL2_API_BASE` — full `http(s)` URL of the backend (validated via `new URL`).
- `NEXT_PUBLIC_TL2_TENANT` — tenant slug for the dev stand-in identity headers.
- `NEXT_PUBLIC_TL2_FIELD_EVIDENCE_THUMBS=1` — optional; render field-evidence photo thumbnails (only on
  deployments whose backend serves the photo route). Default off.
- `NEXT_PUBLIC_FR_INTERNAL` — leave **unset** for customer mode; `=1` exposes internal/dev tooling.

> These `NEXT_PUBLIC_*` values are **build-time inlined** — changing one requires a rebuild, not just a
> restart.

Observability (added by this baseline; optional, server-only):

- `FIELDROUTE_OBSERVABILITY_DSN` — when set, `reportError` emits a structured, non-sensitive server log
  (error name/message + route/kind only). Unset ⇒ no-op. No `NEXT_PUBLIC_` prefix on purpose: it is never
  inlined into the client bundle. It never logs tenant/session ids, request bodies, upload contents, query
  strings, cookies, or headers. A deployment that wants a provider (Sentry, etc.) installs its SDK and
  replaces the body of `reportError` / `register`; call sites stay the same.

## Rate limiting

The web app does **not** implement rate limiting. It belongs at the **edge (Cloudflare)** or a **managed API
gateway** in front of the deployment. (The backend ships a conservative default-off in-process guardrail as a
single-instance fallback — see `truelinev2/docs/production-ops-baseline.md` — not the production limiter.)

## Auth (explicitly out of scope)

No custom auth here. Staging is gated by **Cloudflare Access** (edge). A public production deployment needs a
**proven managed auth boundary** (Cloudflare Access / Auth0 / Clerk / equivalent) chosen by the owner. Do not
build a homemade user/session/security system.

## CI

`web-checks.yml` runs on Node 20: `npm ci`, `npm run typecheck` (`tsc --noEmit`), `npm run lint`, the
network-free check scripts (`check-contract-parity` — skips cleanly without the mobile checkout —
`check-pricing`, `check-field-evidence-read`, `check-review-readiness`), and a production `npm run build`
(served-mode redline fetch off, placeholder public env). `check-live-product-read.mjs` is excluded because it
needs a running backend. The workflow does **not** deploy.

## Staging vs production

Staging (`staging.fieldroute.io`) is Cloudflare-Access-gated with a demo store and is not a public
deployment. Before public production exposure: a managed auth boundary, edge rate limiting, and an
observability DSN must be in place. This baseline provides the **seams**; the owner picks the **providers and
hosting**.
