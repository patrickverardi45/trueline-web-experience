# TrueLine Web Experience

Contract-first website/dashboard for TrueLine — an OSP/fiber construction
intelligence platform. Plans, bore logs, field evidence, redlines, station
data, photos, and closeout in one clean workflow.

**Everything here runs on mock data.** No backend, no auth, no engine
imports. The typed API boundary (`src/lib/api`) is where the TrueLine v2
engine plugs in later.

## Run it

```sh
npm install
npm run dev
```

Open http://localhost:3000.

Verify: `npx tsc --noEmit` and `npm run build`.

## Surfaces

Dashboard `/` · Project detail `/projects/[id]` · **Hero Map** `/map`
(status-colored redline paths, evidence panel, Redline Playback) ·
Plan Viewer `/plans` (redline overlay, before/after slider, evidence pins,
station search, matchlines) · Redline Review `/redlines` · Evidence Explorer
`/evidence` · Field Feed `/feed` · Closeout Readiness `/closeout` · Packet
Builder `/packet` · Settings `/settings`.

## Architecture

```
src/
  contracts/        16 shared TrueLine contracts (mirrored in the mobile app)
  lib/
    api/            TrueLineApi interface + mock client + fixtures
    status.ts       status → label/color maps (single source)
    format.ts       ft/pct/date helpers
    geometry.ts     polyline math for redline paths
  components/
    ui/             design system (Card, StatusPill, KpiStat, rings, meters…)
    shell/          navy sidebar + topbar
    map/            Hero Map (SVG canvas, evidence panel, playback bar)
  app/              one folder per surface (server components + colocated
                    client components)
docs/
  PRODUCT_UX_PLAN.md   product UX plan
  CONTRACTS.md         contract spec (v0.1)
  MOBILE_ALIGNMENT.md  mobile M8 alignment + migration plan
```

Design tokens live in `src/app/globals.css` (Tailwind v4 `@theme`): dark
navy chrome, steel canvas, white cards, safety-orange accent — shared brand
family with the TrueLine Field mobile app.

The Hero Map and plan sheets are custom SVG surfaces by design: zero
map-provider/PDF dependencies in the preview, and the geometry contracts
(`RedlinePath`, `SheetPin`) stay renderer-agnostic for later.

## Boundaries

Independent product. Never imports from `TrueLine_Beta`, the v2 engine, or
any other repo. No competitor UI/workflows were referenced.
