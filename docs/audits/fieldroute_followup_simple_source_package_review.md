# FieldRoute Follow-up — Simple Source Package Review (subtraction slice)

**Branch:** `feat/fieldroute-simple-source-package-review` (stacked on PR #1)
**Date:** 2026-06-29 · **Type:** subtraction + simplification (no feature work, no rewrites)
**Companion:** [`fieldroute_senior_engineering_product_audit.md`](./fieldroute_senior_engineering_product_audit.md) ·
[`fieldroute_issue_register.json`](./fieldroute_issue_register.json) ·
[`../product/fieldroute_product_direction.md`](../product/fieldroute_product_direction.md)

This slice makes FieldRoute stop looking like a developer console / mock demo. It is ~13k
lines of deletion and a focused brand/jargon + dev-gating pass. The live `/intake` engine
path and the artifact/proof viewer are untouched and still work.

## 1. What was removed (70 files, ~12,970 lines)

**Legacy customer-facing mock routes (deleted entirely):**
`src/app/{redlines,plans,map,closeout,evidence,feed,packet,projects,settings}` — the V1/V2
mock surfaces that carried "Demo Project 001," "Sample Fiber Co-op," a fake member roster,
"mock decision" buttons, and disabled-button traps. They were only hidden behind a
middleware redirect; now they are gone (FR-AUDIT-006, FR-AUDIT-007).

**Mock data + adapters + fixtures (deleted):**
`src/lib/api/index.ts` (the mock/live switch), `client.ts` (mockApi), `reviewerReads.ts`,
the entire `src/lib/api/mock/*` tree, `src/lib/api/fixtures/*.json` (incl. the 3,137-line
`redline_manifest.v1.json` and 2,042-line `reviewer_bundle.v1.json`), and the orphaned
`adapters/v2Bundle|v2Artifacts|v2RunAssembly` were... **kept** as type-only modules (see §6).

**Duplicate map (deleted):** `src/components/map/*` (HeroMapView, MapCanvas, PlaybackBar,
EvidencePanel) — the stylized mock SVG basemap. The real map is `ProductRouteMap`
(FR-AUDIT-019).

**Orphaned components/utils (deleted):** `ProductRecognizedCorpusHandoff.tsx` (unrendered,
jargon-heavy), `ui/{Button,StatusPill,KpiStat,ReadinessRing,ProgressMeter,SectionHeader,
EvidenceChecklist,PhotoPlaceholder}.tsx`, `lib/{status,geometry,format}.ts` (the last
resolves the hardcoded-timezone FR-AUDIT-020).

**Embarrassing docs (deleted):** `docs/HECTOR_DEMO_CHECKLIST.md` (person name + `C:\Nova`
path, FR-AUDIT-005) and `docs/PRODUCT_UX_PLAN.md` (described the deleted surfaces / branded
everything "TrueLine"; superseded by the canonical product-direction doc, FR-AUDIT-008).

**Middleware:** the legacy-redirect block + its matcher entries were removed; middleware now
only normalizes the `?job=` alias on `/intake`.

## 2. What was gated (internal-only behind `NEXT_PUBLIC_FR_INTERNAL=1`)

A shared gate, `src/lib/internalMode.ts` → `internalToolingEnabled()`, now hides all dev/QA
tooling from customers:

- **Manual on-plan route drawing** (`ProductSourceAnchorCapture`) in the Review section —
  the customer path is now **accept / reject only**, never hand-clicking geometry.
- **Manual bore-log row entry** (the "Advanced manual review" block in
  `ProductReviewedBoreLogGate`) — customers use the automatic extract → confirm path only,
  and are never asked to recreate rows by hand.
- **Diagnostics** band and the **Technical details — stored file inventory** in
  `ProductWorkspace` (raw slots, sha256, `engine_ready`, etc.).
- Internal config hints (env var names) in the not-connected / error states of
  `ProductIntake` and `ProductShowcaseGallery`.

## 3. Customer-facing UX: before → after

| Aspect | Before | After |
| --- | --- | --- |
| Routes | 12+ routes incl. mock boards reachable by URL | 4: `/`, `/intake`, `/showcase`, gated `/internal/*` |
| Browser title | "TrueLine — …" | "FieldRoute — …" (PR #1) |
| Map | mock SVG basemap + real route map (two) | one real KMZ/KML route map |
| Uncertain placement | "Correct redline placement" → hand-click the plan | "This placement needs your review" → accept/reject |
| Bore log | collapsed hand-entry fallback visible | automatic extract → confirm; hand-entry internal-only |
| Diagnostics / file inventory | collapsed but visible to all | internal-only |
| Upload copy | "Upload project files. Stored untrusted (no OCR)." | "Upload your source package … FieldRoute extracts the route and redline context; you only review what it flags." |
| Showcase off/error | dumped `NEXT_PUBLIC_TL2_*` + "frontier 50/58" | "Finished examples are temporarily unavailable." |

## 4. Brand / jargon removed from customer copy

`TrueLine` (browser title, PR #1), `NEXT_PUBLIC_TL2_*` env-var dumps (now internal-only),
`frontier` → "Bore logs drawn 50 / 58", `engine_ready: true/false` → "Ready for redline:
yes/no", `extraction_method MANUAL_ENTRY` → "a human sign-off, not OCR", "recognized known
corpus" / "TrueLine engine render" (deleted with `ProductRecognizedCorpusHandoff`),
"v2 product API" connection errors → plain "check your connection."

## 5. Upload / security guardrails added

- **PDF magic-byte check** (`ProductUploadPanel`): a file named `.pdf` must start with
  `%PDF-` or it is rejected before encoding — catches mislabeled/wrong-type files
  (FR-AUDIT-010, client half). Reads only 5 bytes.
- **Size cap** (75 MB/file, from PR #1) and **extension allowlist** retained.
- Upload copy states the cap and accepted types.
- **Not done here (documented):** server-side size/type/content caps belong to the external
  `/v2/product` backend — there is no server upload handler in this repo. The client adapter
  still base64-encodes bytes; moving large uploads to multipart is a backend-coupled change
  left for a dedicated slice (FR-AUDIT-004 server half).

## 6. Remaining internal / legacy debt (intentionally not touched)

- **Internal codenames in non-customer code:** `TrueLineApi` (types), `createLiveV2ProductApi`,
  `truelinev2-*` schema ids in `adapters/v2Bundle|v2Artifacts|v2RunAssembly.ts`, and
  `NEXT_PUBLIC_TL2_*` env var names. These are not customer-visible. The three type-only
  adapters were kept (not deleted) because they feed the `TrueLineApi` reviewer interface and
  the tested `createLiveV2ProductApi`; deleting them forces edits to the tested live-engine
  file (`liveV2Product.ts`) — churn/risk out of scope for a subtraction slice.
- **`ProductSourceAnchorCapture` copy** ("source anchor", "deterministic engine frontier")
  remains, but the component is now fully internal-gated, so customers never see it.
- **`docs/MOBILE_ALIGNMENT.md`, `docs/CONTRACTS.md`** retain legacy "TrueLine" naming
  (internal docs, not customer-visible).
- **`next.config.ts`** still hardcodes `staging.fieldroute.io` + global `no-store`
  (FR-AUDIT-015) — left untouched to avoid changing live deploy/cache behavior without a
  deploy to verify against.
- **Auth / tenant isolation** (FR-AUDIT-002) is unchanged — a backend concern, not this slice.

## 7. Tests / checks run (exact results)

- `npx tsc --noEmit` → **clean (exit 0)**.
- `npm run lint` → **0 errors, 0 warnings**. The 7 pre-existing
  `react-hooks/set-state-in-effect` errors were resolved: 3 lived in now-deleted files; the
  remaining 4 (in `PlanPageViewer`, `ProductSourceAnchorCapture`) were suppressed with the
  repo's established `eslint-disable` convention + an explanatory comment; the
  `ProductWorkflowPanel` exhaustive-deps warning was suppressed (intentional `jobId` dep,
  documented inline). (FR-AUDIT-012 resolved.)
- `node scripts/check-live-product-read.mjs` → **passes** (engine adapter unit checks).
- `node scripts/check-contract-parity.mjs` → now **skips cleanly** with a warning when the
  mobile checkout is absent (was a hard ENOENT crash); set `FIELDROUTE_MOBILE_ROOT` to run
  the comparison (FR-AUDIT-013 resolved).
- No component/route test harness exists in the repo; none was added (out of scope).

## 8. Remaining risks

- **No automated regression test** asserts "no banned strings / no mock data on customer
  routes." Recommend a CI grep gate next.
- **Scanned-only bore logs:** customers with a bore log that has no machine-readable table
  will see "extract" yield no rows and, with hand-entry now internal-only, have no
  self-serve path. This is the correct product stance (don't make customers re-key), but it
  depends on the backend extractor maturing — a known gap to track.
- **`next.config.ts` cache/origin** and **auth/tenant isolation** remain open (see §6).
- Manual verification of the running app was not performed in this environment (no live
  `/v2/product` backend); correctness rests on tsc + lint + the adapter unit checks.

## 9. Recommended next slice

**"Map progress layer + CI string-gate."** On the existing `ProductRouteMap`, add a progress
overlay keyed to placement/review state (our SVG, our data — no competitor copy), and add a
CI step that fails the build if any customer route renders `TrueLine`, `mock`, `Demo
Project`, `Sample …`, or a fabricated person/email. Then take the auth/tenant-isolation
(FR-AUDIT-002) and server-side upload caps (FR-AUDIT-004) as a backend-coupled slice.
