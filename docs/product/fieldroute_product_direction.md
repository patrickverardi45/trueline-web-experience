# FieldRoute — Canonical Product Direction

> This is the **source-of-truth product-direction document** for FieldRoute. Future
> engineering sessions (human or AI) should read this **before** changing UI, routes,
> schemas, copy, or workflow. If a proposed change conflicts with this doc, the change
> is wrong until this doc is deliberately updated.

---

## 1. Product principles

1. **Upload once, let the engine do the work.** The user uploads real field/project
   files one time. The system extracts route, redline, and work context. We do not make
   the user re-key data the files already contain.
2. **Source-backed or nothing.** Every redline, station, and quantity must trace to an
   uploaded source (PDF page, bore log row, KMZ feature). When the source is missing or
   ambiguous, we **abstain or flag for review** — we never invent geometry or numbers.
3. **Ask only when uncertain.** The customer is interrupted only for items the engine
   itself flagged as uncertain. Confident placements are shown, not re-confirmed.
4. **Simple beats clever.** One project, one page, one primary action at a time. If the
   UI gets more complex, we failed.
5. **Honest states.** No silent fallback from live data to mock data. Unavailable means
   "unavailable," shown plainly — never a fake "processed" state or placeholder value.
6. **The engine is the moat.** The unique advantage is source-backed redline extraction
   and route/proof intelligence. Do not dilute it into a generic project-management board.

## 2. Target user

Primary: **OSP fiber / HDD construction operators** — contractors, ISPs, OSP engineers,
HDD drillers — and the people who consume their as-builts: **inspectors, municipalities,
and owners**.

The test for any screen: *could a real HDD driller or OSP foreman understand it without
us narrating for 20 minutes?* If not, simplify.

## 3. Main workflow (the only customer workflow)

```
1. Create / open a project (workspace).
2. Upload a source package: plan PDF, KMZ/KML, bore log, photos, notes, field files.
3. The app auto-extracts: project context, route geometry, street/route names,
   bore/redline candidates, source anchors, and an uncertainty score.
4. The app shows a simple map + source-backed proof view (PDF page with redline).
5. The user reviews / accepts / corrects ONLY the uncertain items.
6. The app produces approved redlines, progress, and a closeout / export /
   billing-ready package.
```

This maps to the workspace sections already in the app: **Overview → Project files →
Map/Route → Bore log → Redline → Review & correct → Closeout review → Export & print**
(`src/lib/workspaceSections.ts`). Keep that spine. Do not add parallel navigation.

## 4. What the app is NOT

- **Not** a developer console or "dev board." No raw slots, SHAs, status codes, or env
  vars in the customer view (those live behind "Diagnostics / Technical details").
- **Not** a generic Kanban / project-management board.
- **Not** a manual data-entry tool. Manual bore-log rows and manual anchor-clicking are
  **internal/dev/QA fallback only**, never the main path.
- **Not** a field-capture app *(yet)*. Field photo/GPS/offline capture is a planned
  parity gap (§9), not something to bolt onto the office workspace ad hoc.
- **Not** a clone of any competitor. We build equivalent **outcomes** with our own engine.

## 5. Naming rules

- **Product brand is `FieldRoute`.** It is the only name a customer may ever see.
- **`TrueLine` is an internal engine/project codename.** It must not appear in any
  customer-facing surface: titles, metadata, labels, plan-sheet stamps, settings, emails,
  filenames, or error text.
- **No hardcoded customer / city / person / project / dataset names** in reusable code,
  routes, env vars, schemas, UI labels, or fixtures. This includes "Demo Project 001,"
  "Sample Fiber Co-op," fake member rosters, and street/station sample data.
- **Approved generic vocabulary:** `project`, `customer`, `workspace`, `artifact_bundle`,
  `staging_viewer`, `upload_intake`, `proof_viewer`, `source_package`, `route_context`,
  `field_report`, `construction_progress`.
- **Do not leak engine jargon** into customer copy: `source anchor`, `corpus`, `frontier`,
  `reviewed bore-log`, `engine_ready`, `MANUAL_ENTRY`, `TABLE_IMPORT`, `TL2`,
  `X-TL-Tenant`. Translate to plain English in the UI; keep raw terms behind Diagnostics.

## 6. Simplicity rules

- One project = one scrollable page. The sidebar is anchors, not a maze of routes.
- One owner per action: Redline = Generate, Review = Accept/Correct, Closeout = Assemble,
  Export = Download/Print.
- Surface exactly **one** primary next action at a time (the workspace already derives
  this — preserve it).
- Disabled buttons must always state *why* they are disabled, inline.
- Default to decluttered views (e.g. KMZ route-only; per-address points behind a toggle).
- Prefer "honest empty" over a populated-looking fake.

## 7. Dev-tooling boundaries

- Manual bore-log entry and manual source-anchor capture **stay collapsed** behind an
  "Advanced / temporary fallback" disclosure. They never gate the customer's happy path.
- Internal/dev-only surfaces (e.g. the Product Direction Panel, raw fixtures, mock
  galleries) must be **gated behind an explicit flag or internal route** and must never
  appear in customer navigation. The gate for internal UI is `NEXT_PUBLIC_FR_INTERNAL=1`.
- Mock/fixture data is for local development only and must never be reachable as a
  customer-facing page. The current legacy mock routes are redirected by middleware;
  the standing direction is to **delete** them, not lean on the redirect.

## 8. Competitive parity boundaries (no-copy)

We benchmark FieldRoute against **public, industry-standard** field-construction product
**outcomes** (simple mobile capture, live map progress, inspect/approve, single source of
truth, PDF support, marker navigation, permit/area viz, task/progress, billing docs,
offline tolerance, in-product onboarding). We **do not** copy any competitor's UI, code,
workflow, screenshots, trade dress, private behavior, or implementation. Parity is
achieved through our **own** engine and architecture, or it is not shipped.

## 9. Current engine strengths (keep and lead with these)

- Real `/v2/product` adapter with **no silent mock fallback** (`liveV2Product.ts`,
  `productWrites.ts`) — failures surface honestly.
- **Source-backed redline pipeline**: recognized-corpus automatic render → uploaded-corpus
  engine REVIEW candidate (accept/reject, never faked AUTO) → honest ABSTAIN with named
  blockers. Confidence is graded and capped below AUTO.
- **Real WGS84 KMZ/KML route geometry** parsed server-side and drawn cleanly
  (`ProductRouteMap.tsx`), route-only by default, never inventing street labels.
- **Honest closeout/export**: KMZ is blocked (not faked) for pixel-only redlines;
  billing shows quantities, not invented dollars.
- A clean typed contract boundary (`src/contracts`, `src/lib/api/types.ts`).

## 10. Current engine gaps (the real backlog)

- **Auth & tenant isolation** rely on a client-supplied dev stand-in header
  (`X-TL-Tenant`) plus an external access gate — not real per-tenant authorization.
- **Map has no basemap / street context** — the user cannot orient the route to real
  streets or navigate to a marker.
- **No field-capture / offline path** on web (photos, GPS, notes from the field).
- **Upload intake is unbounded base64-JSON** with extension-only validation and no size
  cap — a reliability and safety gap.
- **No in-product onboarding / help.**
- **Engine jargon still leaks** into a few customer-facing strings.

## 11. Near-term product target

The next slice is the smallest one that advances the real workflow without copying anyone:

> **"Source Package → Auto Context → Simple Map/Proof Review."**
> Upload PDF/KMZ/bore-log/photos as one package → the app shows extracted project/route
> context → the map shows route + redline candidates → the PDF proof shows the
> source-backed redline → the review queue shows **only** uncertain items → manual entry
> stays hidden as a dev fallback.

Most of the backend for this already exists. The work is **consolidation and
simplification of the front end onto the `/intake` workspace**, deletion of the legacy
mock surfaces, removal of brand/jargon leaks, and the upload/auth guardrails — not a
rewrite.
