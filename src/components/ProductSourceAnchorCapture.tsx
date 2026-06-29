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
  fetchReviewedBoreLog,
  renderSourceAnchor,
  type ControlPointInput,
  type JobArtifactRef,
  type PlanPageMetadata,
  type SourceAnchorRenderResult,
  type SourceAnchorResult,
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
  const [renderedImages, setRenderedImages] = useState<readonly { path: string; url: string }[]>([]);

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

  // Suggested plan sheets, in order: bore-log sheet refs first (the bore's own print), then any parent hints
  // (e.g. recognized render sheets). Clamped to the plan's real page range — a sheet ref past the last page is
  // dropped rather than guessed.
  const suggested = useMemo(() => {
    if (!meta) return [] as number[];
    const ordered = [...boreSheets, ...(suggestedSheets ?? [])];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const n of ordered) {
      if (Number.isInteger(n) && n >= 1 && n <= meta.pageCount && !seen.has(n)) { seen.add(n); out.push(n); }
    }
    return out;
  }, [meta, boreSheets, suggestedSheets]);

  // Apply the suggested default page once per plan upload, after both the plan metadata and the bore-log refs
  // have loaded — so the viewer opens on the suggested sheet, NOT the cover/title page.
  useEffect(() => {
    if (!meta || !boreLoaded) return;
    if (appliedFor.current === planUploadId) return;
    appliedFor.current = planUploadId;
    setPageNumber(suggested.length > 0 ? suggested[0] : 1);
  }, [meta, boreLoaded, suggested, planUploadId]);


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
      // The corrected redline is now this job's placed redline. Tell the parent so the Review card reflects
      // it (the engine candidate becomes superseded) and Redlines/Closeout offer Assemble without a reload.
      if (r.status === 'SUCCEEDED') onChanged?.();
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
            <span className="text-ink-3">Plan sheet (page)</span>
            <select
              value={pageNumber}
              onChange={(e) => { setPageNumber(Number(e.target.value)); setPoints([]); }}
              className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink">
              {meta.pages.map((p) => (
                <option key={p.pageNumber} value={p.pageNumber}>
                  {p.pageNumber}{suggested.includes(p.pageNumber) ? ' — suggested' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Source-backed sheet suggestion — default to the sheet the bore log prints on, never the cover. The
          user can still pick any sheet (the selector above), so an uncertain suggestion is never forced. */}
      {meta && meta.pageCount > 1 && (
        suggested.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-3">Suggested sheet(s) from your bore log:</span>
            {suggested.map((n) => (
              <button
                key={n}
                onClick={() => { setPageNumber(n); setPoints([]); }}
                className={`rounded-md border px-2 py-0.5 font-mono ${
                  pageNumber === n ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-ink-2 hover:text-ink'
                }`}>
                Sheet {n}
              </button>
            ))}
            <span className="text-ink-3">— confirm it’s the right sheet, or pick another above.</span>
          </div>
        ) : boreLoaded ? (
          <p className="mt-2 text-xs text-ink-3">
            No plan sheet is printed on this bore log — pick the plan sheet the bore is drawn on above.
          </p>
        ) : null
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
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-medium text-ink">
            {renderResult.status === 'SUCCEEDED'
              ? `Redline drawn — ${renderResult.artifactCount} image(s). It’s now this project’s placed redline; assemble and download it in Closeout.`
              : 'Redline could not be drawn from these points.'}
          </p>
          {renderedImages.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {renderedImages.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={img.path}
                  src={img.url}
                  alt={`Rendered dashed redline ${img.path}`}
                  className="w-full rounded-lg border border-line bg-white"
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink-3">
              Real redline artifact(s) published to this job. (Preview unavailable — the artifacts are
              listed in the redline gallery.)
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
