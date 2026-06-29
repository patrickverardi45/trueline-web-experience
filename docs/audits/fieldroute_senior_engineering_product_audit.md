# FieldRoute — Senior Engineering & Product Audit

**Repo:** `trueline-web-experience` · **Head:** `429df792189e5a1eecc52219638490139106a41c`
**Date:** 2026-06-29 · **Reviewers:** 12-discipline senior panel (simulated)
**Companion docs:** [`fieldroute_product_direction.md`](../product/fieldroute_product_direction.md) ·
[`fieldroute_issue_register.json`](./fieldroute_issue_register.json)

---

## 1. Executive summary

FieldRoute is **further along than it looks, and worse positioned for a demo than it
should be.** The live product engine (`src/lib/api/liveV2Product.ts`,
`src/lib/api/productWrites.ts`) is genuinely good: a source-backed redline pipeline with
honest abstain/review states, no silent mock fallback, real WGS84 KMZ parsing, and a
gated closeout/export path. That is the moat, and it mostly works.

The problem is everything wrapped around it:

- The **internal codename "TrueLine" leaks into the customer-facing browser title and
  across the UI** — the first thing a buyer sees in their tab is the wrong brand.
- The repo still carries an entire **second app**: the original V1/V2 mock surfaces
  (`/map`, `/plans`, `/redlines`, `/closeout`, `/evidence`, `/feed`, `/packet`,
  `/settings`). They are stuffed with "Demo Project 001," "Sample Fiber Co-op," a fake
  member roster, "mock decision" buttons, and disabled-button traps. They are currently
  hidden only by a **middleware redirect** — one config edit, or one bookmarked URL into
  an unmatched path, from being on screen in front of a contractor.
- A repo doc literally named **`HECTOR_DEMO_CHECKLIST.md`** ships a person's name, a
  Windows path (`C:\Nova\...`), and "no configured Git remote" notes.
- **Security rests on an external Cloudflare Access gate plus a client-supplied
  `X-TL-Tenant` header.** There is no app-level auth and tenant isolation is advisory.
- **Uploads are unbounded base64-JSON** with extension-only validation.

None of these require a rewrite. The fix is **subtraction**: delete the legacy app,
strip the brand/jargon leaks, add two guardrails (upload size, honest status), and put
the customer on the one workflow that already works. **If the UI gets bigger, we failed.**

**Demo verdict today: not ready.** A contractor opening this cold would see the wrong
brand name, and a single stray click/bookmark would drop them into a mock console.
Achievable in ~2 weeks of disciplined cleanup (§13).

---

## 2. Current product diagnosis

There are **two apps in one repo**:

| | Legacy "office" app (V1/V2) | Live product app (current direction) |
|---|---|---|
| Entry | `/`, `/map`, `/plans`, `/redlines`, `/closeout`, `/evidence`, `/feed`, `/packet`, `/settings`, `/showcase` | `/intake?workspace=1` (+ `/` landing, `/showcase`) |
| Data | mock fixtures (`src/lib/api/mock/*`) | real `/v2/product` API (`productWrites.ts`, `liveV2Product.ts`) |
| State | redirected away by `src/middleware.ts` | the actual shipped workflow |
| Quality | demo residue, hardcoded names, disabled traps | honest, source-backed, mostly clean |

`src/middleware.ts:9-23` redirects the legacy routes to `/intake`. So the **real
product** is the single-page workspace (`ProductIntake` → `ProductWorkspace`), and it
follows the intended flow: Overview → Project files → Map → Bore log → Redline → Review →
Closeout → Export. That spine is correct and should be preserved.

The diagnosis is therefore **not "build the product"** — it largely exists — but **"stop
shipping the old one alongside it, and stop leaking the codename/jargon."**

---

## 3. Ocius-X public-capability gap comparison (no copying)

We compare against *public, industry-standard* field-construction outcomes only. No
competitor UI/code/workflow was referenced or reproduced; the column below is our own
assessment of capability parity.

| Public capability (industry-standard) | FieldRoute today | Gap / our path |
|---|---|---|
| Simple mobile/field app | Office web only; no field app on web (by design) | **Gap.** Planned separate field surface; do not bolt onto office workspace. |
| Field photo/note/work capture | Photos can be uploaded as files; no capture flow | **Gap.** Add capture later via our own contracts. |
| Live visual map progress | Real KMZ route map (`ProductRouteMap`); no progress/time-lapse layer in product | **Partial.** Add a progress layer keyed to review/placement state. |
| Inspect & approve workflow | Engine REVIEW candidate → accept/reject; closeout review | **Strong / parity.** |
| Single shared source of truth | Tenant-scoped jobs; but auth is advisory | **Partial.** Needs real auth/roles. |
| PDF/design support | Source-backed PDF proof + redline render | **Strong / parity (our differentiator).** |
| Marker/location navigation | Route geometry only; no basemap/markers/nav | **Gap.** Owner-approved basemap follow-up. |
| Permitting/area visualization | KMZ polygons render as areas | **Partial.** |
| Task/progress management | Workflow stages per job; no task list | **Partial — and intentionally NOT a PM board.** |
| Billing/invoice/progress docs | Quantities-based closeout PDF/ZIP; dollars only when server-computed | **Strong / parity.** |
| Offline-tolerant field use | None on web | **Gap.** Field-surface concern. |
| Fast in-product onboarding/help | None | **Gap.** Add lightweight guided first-run. |

**Where we already win:** source-backed redline extraction and proof from uploaded
plans/bore-logs/KMZ. Lead the demo with that, not with a map or a task board.

---

## 4. Senior review panel — findings by discipline

Each lane lists: strong / broken-risky / overcomplicated / missing-for-field /
demo-embarrassment / simplify / hide-behind-dev-flag / make-permanent /
security-reliability, with concrete file references. Issue IDs reference
`fieldroute_issue_register.json`.

### 4.1 Senior Product Architect
- **Strong:** the `/intake` single-page workspace is the right shape; one project, one
  page, one primary action (`ProductWorkspace.tsx:400-410`).
- **Broken/risky:** two apps in one repo; the README and `PRODUCT_UX_PLAN.md` still
  describe the redirected legacy surfaces as *the* product (FR-AUDIT-008).
- **Overcomplicated:** legacy `/redlines` has a mock queue *and* engine cards *and* a
  manifest panel *and* a run-assembly panel — four paradigms (FR-AUDIT-006).
- **Demo embarrassment:** `HECTOR_DEMO_CHECKLIST.md` (FR-AUDIT-005).
- **Simplify / make permanent:** collapse onto the workspace spine; delete the rest.

### 4.2 Senior Security Engineer
- **Broken/risky (P0):** no app-level auth. Identity is the client-set `X-TL-Tenant` /
  `X-TL-Session` headers, explicitly "dev stand-in, NOT real auth"
  (`liveV2Product.ts:6-7,53-56`; `productWrites.ts:1-5,66-69`). Tenant isolation depends
  entirely on an external Cloudflare Access gate. If Access is bypassed/misconfigured, a
  client can set any tenant and read/write another tenant's project (FR-AUDIT-002).
- **Broken/risky (P0):** uploads are unbounded base64-JSON; no size cap; extension-only
  type check (`productWrites.ts:75-83,194-216`; `ProductUploadPanel.tsx`). Large file →
  tab OOM and an unbounded POST body; no content/magic-byte validation (FR-AUDIT-004,
  FR-AUDIT-010).
- **Missing:** no rate limiting / size limits evidenced on the intake path.
- **Make permanent:** real session auth + server-enforced tenant scoping; signed upload
  with size/type/content checks.

### 4.3 Senior Application Architect
- **Strong:** clean API seam (`src/lib/api/index.ts`) — one decision (`productApiEnabled()`)
  swaps mock ↔ live; pages stay untouched.
- **Overcomplicated / dead code:** two map paradigms — mock `HeroMapView`/`MapCanvas`
  vs real `ProductRouteMap` (FR-AUDIT-019); whole `mock/*` tree exists only to feed
  redirected routes (FR-AUDIT-018).
- **Simplify:** delete `src/app/{map,plans,redlines,closeout,evidence,feed,packet,
  settings,projects}` and `src/lib/api/mock/*` + `reviewerReads` fixtures once the
  showcase is reconfirmed; shrink the bundle and the attack surface.

### 4.4 Senior Backend Engineer
- **Strong:** defensive compose functions everywhere (`asRecord`, `strOrNull`, honest
  empty) — the adapter tolerates partial backend shapes without fabricating
  (`liveV2Product.ts:64-123`).
- **Risky:** `composeRedlineManifestView` sets `projectName: tenant`
  (`liveV2Product.ts:105-106`) — the tenant id is shown as the project name; ensure that
  is never a customer/identifier leak.
- **Make permanent:** the `/v2/product` contract is the real integration surface — keep
  the JSON-free, unit-checkable convention (`check-live-product-read.mjs` passes).

### 4.5 Senior Frontend / UX Engineer
- **Broken (P0):** `layout.tsx:20-21` browser title = `'TrueLine — OSP construction
  intelligence'`, template `'%s · TrueLine'` (FR-AUDIT-001).
- **Broken:** `Sidebar.tsx:174-176` hardcodes a green "Live product API" dot regardless
  of mode; `Topbar.tsx` claims "Access-gated" unconditionally (FR-AUDIT-011).
- **Demo embarrassment:** disabled-button traps in legacy `/settings` ("Connect engine,"
  "Configure") and `/redlines` ("Reset mock decision," disabled comment box)
  (FR-AUDIT-006/007); weak inline rationale on capture/bore-log disabled buttons
  (FR-AUDIT-016).
- **Simplify:** lock the lint rule down — 7 `react-hooks/set-state-in-effect` errors make
  `npm run lint` red (FR-AUDIT-012).

### 4.6 Senior Geospatial / GIS Engineer
- **Strong:** `ProductRouteMap.tsx` projects real WGS84 with a cos(lat) correction, fits
  to all coords, hides the per-address point layer by default — clean, honest, no invented
  labels (`ProductRouteMap.tsx:30-55,116-121,187-190`).
- **Missing for field (P2):** no basemap / street context / marker navigation. A driller
  cannot orient the route to real streets (FR-AUDIT-017) — the top GIS parity gap.
- **Good call:** KMZ is decluttered, not raw-dumped — keep that.

### 4.7 Senior OSP Fiber Construction Engineer
- **Strong:** the redline candidate carries `matchlineContinuity`, `referencedSheets`,
  `whyNotAuto` blockers, and a graded confidence band (`productWrites.ts:799-835`) — that
  is real OSP-aware proof, not a toy.
- **Risky:** customer copy leaks `frontier`, `corpus`, `reviewed bore-log`, `engine_ready`
  (FR-AUDIT-009). An OSP foreman reads "frontier 50/58" as jargon, not progress.
- **Missing:** no as-built progress/footage-placed view tied to the map.

### 4.8 Senior HDD / Directional Drilling Engineer
- **Strong:** bore-log rows carry `footageFt`, `depthMinFt`, `bocMinFt` (bore-on-center),
  `printRaw`, with **honest null** when the source did not carry them
  (`productWrites.ts:234-251`) — correct discipline; no invented depths.
- **Risky:** the whole HDD chain hinges on a **reviewed bore-log** that, on the upload
  path, still needs human confirmation before the engine runs. Confirm the auto-extract
  (`extractBoreLogRows`, `TABLE_IMPORT`) is the default and hand-entry is truly fallback
  (it is, per `ProductReviewedBoreLogGate.tsx:7-8,293-301`) — keep it that way.
- **Domain correctness:** never auto-place a bore without per-bore termini; the engine
  already blocks this (`NO_PER_BORE_TERMINI`) — preserve.

### 4.9 Senior QA / Test Automation Engineer
- **Strong:** zero-dependency node checks for the product adapter pass
  (`check-live-product-read.mjs` → "live product read checks passed").
- **Broken:** `npm run lint` fails (7 errors, FR-AUDIT-012); `npm run contracts:check`
  fails because it reads a hardcoded sibling path `/home/user/trueline-field-mobile/...`
  (`check-contract-parity.mjs`) that does not exist outside the author's machine
  (FR-AUDIT-013).
- **Missing:** no component/integration tests for the workspace flow; no smoke test that
  asserts "no `TrueLine`/`mock`/`Demo Project` string renders in customer routes."

### 4.10 Senior DevOps / Release Engineer
- **Risky:** `next.config.ts` hardcodes `allowedDevOrigins: ['staging.fieldroute.io']`
  and forces global `Cache-Control: no-store` — staging-specific config committed to
  source; the cache header will hurt a real production deploy (FR-AUDIT-015).
- **Risky:** `npm run build` runs `scripts/fetch-redline-bundle.mjs` first — a network
  fetch in the build path; build reproducibility depends on that bundle being reachable.
- **Make permanent:** a CI gate that runs lint + tsc + the node checks + a "no banned
  strings in customer routes" grep before any deploy.

### 4.11 Senior Data / Document Extraction Engineer
- **Strong:** extraction is explicitly **untrusted-until-reviewed**: `TABLE_IMPORT`
  rows land `UNREVIEWED`, no fabricated confidence, no OCR claims
  (`productWrites.ts:404-417`). Honest.
- **Missing for field:** the upload path stores files untrusted with *no* server-side
  extraction wired in the demo (`extraction_status: "queued"`), so "auto context" is
  partly aspirational on a brand-new uploaded project — the recognized-corpus path is what
  actually auto-renders. Make the "what happens next" copy match reality (FR-AUDIT-009).

### 4.12 Senior Commercialization / Buyer-Readiness Engineer
- **Demo blocker:** wrong brand in the tab title (FR-AUDIT-001) + reachable mock console
  one edit away (FR-AUDIT-006) + `HECTOR_DEMO_CHECKLIST.md` in-repo (FR-AUDIT-005).
- **Strong selling point:** source-backed redline + honest abstain is a genuinely
  defensible story for buyers — but only if the surrounding clutter is gone.
- **Make permanent:** an internal Product Direction Panel (gated) so every future session
  builds toward the same vision (delivered in this pass at `/internal/product-direction`).

---

## 5. Severity-ranked issue list

Full evidence and fixes in `fieldroute_issue_register.json`. Summary:

### P0 — demo-blocking or security-critical
- **FR-AUDIT-001** — "TrueLine" codename in customer-facing browser title/template & UI.
- **FR-AUDIT-002** — No app-level auth; tenant isolation via client-set header + external gate.
- **FR-AUDIT-003** — `/showcase` (homepage-linked, customer-reachable) leaks `NEXT_PUBLIC_TL2_*` env vars + "frontier" jargon in its not-configured/error states.
- **FR-AUDIT-004** — Unbounded base64-JSON uploads; no size cap (OOM / large-body risk).

### P1 — must fix before a serious demo
- **FR-AUDIT-005** — `HECTOR_DEMO_CHECKLIST.md`: person name, Windows path, repo-state notes.
- **FR-AUDIT-006** — Legacy mock surfaces still in repo (Demo Project 001, Sample Fiber Co-op, mock decisions, disabled traps) — hidden only by redirect.
- **FR-AUDIT-007** — `/settings`: hardcoded org/region/persons/emails + disabled-button traps + "TrueLine v2 engine."
- **FR-AUDIT-008** — README + `PRODUCT_UX_PLAN.md` describe redirected surfaces as the product; brand = TrueLine throughout docs.
- **FR-AUDIT-009** — Engine jargon in live customer copy (`source anchor`, `corpus`, `frontier`, `engine_ready`, `MANUAL_ENTRY`/`TABLE_IMPORT`).
- **FR-AUDIT-010** — Extension-only file validation; no content/magic-byte check.
- **FR-AUDIT-011** — Dishonest sidebar/topbar status ("Live product API" / "Access-gated" hardcoded).

### P2 — quality / reliability / release hygiene
- **FR-AUDIT-012** — `npm run lint` red: 7 `react-hooks/set-state-in-effect` errors.
- **FR-AUDIT-013** — `contracts:check` hardcodes a sibling-repo path; fails off the author's machine.
- **FR-AUDIT-014** — Plan sheets stamp "TRUELINE PREVIEW" (`SheetFurniture.tsx:167`).
- **FR-AUDIT-015** — `next.config.ts` hardcodes `staging.fieldroute.io` + global `no-store`.
- **FR-AUDIT-016** — Disabled-button UX: missing inline rationale on capture/bore-log gates.
- **FR-AUDIT-017** — No basemap/street context/marker navigation (GIS parity gap).

### P3 — cleanup / parity backlog
- **FR-AUDIT-018** — Mock fixtures littered with Sample/demo names (only matters while legacy ships).
- **FR-AUDIT-019** — Duplicate map paradigms (mock HeroMap vs real ProductRouteMap).
- **FR-AUDIT-020** — `FIELD_TZ = 'America/Chicago'` hardcoded (`src/lib/format.ts`).
- **FR-AUDIT-021** — No field-capture / offline / mobile path on web (parity gap).

---

## 6. UX simplification plan

1. **One brand, one app.** Rename every customer surface to FieldRoute; delete the legacy
   routes so `/intake` is unambiguously *the* app.
2. **One workflow.** Keep the 8-section workspace spine. Remove anything that competes
   with it (mock queues, dev panels, secondary maps).
3. **Plain English everywhere.** Translate engine terms; keep raw codes behind
   "Diagnostics / Technical details" (the pattern already exists in `ProductWorkspace`).
4. **Every disabled control explains itself.** Inline "why" next to each disabled button.
5. **Decluttered defaults.** Route-only map by default; one primary action per screen.
6. **Honest status chrome.** Sidebar/topbar reflect actual mode, not a hardcoded claim.

## 7. Architecture simplification plan

1. Delete `src/app/{map,plans,redlines,closeout,evidence,feed,packet,settings,projects}`
   after confirming `/showcase` and `/intake` cover the demo. Remove the corresponding
   `middleware.ts` redirect list (it becomes unnecessary once the routes are gone).
2. Delete `src/lib/api/mock/*`, `reviewerReads` fixtures, and the mock map components once
   their only consumers are gone. Keep `mockApi` only if a true offline demo is still
   required — otherwise drop the dual-mode seam to a single live client.
3. Keep `src/contracts`, `src/lib/api/types.ts`, `liveV2Product.ts`, `productWrites.ts`,
   and the `/intake` component tree. These are the product.
4. Result: a smaller bundle, a smaller attack surface, and exactly one mental model.

## 8. Security hardening plan

1. **Auth (P0):** introduce real session auth; derive tenant from the authenticated
   session **server-side**. Treat `X-TL-Tenant` as untrusted until the backend enforces
   scope. Document the trust boundary explicitly.
2. **Upload safety (P0):** enforce a client **and** server size cap; validate content by
   magic bytes / declared MIME, not extension; prefer streamed/multipart upload over
   base64-JSON for large files. *(Client-side size cap added in this pass — see §15.)*
3. **Rate limiting:** per-tenant intake limits on the backend.
4. **No identifier leaks:** ensure tenant ids are never rendered as project names
   (`liveV2Product.ts:105-106`).
5. **CI gate:** "no banned strings in customer routes" + secret scan before deploy.

## 9. OSP / HDD domain correctness plan

1. **Preserve abstain-on-missing-termini.** Never auto-place a bore without per-bore
   start/end; keep `NO_PER_BORE_TERMINI` as a hard block.
2. **Keep honest-null bore fields** (depth, BOC, footage) — never invent HDD depths.
3. **Auto-extract first, hand-entry as fallback** — confirmed correct today; guard against
   regressions with a test.
4. **Matchline continuity** must stay surfaced for multi-sheet bores
   (`matchlineContinuity`, `referencedSheets`).
5. **Translate progress to plain English** (placed/total footage), not "frontier."

## 10. Current engine leverage plan

Lead with what already works:
- Source package → recognized-corpus automatic redline (deterministic, no clicking).
- Uploaded package → engine REVIEW candidate → human accept/correct (never faked AUTO).
- Honest ABSTAIN with named, specific blockers.
- Real KMZ route context + source-backed PDF proof.
- Quantities-based closeout PDF/ZIP with honest KMZ blocking.

The near-term slice (§13) is **consolidation onto these**, not new engine work.

## 11. No-copy competitive parity plan

Achieve each public outcome via our own engine/architecture:
- **Map progress** → add a progress layer keyed to placement/review state on
  `ProductRouteMap` (our SVG, our data).
- **Marker navigation** → owner-approved tiled basemap behind a flag; markers from our
  KMZ features, not a competitor's UI.
- **Inspect/approve, billing docs, PDF proof** → already parity; polish copy.
- **Field capture/offline** → a separate field surface on our contracts, later.
- **Onboarding** → a lightweight first-run guide built from this product-direction doc.
No competitor asset is referenced or reproduced.

## 12. Demo-readiness checklist

- [ ] Browser tab shows **FieldRoute**, never "TrueLine" (FR-AUDIT-001).
- [ ] No customer route renders `TrueLine`, `mock`, `Demo Project`, `Sample …`, or a fake
      person/email (grep-gated in CI).
- [ ] Legacy mock surfaces deleted (or, interim, redirect verified for every path +
      `/showcase` confirmed clean).
- [ ] `HECTOR_DEMO_CHECKLIST.md` removed/renamed to a generic, name-free checklist.
- [ ] `/showcase` not-configured/error state shows no env var names or "frontier."
- [ ] Sidebar/topbar status reflects the real mode.
- [ ] Upload rejects oversize/unsupported files with a plain-English message.
- [ ] `npm run lint`, `npx tsc --noEmit`, and the node checks are green.
- [ ] A first-time user can go upload → map → redline → review → export without narration.

## 13. Two-week execution roadmap

**Week 1 — make it safe to show (subtraction + guardrails)**
- Day 1: brand fix (`layout.tsx`), honest status chrome (`Sidebar`/`Topbar`), delete
  `HECTOR_DEMO_CHECKLIST.md`, rewrite README to reality. *(brand + status started in §15.)*
- Day 2: harden `/showcase` not-configured/error copy; strip env-var/jargon leaks from
  customer strings (FR-AUDIT-003/009).
- Day 3: upload guardrails — size cap (client done; add server cap + magic-byte check)
  (FR-AUDIT-004/010).
- Day 4: delete legacy mock surfaces + mock tree + duplicate map (FR-AUDIT-006/018/019);
  simplify `middleware.ts`.
- Day 5: green the gates — fix the 7 lint errors, fix `contracts:check` path
  (FR-AUDIT-012/013); add the "no banned strings" CI grep.

**Week 2 — the next product slice ("Source Package → Auto Context → Simple Map/Proof Review")**
- Days 6-7: tighten the upload → auto-context → review-queue path so only uncertain items
  surface; verify manual entry stays collapsed.
- Days 8-9: map progress layer keyed to placement/review state; plain-English progress.
- Day 10: auth trust-boundary doc + server-tenant-scope ticket; demo dry-run against the
  demo-readiness checklist (§12).

## 14. "Do not do" list

- **Do not** add hardcoded customer/city/person/project names anywhere reusable.
- **Do not** ship mock/demo data on any customer-reachable route.
- **Do not** add a silent live→mock fallback.
- **Do not** make the customer click anchors or recreate bore-log rows by hand on the
  happy path.
- **Do not** expose engine jargon or env var names in customer copy.
- **Do not** turn FieldRoute into a generic project-management/Kanban board.
- **Do not** copy any competitor's UI, code, workflow, or trade dress.
- **Do not** add net new pages/surfaces — if the UI grows, the cleanup failed.
- **Do not** undertake a large rewrite. The engine works; the job is subtraction.

## 15. Changes made in this audit pass (small, safe guardrails)

Scoped, high-confidence, customer-facing fixes only — no risky rewrites:

1. **Brand fix (FR-AUDIT-001):** `src/app/layout.tsx` metadata title/template now reads
   **FieldRoute** instead of the internal codename.
2. **Honest status chrome (FR-AUDIT-011):** `src/components/shell/Sidebar.tsx` footer now
   reflects the actual data mode (`productApiEnabled()`) instead of a hardcoded "Live
   product API."
3. **Upload size guardrail (FR-AUDIT-004):** `src/components/ProductUploadPanel.tsx`
   rejects oversize files with a plain-English error *before* base64 encoding, preventing
   tab OOM and unbounded POST bodies.
4. **Internal Product Direction Panel:** new `/internal/product-direction` route, gated
   behind `NEXT_PUBLIC_FR_INTERNAL=1` (404 otherwise), not in customer navigation, generic
   naming only — so future sessions build toward this doc.

Everything else is documented for a deliberate cleanup slice rather than changed here,
per the "small safe guardrails only" rule.
