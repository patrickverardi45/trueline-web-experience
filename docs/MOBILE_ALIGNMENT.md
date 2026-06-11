# Mobile Mock-API Alignment Plan (M8)

Repo: `C:\Nova\projects\trueline-field-mobile` (TrueLine Field, Expo SDK 56).

## Done in M8

1. **Shared contracts mirrored** — `src/contracts/index.ts` is a byte-for-byte
   mirror of this repo's contracts (16 shared types).
2. **Mock API client** — `src/lib/api.ts`: async, simulated 250 ms latency,
   single seam for the future backend. `src/lib/useApi.ts` is the minimal
   loading hook; `src/components/Loading.tsx` the shared spinner.
3. **Screens wired to the API** (no more direct fixture imports for data):
   Home (projects + activity), Projects, Project Detail, Runs, **Field Ticket**
   (via `api.tickets.getBundle`), Daily Log, Settings.
4. **Sync status placeholders** — Settings "Data" section now renders a live
   `SyncState` from the API (offline queue pending counts + last sync time).
5. **Capture placeholders** — evidence capture and station drop screens
   already exist from M0 and remain placeholder-only (no camera/GPS native
   modules; Expo Go compatible).

## Still intentionally mobile-local

The mobile screens render their own screen-model types
(`src/types/domain.ts`) which predate the shared contracts. The data flow is
already API-shaped; the type migration is mechanical and staged:

| Step | Change | Risk |
| --- | --- | --- |
| A | Map mobile `Run.type` → contract `method`, `from/to` → `fromStationCode/toStationCode`, footage fields → `lengthFt/placedFt` | Low — rename pass over screens + meta maps |
| B | Replace mobile `RunStatus` (`not-started/problem`) with the contract five-state vocabulary (`missing-evidence/blocked`) and update badge meta | Low — display only |
| C | Replace mobile `EvidenceItem`/`FieldTicket` with contract shapes (`photoIds`, `sources`, `review`) | Medium — ticket screen layout touches |
| D | Point `api.ts` at fixtures expressed directly in contract types (same dataset as web `fixtures.ts`) | Low once A–C land |
| E | Real backend: replace `api.ts` internals with network client + offline queue feeding `SyncState` | The actual M9+ work |

## Rules that still hold

- No camera/GPS native modules until explicitly green-lit (Expo Go only).
- No backend, no auth, no TestFlight/signing.
- The mobile app never imports engine code or web-app code; the contracts
  file is mirrored, not cross-imported.
