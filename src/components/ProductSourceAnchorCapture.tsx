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
  renderSourceAnchor,
  type ControlPointInput,
  type JobArtifactRef,
  type PlanPageInfo,
  type PlanPageMetadata,
  type SourceAnchorRenderResult,
  type SourceAnchorResult,
  type StationDot,
} from '@/lib/api/productWrites';
import { Card } from '@/components/ui/Card';
import { PlanPageViewer } from '@/components/PlanPageViewer';

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
  const [anchorId] = useState(defaultAnchorId());
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
        const withStation = rbl.rows.find((r) => r.startStation || r.endStation);
        if (withStation) {
          setStartStation((prev) => prev || withStation.startStation || '');
          setEndStation((prev) => prev || withStation.endStation || '');
        }
      })
      .catch(() => { if (active) setBoreSheets([]); })
      .finally(() => { if (active) setBoreLoaded(true); });
    return () => { active = false; };
  }, [jobId, rblId]);

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

  const page = meta?.pages.find((p) => p.pageNumber === pageNumber) ?? null;

  function addPoint(p: ControlPointInput) {
    setPoints((prev) => [...prev, p]);
  }

  async function onSubmit() {
    setBusy(true);
    setSubmitError(null);
    setResult(null);
    setRenderResult(null);
    setRenderError(null);
    try {
      const r = await createSourceAnchor(jobId, {
        sourceAnchorId: anchorId,
        planUploadId,
        reviewedBoreLogId: rblId,
        pageNumber,
        controlPoints: points,
        startIdentity: { station: startStation || undefined, structureLabel: startLabel || undefined },
        endIdentity: { station: endStation || undefined, structureLabel: endLabel || undefined },
      });
      setResult(r);
      // Freeze the page identity of the anchor we just created, so the placed-proof label + full-sheet
      // toggle name the RENDERED page — never the live dropdown, which the user may change afterwards.
      setRenderedPage({ planUploadId, pageNumber, planSheetLabel: page?.planSheetLabel ?? null });
      setShowFullSheet(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'failed to create source anchor');
    } finally {
      setBusy(false);
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
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-3">{points.length} point(s) marked</span>
            <button
              onClick={() => setPoints((prev) => prev.slice(0, -1))}
              disabled={points.length === 0}
              className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink disabled:opacity-50">
              Undo
            </button>
            <button
              onClick={() => setPoints([])}
              disabled={points.length === 0}
              className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink disabled:opacity-50">
              Clear
            </button>
          </div>
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onSubmit}
          disabled={busy || points.length < 2 || !planUploadId || anchorId.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Submitting…' : 'Confirm route'}
        </button>
        {points.length < 2 && (
          <span className="text-xs text-ink-3">Mark at least 2 points (start + end).</span>
        )}
      </div>

      {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-medium text-ink">
            {result.renderable ? 'Route confirmed.' : 'Route not yet ready.'}
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
