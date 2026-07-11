'use client';

// Human-confirmed source-anchor capture + render for the selected job. A reviewer picks an uploaded
// PLAN_PDF + page, clicks the bore route (first = start, last = end, middle = bends) on the real plan
// image, optionally adds coordinate-FREE start/end identity, and submits to POST /source-anchors. Once the
// anchor is VALIDATED the reviewer can render it: POST /source-anchors/{id}/render draws a dashed REVIEW
// redline PNG from the confirmed control points and publishes a real bundle, which is then shown inline.
// This RECORDS + DRAWS human-confirmed geometry only — it is NOT OCR, NOT automatic engine placement, and
// it does NOT change the deterministic frontier. No mock fallback: failures surface honestly.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createSourceAnchor,
  fetchJobArtifactBlob,
  fetchPlanPageMetadata,
  fetchPlanPageRasterBlob,
  fetchReviewedBoreLog,
  listSourceAnchors,
  manualRoutePointsEnabled,
  nearestSegmentInsertionIndex,
  renderSourceAnchor,
  requestSourceRouteProposal,
  routeAdoptionInputFromProposal,
  routeAdoptionRefusalCode,
  sourceRouteAdoptionEnabled,
  type ControlPointInput,
  type JobArtifactRef,
  type ManualRouteInput,
  type PlanPageInfo,
  type PlanPageMetadata,
  type ReviewedRowView,
  type RouteAdoptionInput,
  type RouteProposalView,
  type RouteRefusalView,
  type SourceAnchorRenderResult,
  type SourceAnchorResult,
  type StationDot,
} from '@/lib/api/productWrites';
import { Card } from '@/components/ui/Card';
import { PlanPageViewer } from '@/components/PlanPageViewer';
import { SourceRouteProposalPanel } from '@/components/SourceRouteProposalPanel';

interface PlanUploadRef {
  readonly uploadId: string;
  readonly filename: string;
}

interface ProductSourceAnchorCaptureProps {
  readonly jobId: string;
  readonly planUploads: readonly PlanUploadRef[];
  readonly reviewedBoreLogId?: string;
  // Source-backed sheet hints from the parent (e.g. a recognized candidate's render sheets). Combined with the
  // bore-log rows' own sheet refs to default the page selector to the RIGHT plan sheet — never the cover.
  readonly suggestedSheets?: readonly number[];
  // Called after a SUCCEEDED render — the corrected redline is now the job's placed redline, so the parent
  // can refresh the candidate state (-> superseded) and the job slots (-> Redlines/Closeout offer Assemble).
  readonly onChanged?: () => void;
}

function defaultAnchorId(): string {
  // Browser-only convenience; the backend re-validates the id (^[a-z0-9][a-z0-9_-]{0,62}$).
  return 'sa-' + Math.random().toString(36).slice(2, 8);
}

export function ProductSourceAnchorCapture({
  jobId,
  planUploads,
  reviewedBoreLogId = 'rbl-main',
  suggestedSheets,
  onChanged,
}: ProductSourceAnchorCaptureProps) {
  const [planUploadId, setPlanUploadId] = useState<string>(planUploads[0]?.uploadId ?? '');
  const [pageNumber, setPageNumber] = useState(1);
  const [meta, setMeta] = useState<PlanPageMetadata | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [points, setPoints] = useState<ControlPointInput[]>([]);
  const [rblId] = useState(reviewedBoreLogId);
  // Source-backed sheet refs from the bore log itself (the row that records which plan sheet the bore prints
  // on) + first-row station range, used to default the page to the right sheet and pre-fill the identity.
  const [boreSheets, setBoreSheets] = useState<readonly number[]>([]);
  const [boreLoaded, setBoreLoaded] = useState(false);
  // Apply the suggested default page exactly once per plan upload (so a later user pick is never overridden).
  const appliedFor = useRef<string | null>(null);
  // Mission 8: setter added so reload hydration can retarget an already-confirmed anchor's id (a fresh
  // mount otherwise always generates a brand-new random id — see the hydration effect below). Every
  // non-hydration code path is unchanged (still a stable random id for the lifetime of an unhydrated mount).
  const [anchorId, setAnchorId] = useState(defaultAnchorId());
  const [startStation, setStartStation] = useState('');
  const [startLabel, setStartLabel] = useState('');
  const [endStation, setEndStation] = useState('');
  const [endLabel, setEndLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SourceAnchorResult | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<SourceAnchorRenderResult | null>(null);
  // Which station dot's bore info is open (index into the flattened dot list); reset per render.
  const [selectedDot, setSelectedDot] = useState<number | null>(null);
  const [renderedImages, setRenderedImages] = useState<readonly { path: string; url: string }[]>([]);
  // Page-identity SNAPSHOT captured when the anchor is CREATED (never the live page dropdown), so the
  // placed-proof label + "full marked sheet" toggle keep naming the page that was actually rendered even if
  // the user later changes the page selector.
  const [renderedPage, setRenderedPage] = useState<
    { readonly planUploadId: string; readonly pageNumber: number; readonly planSheetLabel: string | null } | null
  >(null);
  const [showFullSheet, setShowFullSheet] = useState(false);
  const [fullSheet, setFullSheet] = useState<
    { phase: 'loading' } | { phase: 'ready'; url: string } | { phase: 'error'; message: string } | null
  >(null);

  // --- Ticket W-C: source-backed route proposal + explicit adoption (flag-gated) --------------------- //
  // Default-OFF: with the flag unset, routeAdoptionOn is false, none of the state below is ever set to
  // anything but its initial value, and none of the effects/handlers below issue a fetch or change render
  // output — the component stays byte-identical to pre-W-C behavior.
  const routeAdoptionOn = sourceRouteAdoptionEnabled();
  // Station-bearing rows (same predicate as the pre-fill above) — needed to thread a row_id into the
  // proposal request. Auto-selected when exactly one; otherwise the user must explicitly pick one.
  const [stationBearingRows, setStationBearingRows] = useState<readonly ReviewedRowView[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [proposalState, setProposalState] = useState<
    | { phase: 'idle' }
    | { phase: 'searching' }
    | { phase: 'proposal'; proposal: RouteProposalView }
    | { phase: 'refusal'; refusal: RouteRefusalView }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' });
  // Set true on a 404 from the proposals endpoint (route not mounted / backend flag off) — the search
  // affordance is then hidden for the rest of this session, a silent fall-back to pure manual UX.
  const [routeProposalsUnavailable, setRouteProposalsUnavailable] = useState(false);

  // --- Mission 8: manual N-point bend editing + honest representative labeling (flag-gated) ------------ //
  // Default-OFF: with the flag unset, manualRouteOn is false, and every piece of state below is either never
  // read or never diverges from its initial value — clicks always append (never insert), the confirm body
  // never carries manual_route, and no reload-hydration read is ever issued. Byte-identical to pre-Mission-8.
  const manualRouteOn = manualRoutePointsEnabled();
  // Which intermediate marked point (index into `points`) is selected for the "Remove bend" control.
  const [selectedBendIndex, setSelectedBendIndex] = useState<number | null>(null);
  // The LAST route-search refusal this session, retained through subsequent point edits (Sol Q1/binding wire
  // re-verify #3) so a manual/representative confirm can honestly report it via manual_route.
  // reported_route_search — cleared only when a LATER search in this session actually succeeds (a fresh
  // PROPOSAL outcome means the most recent search was not a refusal).
  const [lastRouteSearchRefusal, setLastRouteSearchRefusal] =
    useState<{ code: string; upstreamReasonCode: string | null } | null>(null);
  // Reload hydration (Q7): a found-but-not-yet-applied confirmed anchor, waiting for `meta`/`boreLoaded` to
  // catch up with a plan-upload switch before it overwrites points/pageNumber (see the two effects below —
  // this two-step apply avoids a race against loadMeta's own points-reset on a plan-upload change).
  const [pendingHydration, setPendingHydration] = useState<{
    readonly sourceAnchorId: string;
    readonly planUploadId: string;
    readonly pageNumber: number;
    readonly controlPoints: readonly ControlPointInput[];
    readonly renderable: boolean;
    readonly result: SourceAnchorResult;
  } | null>(null);
  // Guards the hydration LOOKUP (not the apply) to run at most once per (jobId, reviewedBoreLogId) pair —
  // never re-fires on a later local edit (which doesn't change jobId/rblId), and re-fires honestly if the
  // caller switches to a different job/row.
  const hydratedKeyRef = useRef<string | null>(null);
  // Fix-wave-2: the post-hydration render-evidence (PNG/dots/cards) fetch is decoupled into its OWN effect
  // (below), keyed on this — set by the apply effect, read/cleared only by that separate effect. Necessary
  // because the apply effect below necessarily writes ITS OWN dependencies while applying (pendingHydration
  // object -> null; previously also points 0 -> N once fix-wave-1 added points.length to its deps) — any of
  // those changes schedules that SAME effect's cleanup to run before an in-flight promise held in its
  // closure resolves, silently discarding the result. Isolating the fetch in a effect whose OWN deps
  // (`hydratedRenderFetch`, `jobId`) are never written to by itself makes it immune to that failure mode.
  const [hydratedRenderFetch, setHydratedRenderFetch] = useState<string | null>(null);

  const loadMeta = useCallback(async (uploadId: string) => {
    setMeta(null);
    setMetaError(null);
    setPoints([]);
    appliedFor.current = null; // re-apply the suggested default page for the newly selected plan
    try {
      const m = await fetchPlanPageMetadata(jobId, uploadId);
      setMeta(m); // page default is applied by the suggested-sheet effect below (never silently page 1)
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : 'failed to load plan pages');
    }
  }, [jobId]);

  // Read the bore log's own sheet refs (which plan sheet the bore prints on) + its station range, so the
  // capture can default to the RIGHT sheet and pre-fill the start/end identity. Honest-empty on failure.
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoreLoaded(false);
    fetchReviewedBoreLog(jobId, rblId)
      .then((rbl) => {
        if (!active) return;
        const sheets = Array.from(new Set(rbl.rows.flatMap((r) => r.sheetRefs)));
        setBoreSheets(sheets);
        // Pre-fill the (optional) start/end identity from the bore-log row range, only if not already typed.
        const withStation = rbl.rows.filter((r) => r.startStation || r.endStation);
        if (withStation[0]) {
          setStartStation((prev) => prev || withStation[0].startStation || '');
          setEndStation((prev) => prev || withStation[0].endStation || '');
        }
        // Ticket W-C only: retain the full station-bearing row list (for row_id threading). No-op when the
        // flag is off.
        if (routeAdoptionOn) setStationBearingRows(withStation);
      })
      .catch(() => { if (active) { setBoreSheets([]); if (routeAdoptionOn) setStationBearingRows([]); } })
      .finally(() => { if (active) setBoreLoaded(true); });
    return () => { active = false; };
  }, [jobId, rblId, routeAdoptionOn]);

  // Ticket W-C: auto-select the single station-bearing row, or keep/clear an explicit choice as the row set
  // changes. No-op (no state changes) when the flag is off.
  useEffect(() => {
    if (!routeAdoptionOn) return;
    if (stationBearingRows.length === 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedRowId(stationBearingRows[0].rowId);
    } else {
      setSelectedRowId((prev) => (prev && stationBearingRows.some((r) => r.rowId === prev) ? prev : null));
    }
  }, [routeAdoptionOn, stationBearingRows]);

  // Ticket W-C: any change to the marked points, page, or selected row invalidates a pending/shown proposal
  // (clears overlay + panel) — a stale proposal must never survive a re-mark or a row/page switch. No-op
  // when the flag is off.
  useEffect(() => {
    if (!routeAdoptionOn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProposalState({ phase: 'idle' });
  }, [routeAdoptionOn, points, pageNumber, selectedRowId]);

  // Map a CONSTRUCTION-SHEET number (what the bore log / engine candidate reference, e.g. 7 = the plan
  // sheet whose title block reads "7 OF 30") to its actual PDF page. The plan set is bound behind a
  // cover/index + typical-detail pages, so sheet 7 is NOT PDF page 7 — we resolve through the title-block
  // label the backend reports per page, never by using the sheet number as a raw PDF page index.
  const planSheetToPage = useMemo(() => {
    const m = new Map<number, PlanPageInfo>();
    for (const p of meta?.pages ?? []) {
      if (p.isPlanSheet && p.constructionSheetNumber != null && !m.has(p.constructionSheetNumber)) {
        m.set(p.constructionSheetNumber, p);
      }
    }
    return m;
  }, [meta]);

  // Resolve the bore-log sheet refs (first) + any parent hints (e.g. a recognized candidate's render
  // sheets) to the PDF pages they actually live on. A ref with no matching construction plan sheet is
  // surfaced honestly (unresolved) — never guessed as a raw PDF page index.
  const { resolvedSuggestions, unresolvedRefs } = useMemo(() => {
    const refs = [...boreSheets, ...(suggestedSheets ?? [])];
    const seenRef = new Set<number>();
    const seenPage = new Set<number>();
    const resolved: { ref: number; pdfPage: number; label: string }[] = [];
    const unresolved: number[] = [];
    for (const ref of refs) {
      if (!Number.isInteger(ref) || seenRef.has(ref)) continue;
      seenRef.add(ref);
      const p = planSheetToPage.get(ref);
      if (p) {
        if (!seenPage.has(p.pageNumber)) {
          seenPage.add(p.pageNumber);
          resolved.push({ ref, pdfPage: p.pageNumber, label: p.planSheetLabel ?? String(ref) });
        }
      } else {
        unresolved.push(ref);
      }
    }
    return { resolvedSuggestions: resolved, unresolvedRefs: unresolved };
  }, [boreSheets, suggestedSheets, planSheetToPage]);

  const suggestedPages = useMemo(() => resolvedSuggestions.map((s) => s.pdfPage), [resolvedSuggestions]);

  // Apply the suggested default page once per plan upload, after both the plan metadata and the bore-log
  // refs have loaded — so the viewer opens on the RESOLVED construction plan sheet, NEVER the
  // cover/typical-detail page that shares the sheet's number as a raw PDF page index.
  useEffect(() => {
    if (!meta || !boreLoaded) return;
    if (appliedFor.current === planUploadId) return;
    appliedFor.current = planUploadId;
    setPageNumber(suggestedPages.length > 0 ? suggestedPages[0] : 1);
  }, [meta, boreLoaded, suggestedPages, planUploadId]);


  // Keep the selected plan upload valid as inventory loads or the job changes. The initial value was
  // captured from the first render's plan list; a stale id (e.g. after switching jobs) would 404 on
  // plan-page metadata. Re-sync to the first available plan upload when the upload-id set changes.
  const planUploadIds = planUploads.map((u) => u.uploadId).join('|');
  useEffect(() => {
    const ids = planUploadIds ? planUploadIds.split('|') : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlanUploadId((prev) => (prev && ids.includes(prev) ? prev : (ids[0] ?? '')));
  }, [planUploadIds]);

  useEffect(() => {
    // loadMeta is an async callback whose result lands via setState in .then (house convention).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (planUploadId) void loadMeta(planUploadId);
  }, [planUploadId, loadMeta]);

  // Mission 8 (Q7, flag-gated): on init, look up whether this row already has a CONFIRMED source-anchor via
  // the EXISTING list surface (no new backend route) and stage it for hydration. Runs at most once per
  // (jobId, rblId) — a later local edit (Clear/re-mark) never re-triggers it. Picks the match with the
  // lexicographically-greatest updated_at/created_at (ISO-8601 strings sort correctly lexically) when more
  // than one source-anchor exists for this row (e.g. across several reload cycles). A listing failure (or no
  // match) leaves the component in its normal fresh/unconfirmed state — never a hard error.
  useEffect(() => {
    if (!manualRouteOn) return;
    const key = `${jobId}::${rblId}`;
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;
    let active = true;
    (async () => {
      try {
        const anchors = await listSourceAnchors(jobId);
        const matches = anchors.filter((a) => a.reviewedBoreLogId === rblId);
        if (matches.length === 0 || !active) return;
        const latest = matches.reduce((best, cur) => {
          const bestKey = best.updatedAt ?? best.createdAt ?? '';
          const curKey = cur.updatedAt ?? cur.createdAt ?? '';
          return curKey >= bestKey ? cur : best;
        });
        if (!active) return;
        setPendingHydration({
          sourceAnchorId: latest.result.sourceAnchorId,
          planUploadId: latest.planUploadId,
          pageNumber: latest.pageNumber,
          controlPoints: latest.controlPoints,
          renderable: latest.result.renderable,
          result: latest.result,
        });
      } catch {
        // listing failed — honest no-op; the component stays in its normal fresh/unconfirmed state.
      }
    })();
    return () => { active = false; };
  }, [manualRouteOn, jobId, rblId]);

  // Mission 8 (Q7): APPLY a staged hydration once `meta`/`boreLoaded` for the restored plan upload are ready
  // — deliberately gated on that readiness (rather than applying immediately alongside the lookup above) so
  // this effect runs STRICTLY AFTER loadMeta's own points-reset and the suggested-default-page effect above
  // have already settled for the restored plan upload; this write then wins unconditionally, eliminating the
  // race rather than guessing at effect-ordering. `appliedFor.current` is set here too, so the suggested-
  // page effect never overwrites the restored pageNumber on a later render.
  useEffect(() => {
    if (!pendingHydration) return;
    // Fix-wave-1 F1: a slow list-fetch can resolve AFTER the user has already started marking their own
    // points at mount — never clobber in-progress work. Drop the pending hydration silently (the confirmed
    // record stays server-side and can still be reached by a later reload); this check is a GATE, not a
    // fetch-time check, so it re-evaluates every time this effect re-runs (e.g. after the plan-switch below).
    if (points.length !== 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingHydration(null);
      return;
    }
    if (pendingHydration.planUploadId !== planUploadId) {
      // Retarget the plan-upload selector first; loadMeta's own effect (dep: planUploadId) will fetch this
      // plan's metadata, and this effect re-runs (dep: planUploadId) once that happens.
      setPlanUploadId(pendingHydration.planUploadId);
      return;
    }
    // Fix-wave-1 F2: `meta` is whatever plan-upload's metadata last resolved — during a plan-switch retarget
    // above, this effect can re-run with the PREVIOUS plan's still-non-null `meta` still in closure before
    // loadMeta's fetch for the NEW plan has landed. Verify `meta` actually belongs to the plan we're
    // hydrating before deriving restoredPage/planSheetLabel from it; on a mismatch, defer — loadMeta's own
    // effect will re-render with the correct `meta` once its fetch resolves, and this effect re-fires (dep:
    // meta).
    if (!meta || !boreLoaded || meta.planUploadId !== pendingHydration.planUploadId) return;
    appliedFor.current = planUploadId;
    const restoredPage = meta.pages.find((p) => p.pageNumber === pendingHydration.pageNumber) ?? null;
    setPageNumber(pendingHydration.pageNumber);
    setPoints([...pendingHydration.controlPoints]);
    setSelectedBendIndex(null);
    setAnchorId(pendingHydration.sourceAnchorId);
    setResult(pendingHydration.result);
    setRenderedPage({
      planUploadId: pendingHydration.planUploadId,
      pageNumber: pendingHydration.pageNumber,
      planSheetLabel: restoredPage?.planSheetLabel ?? null,
    });
    setShowFullSheet(false);
    // Fix-wave-2: hand the render-evidence fetch off to the SEPARATE effect below instead of firing it
    // inline here — this effect's own writes (setPendingHydration(null), just below) change ITS OWN
    // dependency, which would otherwise schedule ITS OWN cleanup to run (cancelling an in-flight promise
    // held in this closure) before the fetch could resolve. See hydratedRenderFetch's declaration for the
    // full trace.
    if (pendingHydration.renderable) setHydratedRenderFetch(pendingHydration.sourceAnchorId);
    setPendingHydration(null);
    // `points.length` (read by the F1 guard above) is listed here for exhaustive-deps honesty; unlike
    // before fix-wave-2, a self-triggered re-run of THIS effect is now harmless — there is no cancellable
    // async work left in its body (the render-evidence fetch lives in the separate effect below).
  }, [pendingHydration, planUploadId, meta, boreLoaded, jobId, points.length]);

  // Fix-wave-2: owns the idempotent post-hydration render-evidence (PNG/dots/cards) re-fetch. Deliberately a
  // SEPARATE effect from the apply effect above, whose own writes (pendingHydration -> null) would otherwise
  // self-trigger a cleanup that cancels this exact fetch before it resolves (observed live: hydration
  // restored points/status but the "Placed redline proof" block, HUMAN-REVIEWED badge, and station-dot cards
  // never appeared). This effect's OWN dependencies (`hydratedRenderFetch`, `jobId`) are never written to by
  // its own body, so it is immune to that failure mode; a NEWER hydratedRenderFetch value correctly cancels
  // an older in-flight fetch via the same `active` idiom used throughout this file.
  useEffect(() => {
    if (!hydratedRenderFetch) return;
    let active = true;
    // render_source_anchor_route is idempotent for identical content (docstring-guaranteed), so this NEVER
    // creates new geometry, only republishes the artifact summary for a redline that already exists.
    renderSourceAnchor(jobId, hydratedRenderFetch)
      .then((r) => { if (active) setRenderResult(r); })
      .catch(() => {
        // Non-fatal: the confirmed record/points/label are already restored by the apply effect above; only
        // the PNG/dots/cards panel stays absent if this idempotent re-render read fails.
      });
    return () => { active = false; };
  }, [hydratedRenderFetch, jobId]);

  const page = meta?.pages.find((p) => p.pageNumber === pageNumber) ?? null;

  // Mission 8: with the flag ON and >= 2 points already placed, a further click INSERTS the new point at
  // the nearest-segment index (ordering only — see nearestSegmentInsertionIndex; the coordinate itself is
  // NEVER adjusted). Flag OFF, or fewer than 2 points so far, behaves exactly as before (plain append) —
  // byte-identical for the first two clicks (start + end) regardless of the flag.
  function addPoint(p: ControlPointInput) {
    setPoints((prev) => {
      if (manualRouteOn && prev.length >= 2) {
        const idx = nearestSegmentInsertionIndex(prev, p);
        const next = prev.slice();
        next.splice(idx, 0, p);
        return next;
      }
      return [...prev, p];
    });
    // Fix-wave-1 F3: an insert can shift every later index — the previously-selected bend's index no longer
    // names the same point (or may now name a DIFFERENT point entirely), so any selection/"Remove bend"
    // target must be dropped rather than silently migrating to the wrong circle. Unconditional (matches the
    // existing Undo/Clear handlers, which already clear it too) — a no-op when nothing is selected.
    setSelectedBendIndex(null);
  }

  // Mission 8: drag-MOVE an intermediate point (never the first/last — endpoints keep the pre-existing
  // click-to-mark flow). `index` is validated defensively even though PlanPageViewer only ever wires this
  // for an intermediate circle, so a stale/out-of-range index can never corrupt an endpoint.
  function moveBend(index: number, point: ControlPointInput) {
    setPoints((prev) => {
      if (index <= 0 || index >= prev.length - 1) return prev;
      const next = prev.slice();
      next[index] = point;
      return next;
    });
  }

  // Mission 8: remove the currently-selected intermediate point (same endpoint guard as moveBend above).
  function removeSelectedBend() {
    if (selectedBendIndex == null) return;
    const index = selectedBendIndex;
    setPoints((prev) => {
      if (index <= 0 || index >= prev.length - 1) return prev;
      const next = prev.slice();
      next.splice(index, 1);
      return next;
    });
    setSelectedBendIndex(null);
  }

  // `adoption` is Ticket W-C / W-C-ECHO only (undefined for the ordinary "Confirm route" path — the request
  // body then omits route_adoption entirely, byte-identical to before this field existed). Passed by "Use
  // engineering route" in the proposal panel below, ALREADY fully sourced verbatim from the held proposal
  // (routeAdoptionInputFromProposal) — never rebuilt here from planUploadId/rblId/pageNumber/points.
  async function onSubmit(adoption?: RouteAdoptionInput) {
    setBusy(true);
    setSubmitError(null);
    setResult(null);
    setRenderResult(null);
    setRenderError(null);
    // Mission 8: built ONLY for a non-adoption confirm, flag ON, with >= 2 points — mutually exclusive with
    // `adoption` by construction (never both on the same request). `representativeStatus` follows the
    // COUNT<->STATUS rule the backend enforces (2 -> REPRESENTATIVE_STRAIGHT_ACCEPTED; >=3 ->
    // MANUAL_POLYLINE_CONFIRMED). `reportedRouteSearch` carries the retained last-refusal code/upstream
    // reason when this session's search refused, omitted entirely otherwise (never a guessed value).
    const manualRoute: ManualRouteInput | undefined =
      !adoption && manualRouteOn && points.length >= 2
        ? {
            confirmed: true,
            representativeStatus: points.length >= 3 ? 'MANUAL_POLYLINE_CONFIRMED' : 'REPRESENTATIVE_STRAIGHT_ACCEPTED',
            ...(lastRouteSearchRefusal ? { reportedRouteSearch: lastRouteSearchRefusal } : {}),
          }
        : undefined;
    try {
      const r = await createSourceAnchor(jobId, {
        sourceAnchorId: anchorId,
        planUploadId,
        reviewedBoreLogId: rblId,
        pageNumber,
        controlPoints: points,
        startIdentity: { station: startStation || undefined, structureLabel: startLabel || undefined },
        endIdentity: { station: endStation || undefined, structureLabel: endLabel || undefined },
        ...(adoption ? { routeAdoption: adoption } : {}),
        ...(manualRoute ? { manualRoute } : {}),
      });
      setResult(r);
      // Freeze the page identity of the anchor we just created, so the placed-proof label + full-sheet
      // toggle name the RENDERED page — never the live dropdown, which the user may change afterwards.
      setRenderedPage({ planUploadId, pageNumber, planSheetLabel: page?.planSheetLabel ?? null });
      setShowFullSheet(false);
      if (adoption) setProposalState({ phase: 'idle' }); // adoption succeeded — clear the panel/overlay
    } catch (e) {
      if (adoption) {
        // Named create-time adoption refusal (400/409): honest degrade — clear the stale proposal, keep the
        // human's marks untouched, let them re-search or fall back to the plain "Confirm route" below.
        const code = routeAdoptionRefusalCode(e);
        if (code) {
          setProposalState({ phase: 'idle' });
          setSubmitError(
            `Engineering route could not be adopted (${code}) — your marked points are kept. ` +
            `Search again, or use Confirm route below for the straight segment. ` +
            (e instanceof Error ? e.message : ''));
          return;
        }
      }
      setSubmitError(e instanceof Error ? e.message : 'failed to create source anchor');
    } finally {
      setBusy(false);
    }
  }

  // Ticket W-C: search for a source-backed engineering-route proposal between the exactly-2 marked points.
  async function onSearchRoute() {
    if (points.length !== 2 || !selectedRowId) return;
    setProposalState({ phase: 'searching' });
    try {
      const outcome = await requestSourceRouteProposal(jobId, {
        planUploadId,
        reviewedBoreLogId: rblId,
        rowId: selectedRowId,
        pageNumber,
        controlPoints: [points[0], points[1]],
      });
      if (outcome.kind === 'PROPOSAL') {
        setProposalState({ phase: 'proposal', proposal: outcome.proposal });
        // Mission 8: the most recent search succeeded — no refusal to (honestly) report anymore.
        setLastRouteSearchRefusal(null);
      } else if (outcome.kind === 'REFUSAL') {
        setProposalState({ phase: 'refusal', refusal: outcome.refusal });
        // Mission 8: retained through subsequent point edits until submission (or a later successful search).
        setLastRouteSearchRefusal({
          code: outcome.refusal.code, upstreamReasonCode: outcome.refusal.upstreamReasonCode,
        });
      } else {
        // 404 — feature-absent: fall back to pure manual UX silently, no error toast.
        setRouteProposalsUnavailable(true);
        setProposalState({ phase: 'idle' });
      }
    } catch (e) {
      setProposalState({ phase: 'error', message: e instanceof Error ? e.message : 'search failed' });
    }
  }

  async function onRender(sourceAnchorId: string) {
    setRenderBusy(true);
    setRenderError(null);
    setRenderResult(null);
    try {
      const r = await renderSourceAnchor(jobId, sourceAnchorId);
      setRenderResult(r);
      setSelectedDot(null);
      // NOTE: the parent refresh (onChanged) is deliberately NOT fired here. Refreshing immediately swaps
      // the parent's candidate/placed branch and UNMOUNTS this capture, destroying the just-rendered proof
      // (HUMAN-REVIEWED badge + station dots) before the user can see it. The server state is already
      // final (slots set, candidate superseded); the explicit "Save & continue" button below fires the
      // refresh when the user is done reviewing the proof.
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : 'failed to render source anchor');
    } finally {
      setRenderBusy(false);
    }
  }

  // Load the rendered redline PNG(s) WITH identity headers (a plain <img src> cannot send them); revoke
  // object URLs on change/unmount. Honest-empty on failure (never a placeholder image).
  useEffect(() => {
    const refs: readonly JobArtifactRef[] = renderResult?.artifacts ?? [];
    if (refs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRenderedImages([]);
      return;
    }
    let active = true;
    const created: string[] = [];
    Promise.all(refs.map((ref) => fetchJobArtifactBlob(jobId, ref.path)))
      .then((blobs) => {
        if (!active) return;
        const imgs = refs.map((ref, i) => {
          const url = URL.createObjectURL(blobs[i]);
          created.push(url);
          return { path: ref.path, url };
        });
        setRenderedImages(imgs);
      })
      .catch(() => active && setRenderedImages([]));
    return () => {
      active = false;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [jobId, renderResult]);

  // "View full marked sheet": fetch the SAME plan_upload_id + page_number the anchor was rendered from,
  // via the EXISTING plan-page raster route (no new backend). Loaded only while the toggle is on; the object
  // URL is revoked on toggle-off / snapshot change / unmount.
  useEffect(() => {
    if (!showFullSheet || !renderedPage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFullSheet(null);
      return;
    }
    let active = true;
    let url: string | null = null;
    setFullSheet({ phase: 'loading' });
    fetchPlanPageRasterBlob(jobId, renderedPage.planUploadId, renderedPage.pageNumber)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setFullSheet({ phase: 'ready', url });
      })
      .catch((e: unknown) =>
        active && setFullSheet({ phase: 'error', message: e instanceof Error ? e.message : 'unavailable' }));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [showFullSheet, renderedPage, jobId]);

  // Flattened clickable station dots from the render result (backend-computed along the human redline:
  // 0' start, every 50', final endpoint). Empty when the bore row carries no footage.
  const stationDots: readonly StationDot[] = useMemo(
    () => Object.values(renderResult?.stationDotsByLog ?? {}).flat(),
    [renderResult],
  );

  // Mission 8 (Q6, binding exact copy + visibility rule): shown while EITHER (a) the current UNCONFIRMED
  // preview polyline is exactly 2 points AND no engineering route is currently adopted for this anchor (an
  // adopted route's render polyline is NOT a straight chord even though only 2 human marks were placed —
  // this exclusion prevents a false "representative" label on a real adopted redline), OR (b) the last
  // CONFIRMED/hydrated result carries representative_status REPRESENTATIVE_STRAIGHT_ACCEPTED — (b) is keyed
  // off the PERSISTED record, not the live point count, so the label survives BOTH confirmation and a page
  // reload, and stays attached to a still-representative rendered stroke even if the user starts editing new
  // (not-yet-confirmed) points afterward.
  const REPRESENTATIVE_LABEL = 'Representative straight segment — not the engineering route';
  const adoptedNow = result?.geometryBasis === 'OBSERVER_BACKBONE_HUMAN_ADOPTED';
  const showRepresentativeLabel = manualRouteOn && (
    (points.length === 2 && !adoptedNow) || result?.manualRepresentativeStatus === 'REPRESENTATIVE_STRAIGHT_ACCEPTED'
  );
  const confirmLabel = busy
    ? 'Submitting…'
    : manualRouteOn && points.length >= 2
      ? (points.length >= 3 ? `Confirm manual route (${points.length} points)` : 'Confirm representative straight segment')
      : 'Confirm route';

  if (planUploads.length === 0) return null;

  return (
    <Card className="mt-4">
      <h3 className="font-semibold text-ink">Mark the bore route on the plan</h3>
      <p className="mt-1 text-sm text-ink-3">
        Click the bore route on the plan: first click = start, last = end, middle clicks = bends. Then{' '}
        <span className="font-semibold">Render</span> to draw the redline from your confirmed points — that
        becomes this project’s placed redline, ready to assemble and export.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-ink-3">Plan PDF</span>
          <select
            value={planUploadId}
            onChange={(e) => setPlanUploadId(e.target.value)}
            className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink">
            {planUploads.map((u) => (
              <option key={u.uploadId} value={u.uploadId}>{u.filename}</option>
            ))}
          </select>
        </label>
        {meta && meta.pageCount > 1 && (
          <label className="flex items-center gap-1.5">
            <span className="text-ink-3">PDF page</span>
            <select
              value={pageNumber}
              onChange={(e) => { setPageNumber(Number(e.target.value)); setPoints([]); }}
              className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink">
              {meta.pages.map((p) => (
                <option key={p.pageNumber} value={p.pageNumber}>
                  {`PDF p${p.pageNumber} · `}
                  {p.isPlanSheet
                    ? `Sheet ${p.planSheetLabel}`
                    : p.sheetType === 'TYPICAL_DETAILS'
                      ? `${p.planSheetLabel ?? 'detail'} (details)`
                      : 'cover / index'}
                  {suggestedPages.includes(p.pageNumber) ? ' — suggested' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Source-backed sheet resolution — map each bore-log sheet reference to the PDF page whose title
          block carries that construction-sheet label (e.g. sheet 7 -> the page printed "7 OF 30"), never
          the raw PDF page index. The user can still pick any page above, so an uncertain match is never
          forced. */}
      {meta && meta.pageCount > 1 && (
        resolvedSuggestions.length > 0 ? (
          <div className="mt-2 space-y-1.5 text-xs">
            <p className="rounded-md border border-accent/30 bg-accent-soft px-2.5 py-1.5 text-sm font-medium text-accent-strong">
              Correct page found. Manual review required — click start and end on the plan below.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-3">Suggested plan sheet(s) from your bore log:</span>
              {resolvedSuggestions.map((s) => (
                <button
                  key={s.pdfPage}
                  onClick={() => { setPageNumber(s.pdfPage); setPoints([]); }}
                  className={`rounded-md border px-2 py-0.5 font-mono ${
                    pageNumber === s.pdfPage ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-ink-2 hover:text-ink'
                  }`}>
                  Sheet {s.label} → PDF p{s.pdfPage}
                </button>
              ))}
            </div>
            {/* Evidence: what the bore log referenced, the matched construction sheet, and the real PDF page. */}
            <p className="text-ink-3">
              Your bore log references plan sheet{resolvedSuggestions.length > 1 ? 's' : ''}{' '}
              {resolvedSuggestions.map((s) => s.ref).join(', ')}.{' '}
              Matched to construction sheet{' '}
              {resolvedSuggestions.map((s) => `“${s.label}” (PDF page ${s.pdfPage} of ${meta.pageCount})`).join(', ')}
              {' '}— the page whose title block prints that sheet number, not raw PDF page{' '}
              {resolvedSuggestions.map((s) => s.ref).join('/')}.
            </p>
            {unresolvedRefs.length > 0 && (
              <p className="text-amber-700">
                Bore-log sheet {unresolvedRefs.join(', ')} could not be matched to a plan sheet in this PDF —
                pick the right page manually above.
              </p>
            )}
          </div>
        ) : boreLoaded ? (
          <p className="mt-2 text-xs text-ink-3">
            {unresolvedRefs.length > 0
              ? `Bore-log sheet ${unresolvedRefs.join(', ')} could not be matched to a plan sheet in this PDF — pick the plan sheet the bore is drawn on above.`
              : 'No plan sheet is printed on this bore log — pick the plan sheet the bore is drawn on above.'}
          </p>
        ) : null
      )}

      {/* Soft penalty for a non-plan page: a route/station redline belongs on a construction plan sheet,
          not a cover/index/typical-detail page. The user can still proceed (never hard-blocked). */}
      {page && !page.isPlanSheet && (
        <p className="mt-2 text-xs text-amber-700">
          Heads up: PDF page {page.pageNumber}
          {page.planSheetLabel ? ` (${page.planSheetLabel})` : ''} is a{' '}
          {page.sheetType === 'TYPICAL_DETAILS' ? 'typical-details' : 'cover/index'} sheet, not a route
          plan sheet. Pick a construction plan sheet above unless you intend to mark this page.
        </p>
      )}

      {metaError && <p className="mt-2 text-sm text-red-600">{metaError}</p>}

      {page && (
        <>
          <PlanPageViewer
            jobId={jobId}
            planUploadId={planUploadId}
            pageNumber={pageNumber}
            bounds={page.bounds}
            points={points}
            onAddPoint={addPoint}
            onUndo={() => setPoints((prev) => prev.slice(0, -1))}
            onClear={() => setPoints([])}
            pageLabel={
              page.planSheetLabel
                ? `Sheet ${page.planSheetLabel} · PDF page ${page.pageNumber} of ${meta?.pageCount ?? '?'}`
                : `PDF page ${page.pageNumber} of ${meta?.pageCount ?? '?'}`
            }
            proposalPoints={
              routeAdoptionOn && proposalState.phase === 'proposal'
                ? proposalState.proposal.proposedRenderPoints
                : undefined
            }
            onMoveBend={manualRouteOn ? moveBend : undefined}
            selectedBendIndex={manualRouteOn ? selectedBendIndex : undefined}
            onSelectBend={manualRouteOn ? setSelectedBendIndex : undefined}
          />
          {showRepresentativeLabel && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
              {REPRESENTATIVE_LABEL}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-3">{points.length} point(s) marked</span>
            <button
              onClick={() => { setPoints((prev) => prev.slice(0, -1)); setSelectedBendIndex(null); }}
              disabled={points.length === 0}
              className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink disabled:opacity-50">
              Undo
            </button>
            <button
              onClick={() => { setPoints([]); setSelectedBendIndex(null); }}
              disabled={points.length === 0}
              className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink disabled:opacity-50">
              Clear
            </button>
            {/* Mission 8: appears only while an intermediate (bend) point is selected — a no-drag click on
                its circle in PlanPageViewer (never the first/last point). */}
            {manualRouteOn && selectedBendIndex != null && (
              <button
                onClick={removeSelectedBend}
                className="rounded-md border border-red-300 bg-red-50 px-2 py-1 font-medium text-red-700 hover:bg-red-100">
                Remove bend
              </button>
            )}
          </div>

          {/* Ticket W-C: optional source-backed route search — never gates or blocks the manual Confirm
              route action below, and renders nothing at all when the flag is off or the endpoint 404s. */}
          {routeAdoptionOn && !routeProposalsUnavailable && (
            <div className="mt-3 rounded-lg border border-line bg-white p-3 text-xs">
              <p className="font-semibold text-ink">Engineering route search (optional)</p>
              {stationBearingRows.length > 1 && (
                <label className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-ink-3">Bore-log row</span>
                  <select
                    value={selectedRowId ?? ''}
                    onChange={(e) => setSelectedRowId(e.target.value || null)}
                    className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink">
                    <option value="">Choose a row…</option>
                    {stationBearingRows.map((r) => (
                      <option key={r.rowId} value={r.rowId}>
                        {(r.startStation || '?')} → {(r.endStation || '?')} ({r.rowId})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onSearchRoute}
                  disabled={points.length !== 2 || !selectedRowId || proposalState.phase === 'searching'}
                  className="rounded-md border border-line px-2.5 py-1.5 font-medium text-ink-2 hover:text-ink disabled:opacity-50">
                  {proposalState.phase === 'searching' ? 'Searching source linework…' : 'Search for engineering route'}
                </button>
                {points.length !== 2 && (
                  <span className="text-ink-3">
                    {/* Mission 8: the more-specific ">2 points" hint is gated behind manualRouteOn — with the
                        flag off, points.length CAN still exceed 2 (pre-existing "middle clicks = bends"), so
                        this copy stays byte-identical to before unless the flag is actually on. */}
                    {manualRouteOn && points.length > 2
                      ? 'Search uses only your start and end points — it seeds from the two termini.'
                      : 'Mark exactly 2 points (start + end) to search.'}
                  </span>
                )}
                {points.length === 2 && stationBearingRows.length === 0 && boreLoaded && (
                  <span className="text-ink-3">No bore-log row with a station range was found for this job.</span>
                )}
                {points.length === 2 && stationBearingRows.length > 1 && !selectedRowId && (
                  <span className="text-ink-3">Choose a bore-log row above to enable search.</span>
                )}
              </div>

              {proposalState.phase === 'proposal' && (
                <SourceRouteProposalPanel
                  proposal={proposalState.proposal}
                  adoption={routeAdoptionInputFromProposal(proposalState.proposal)}
                  onAdopt={(adoption) => onSubmit(adoption)}
                  onDismiss={() => setProposalState({ phase: 'idle' })}
                  busy={busy}
                />
              )}
              {proposalState.phase === 'refusal' && (
                <div className="mt-2 rounded-md border border-line bg-paper p-2.5 text-ink-2">
                  <p>No defensible engineering route found — your straight segment will be used.</p>
                  <p className="mt-1 text-ink-3">
                    {proposalState.refusal.message}
                    {proposalState.refusal.code && (
                      <span className="ml-1 font-mono text-[11px]">({proposalState.refusal.code})</span>
                    )}
                  </p>
                  {/* Mission 8: existing copy/code display above is unchanged — this is an ADDITIVE line. */}
                  {manualRouteOn && (
                    <p className="mt-1 text-ink-3">
                      You can add bend points so the segment follows the engineering alignment before you confirm.
                    </p>
                  )}
                </div>
              )}
              {proposalState.phase === 'error' && (
                <p className="mt-2 text-red-600">Search failed — {proposalState.message}</p>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-ink-3">Start identity (optional, coordinate-free)</p>
          <input
            value={startStation}
            onChange={(e) => setStartStation(e.target.value)}
            placeholder="station e.g. 0+00"
            className="mt-1 w-full rounded-md border border-line px-2 py-1 text-ink"
          />
          <input
            value={startLabel}
            onChange={(e) => setStartLabel(e.target.value)}
            placeholder="structure label"
            className="mt-1 w-full rounded-md border border-line px-2 py-1 text-ink"
          />
        </div>
        <div>
          <p className="text-ink-3">End identity (optional, coordinate-free)</p>
          <input
            value={endStation}
            onChange={(e) => setEndStation(e.target.value)}
            placeholder="station e.g. 2+99"
            className="mt-1 w-full rounded-md border border-line px-2 py-1 text-ink"
          />
          <input
            value={endLabel}
            onChange={(e) => setEndLabel(e.target.value)}
            placeholder="structure label"
            className="mt-1 w-full rounded-md border border-line px-2 py-1 text-ink"
          />
        </div>
      </div>

      {/* Mission 8: echoed above the confirm control (Q6) — same visibility rule as the viewer-adjacent copy. */}
      {showRepresentativeLabel && (
        <p className="mt-3 text-xs font-semibold text-amber-800">{REPRESENTATIVE_LABEL}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onSubmit()}
          disabled={busy || points.length < 2 || !planUploadId || anchorId.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {confirmLabel}
        </button>
        {points.length < 2 && (
          <span className="text-xs text-ink-3">Mark at least 2 points (start + end).</span>
        )}
      </div>

      {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            <span>{result.renderable ? 'Route confirmed.' : 'Route not yet ready.'}</span>
            {/* Ticket W-C: honest chip, present ONLY when the backend recorded an explicit route adoption.
                Absent field (older backend, or a non-adopted anchor) -> no chip, identical to before. */}
            {result.geometryBasis === 'OBSERVER_BACKBONE_HUMAN_ADOPTED' && (
              <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-strong">
                Engineering route · human-confirmed
              </span>
            )}
          </p>
          {result.blockers.length > 0 && (
            <>
              <p className="mt-2 text-xs font-medium text-ink-2">Blockers</p>
              <ul className="mt-1 list-disc space-y-1 pl-6 text-xs text-ink-2">
                {result.blockers.map((b) => (
                  <li key={b.code}>{b.reason}</li>
                ))}
              </ul>
            </>
          )}
          {result.renderable && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-xs text-ink-3">
                Your route is confirmed. Render it to draw the redline from these points.
              </p>
              <button
                onClick={() => onRender(result.sourceAnchorId)}
                disabled={renderBusy}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                {renderBusy ? 'Rendering…' : 'Render redline'}
              </button>
            </div>
          )}
        </div>
      )}

      {renderError && <p className="mt-2 text-sm text-red-600">{renderError}</p>}

      {renderResult && (
        <div className={`mt-3 rounded-lg border p-3 ${
          renderResult.status === 'SUCCEEDED' ? 'border-green-600/40 bg-green-50' : 'border-line bg-white'}`}>
          {renderResult.status === 'SUCCEEDED' ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                <span>Placed redline proof — drawn from your {points.length} marked point(s)</span>
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                  Human-reviewed
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                Placed by you from marked points — not an automatic engine placement.
              </p>
              <p className="mt-1 text-xs text-ink-2">
                This is the redline FieldRoute drew from the route you marked on the plan. It is now this
                project’s <span className="font-medium">placed redline</span> — it becomes the redline
                evidence in your closeout package and export.
              </p>
              {renderedPage && (
                <p className="mt-2 text-xs text-ink-3">
                  Rendered from{' '}
                  <span className="font-medium text-ink-2">
                    PDF p{renderedPage.pageNumber}
                    {renderedPage.planSheetLabel ? ` · Sheet ${renderedPage.planSheetLabel}` : ''}
                  </span>{' '}
                  — cropped to the route you marked.
                </p>
              )}
              {renderedImages.length > 0 ? (
                <>
                  {renderedPage && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowFullSheet((v) => !v)}
                        className="rounded-md border border-line px-2.5 py-1 font-medium text-ink-2 hover:text-ink">
                        {showFullSheet ? 'View cropped proof' : 'View full marked sheet'}
                      </button>
                      <span className="text-ink-3">
                        {showFullSheet
                          ? `Full PDF p${renderedPage.pageNumber} — same page you marked (redline not drawn on this view).`
                          : 'Showing the evidence crop around your marked route.'}
                      </span>
                    </div>
                  )}
                  {showFullSheet && renderedPage ? (
                    <div className="mt-3">
                      {fullSheet && fullSheet.phase === 'ready' ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={fullSheet.url}
                          alt={`Full marked plan page ${renderedPage.pageNumber}`}
                          className="w-full rounded-lg border border-line bg-white"
                        />
                      ) : fullSheet && fullSheet.phase === 'error' ? (
                        <p className="text-xs text-ink-3">Full sheet unavailable — {fullSheet.message}</p>
                      ) : (
                        <p className="text-xs text-ink-3">Loading the full marked sheet…</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {renderedImages.map((img) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          key={img.path}
                          src={img.url}
                          alt={`Placed redline drawn from your marked points (${img.path})`}
                          className="w-full rounded-lg border border-line bg-white"
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 text-xs text-ink-3">
                  Real redline artifact(s) published to this job. (Preview unavailable — the artifacts are
                  listed in the redline gallery.)
                </p>
              )}
              {/* Station dots — backend-computed footage marks along YOUR redline (0' start, every 50',
                  final endpoint). Click a dot to see that point's bore-log info. */}
              {stationDots.length > 0 && (
                <div className="mt-3 rounded-md border border-line bg-white p-2.5">
                  <p className="text-xs font-semibold text-ink">
                    Station dots ({stationDots.length}) — every 50&#8242; along your redline, plus start and end
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stationDots.map((d, i) => (
                      <button
                        key={`${d.index}-${d.footageAlong}`}
                        type="button"
                        onClick={() => setSelectedDot((prev) => (prev === i ? null : i))}
                        className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${
                          selectedDot === i
                            ? 'border-accent bg-accent-soft text-accent-strong'
                            : 'border-line text-ink-2 hover:text-ink'
                        }`}>
                        {d.station ?? `${d.footageAlong}′`}
                      </button>
                    ))}
                  </div>
                  {selectedDot != null && stationDots[selectedDot] && (() => {
                    const d = stationDots[selectedDot];
                    const rows: readonly (readonly [string, string | null])[] = [
                      ['Footage', `${d.footageAlong}′ from start`],
                      ['Station', d.station],
                      ['Depth', d.depth],
                      ['BOC', d.boc],
                      ['Date', d.date],
                      ['Crew', d.crew],
                      ['Print', d.print],
                      ['Notes', d.notes],
                      ['Bore log', d.boreLogId],
                    ];
                    return (
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-paper px-3 py-2 text-xs sm:grid-cols-3">
                        {rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-ink-3">{k}</dt>
                            <dd className="font-medium text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    );
                  })()}
                </div>
              )}
              {/* Next action — accept-by-continuing, or re-mark if the placement is wrong. */}
              <div className="mt-3 rounded-md border border-line bg-white p-2.5 text-xs text-ink-2">
                <p className="font-medium text-ink">What next?</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li><span className="font-medium">Looks right?</span> It’s saved as this project’s placed
                    redline. Click <span className="font-medium">Save &amp; continue</span> to update the project
                    steps, then assemble/download it in Export.</li>
                  <li><span className="font-medium">Not right?</span> Use <span className="font-medium">Clear</span>{' '}
                    above (or <span className="font-medium">Enlarge to mark</span> to zoom in), re-mark the
                    bore route, then Confirm + Render again to replace this placement.</li>
                </ul>
                <button
                  type="button"
                  onClick={() => onChanged?.()}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong">
                  Save &amp; continue
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm font-medium text-ink">
              The redline could not be drawn from these points. Clear and re-mark the route, then render again.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
