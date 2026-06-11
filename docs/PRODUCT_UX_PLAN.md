# TrueLine Product UX Plan

TrueLine is an OSP/fiber construction intelligence platform: engineering
plans, bore logs, field evidence, redlines, station data, photos, and
closeout requirements in one clean workflow. This repo is the **contract-first
web experience** — every surface runs on mock data behind a typed API
boundary, so the v2 engine can plug in later without UI rework.

## Personas

- **Contractor / crew lead** — captures evidence in the field (mobile),
  checks what's still owed per run.
- **Project manager** — watches production, issues, and readiness; drives
  review and closeout.
- **Utility inspector / client reviewer** — needs the evidence chain to be
  self-explanatory: what was built, where, proven by what.

## The core loop

```
Plan sheets ──┐
Bore logs  ───┼─→  Runs/segments → field captures (start/end/problem/station)
Field app  ───┘         │
                        ▼
              Field tickets + daily logs
                        │
                        ▼
              Redline review (approve / request changes)
                        │
                        ▼
              Closeout readiness → packet → submitted
```

Every surface answers one question:

| Surface | Question it answers |
| --- | --- |
| Dashboard `/` | How is the portfolio doing today? |
| Project detail `/projects/[id]` | How is this project doing, run by run? |
| Hero Map `/map` | Where is the work, what state is it in, what does each run still owe? |
| Redline Playback (on map) | How did this run actually get built, step by step? |
| Plan Viewer `/plans` | What does the plan say, and what changed (redlines, pins, matchlines)? |
| Redline Review `/redlines` | Which as-builts are waiting on a decision? |
| Evidence Explorer `/evidence` | Can this run prove itself to an inspector? |
| Field Feed `/feed` | What did the crews capture, in time order? |
| Closeout `/closeout` | What is blocking closeout, and what's ready? |
| Packet Builder `/packet` | What goes in the deliverable, and is it assembled? |
| Settings `/settings` | What's connected, who has access (placeholders)? |

## Design language

- Dark navy chrome (`#101C2C` family) + light steel canvas + white cards +
  safety-orange accent (`#F4640E`) — same family as the TrueLine Field
  mobile app.
- Status is always color + label (never color alone): complete green,
  in-progress orange, blocked red, needs-review amber, missing-evidence
  violet.
- Station codes, run ids, and ticket ids are monospace.
- The Hero Map and plan sheets are custom SVG surfaces — deliberate: no map
  keys or PDF engines in the preview, and the contracts (`RedlinePath`,
  `SheetPin`) stay surface-agnostic for the real renderers later.

## Milestones

- **M0** — scaffold, design tokens, contracts, mock API ✅
- **M1** — dashboard + project detail ✅
- **M2** — Hero Map with redline paths + evidence panel ✅
- **M3** — Redline Playback ✅
- **M4** — Plan Viewer (redline overlay, before/after, pins, station search) ✅
- **M5** — Evidence Explorer ✅
- **M6** — Closeout Readiness ✅
- **M7** — Packet Builder placeholder ✅
- **M8** — mobile app mock-API alignment (in `trueline-field-mobile`) ✅
- **Later** — real backend/engine adapter behind `TrueLineApi`, auth, real
  basemap/PDF rendering, exports, mobile camera/GPS/offline sync.

## What is deliberately NOT here

No backend, no auth, no billing, no engine imports, no competitor patterns
(Vitruvi, Katapult, IQGeo, Render Networks, Ocius-X were not referenced).
All mutating actions are visibly mocked.
