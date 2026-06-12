# Hector Demo Checklist

## What Patrick Can Show

- The local TrueLine web command center and dashboard.
- The Hero Map mock workflow, including clicking a run to open its evidence panel.
- The `/redlines` review screen and existing mock run-review flow.
- The separate read-only **v2 engine reviewer cards** section on `/redlines`.
- A safe Slice 1 integration story: v2 reviewer output is exported as static JSON
  and adapted by the web app without production wiring.

## Run And Demo

From `C:\Nova\projects\trueline-web-experience`:

```powershell
npm run dev
```

Open first: [http://localhost:3000/](http://localhost:3000/)

Best click path:

1. Start on **Dashboard** for the command-center overview.
2. Open **Hero Map**, then click a colored run to show its evidence panel.
3. Open **Redline Review** at
   [http://localhost:3000/redlines](http://localhost:3000/redlines).
4. Briefly show the existing mock review queue.
5. Scroll to **v2 engine reviewer cards** and open a lane group.
6. Point out the exact truth labels, closed confidence classes, blocker text,
   station summaries, and explicit `Run mapping: unmapped`.

## Talking Points

- The office/reviewer UI shell is built: dashboard, map, plans, review,
  evidence, closeout, and packet surfaces exist locally.
- The v2 proof engine separately produces validated reviewer-bundle output.
- Slice 1 now displays those v2 cards read-only in the web review surface.
- Suggestions remain `SUGGESTION_NOT_PLACEMENT`; the adapter does not turn
  suggestions into placed proof or invent numeric confidence.
- Shared web/mobile contracts were not changed, and contract parity remained
  green.
- Geometry, images, and review write-back are intentionally deferred to later
  safe slices.
- The approach avoids v1's slow load-all-PDF behavior: metadata renders first,
  and future artifacts will load only when requested.

## Do Not Claim

- This is not production-wired or deployed.
- This is not the complete upload-to-closeout workflow.
- GPS, field photos, KMZ integration, and mobile capture are not wired here.
- The web review actions do not write decisions back to v2.
- v2 remains gated before live API and production integration.

## Current Caveats

- The web repository has no configured Git remote. Local recovery artifacts
  exist at:
  - `backups/v2-reviewer-bundle-adapter-8aabf73.bundle`
  - `backups/v2-reviewer-bundle-adapter-8aabf73.patch`
- Full-repo lint currently stops on an unrelated existing React lint issue in
  `src/app/packet/SummaryRail.tsx`; changed Slice 1 files lint cleanly.
- Real wiring still needs bore-to-run identity mapping, an authenticated v2
  API, decision write-back, and an image/geometry pipeline.

## Next Steps

1. Identify or create the proper GitHub remote for the web repository.
2. Define the bore-to-run identity map.
3. Add a read-only authenticated v2 API route to replace the static fixture.
4. Add lazy artifact/image loading, then the separately validated geometry
   transform.
5. Add review decision write-back.
6. Later add field photos, GPS, and KMZ integration.
