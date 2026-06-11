# TrueLine Shared Contract Spec (v0.1)

Source of truth: [`src/contracts/index.ts`](../src/contracts/index.ts).
Mirrored in `trueline-field-mobile/src/contracts/index.ts` — keep both in
sync until the contracts move to a shared package.

The contracts are the vocabulary all TrueLine products speak. The mock API
implements them today; the v2 engine integration will implement the same
shapes later. **No contract references engine internals.**

## The 16 contract objects

| Contract | Purpose | Key relationships |
| --- | --- | --- |
| `Project` | A construction project | `runIds`, `crewIds`, readiness score |
| `Run` | A buildable span (HH→HH, vault→HH…) | `projectId`, `segmentIds`, `planSheetIds`, `boreLogRef`, `evidence` rollup |
| `Segment` | Sub-span of a run with its own method/status | `runId` |
| `Station` | A station/structure point along a run | `runId`, `source` (where it came from) |
| `EvidenceItem` | One field capture (start/end/problem/station-drop) | `runId`, `photoIds`, `sources[]`, `review` |
| `FieldTicket` | A day's production record for a run | `runId`, `quantities`, `evidenceIds` |
| `FieldPhoto` | A photo attached to evidence | `evidenceItemId`, GPS, station |
| `RedlinePath` | Drawable as-built geometry on a surface (`map` or `sheet`) | `runId`, `surfaceId`, `points[]` |
| `RedlinePlaybackStep` | One event in a run's build timeline | `runId`, `progress` 0–1, optional `evidenceId` |
| `ReviewStatus` | Union: draft → submitted → in-review → changes-requested / approved | used by tickets + evidence |
| `CloseoutReadiness` | Project-wide + per-run readiness, missing list | `runs[]: RunReadiness`, `missing[]` |
| `CloseoutPacket` | The deliverable: sections with ready/include state | `sections[]: PacketSection` |
| `Crew` | A field crew | referenced by runs/tickets/evidence |
| `DailyLog` | Crew day summary (weather, quantities) | `projectId`, `crewId` |
| `Issue` | Problem holding work (blocking or monitoring) | `projectId`, `runId?`, `blocking` |
| `SyncState` | Mobile offline queue snapshot | pending photos/evidence/tickets |

Supporting types: `SourceRef` (evidence provenance), `EvidenceSummary`
(rollup on `Run`), `PlanSheet` + `SheetPin` (plan viewer), `QuantityLine`,
`GeoPoint`, `MissingEvidence`, `RunReadiness`, `PacketSection`.

## Design rules

1. **Provenance everywhere.** Evidence cites `SourceRef`s (ticket, bore log,
   plan sheet, daily log). The Evidence Explorer renders this chain directly.
2. **Status unions are closed.** `RunStatus` is exactly the five Hero Map
   states: `complete | in-progress | blocked | needs-review |
   missing-evidence`. UI maps them via `src/lib/status.ts`, never ad-hoc.
3. **Geometry is surface-relative.** `RedlinePath.points` are in the
   surface's own coordinate space (map viewBox or sheet viewBox). Real
   GIS/PDF coordinates arrive later behind the same shape.
4. **Rollups are denormalized on purpose.** `Run.evidence` lets lists render
   without loading every item; the mock fixtures keep rollups consistent
   with the underlying items.
5. **Ids are opaque strings.** Nothing parses ids.

## API boundary

`src/lib/api/types.ts` defines `TrueLineApi` — the full read surface
(projects, runs, segments, stations, evidence, photos, tickets, daily logs,
issues, redlines, playback, sheets, closeout, sync). `src/lib/api/index.ts`
binds it to the mock client; swapping in a real backend is one assignment.
There are no mutation endpoints yet — every write action in the UI is
visibly mocked.
