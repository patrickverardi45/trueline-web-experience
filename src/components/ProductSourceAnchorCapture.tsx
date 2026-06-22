'use client';

// Human-confirmed source-anchor capture for the selected job. A reviewer picks an uploaded PLAN_PDF + page,
// clicks the bore route (first = start, last = end, middle = bends) on the real plan image, optionally adds
// coordinate-FREE start/end identity, and submits to POST /source-anchors. The backend validates and
// returns VALIDATED/REJECTED + named blockers. This RECORDS human-confirmed geometry only — it is NOT OCR,
// NOT automatic engine placement, and it does NOT render a redline (that is the next slice). No mock
// fallback: failures surface honestly.

import { useCallback, useEffect, useState } from 'react';

import {
  createSourceAnchor,
  fetchPlanPageMetadata,
  type ControlPointInput,
  type PlanPageMetadata,
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
}

function defaultAnchorId(): string {
  // Browser-only convenience; the backend re-validates the id (^[a-z0-9][a-z0-9_-]{0,62}$).
  return 'sa-' + Math.random().toString(36).slice(2, 8);
}

export function ProductSourceAnchorCapture({
  jobId,
  planUploads,
  reviewedBoreLogId = 'rbl-main',
}: ProductSourceAnchorCaptureProps) {
  const [planUploadId, setPlanUploadId] = useState<string>(planUploads[0]?.uploadId ?? '');
  const [pageNumber, setPageNumber] = useState(1);
  const [meta, setMeta] = useState<PlanPageMetadata | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [points, setPoints] = useState<ControlPointInput[]>([]);
  const [rblId, setRblId] = useState(reviewedBoreLogId);
  const [anchorId, setAnchorId] = useState(defaultAnchorId());
  const [startStation, setStartStation] = useState('');
  const [startLabel, setStartLabel] = useState('');
  const [endStation, setEndStation] = useState('');
  const [endLabel, setEndLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SourceAnchorResult | null>(null);

  const loadMeta = useCallback(async (uploadId: string) => {
    setMeta(null);
    setMetaError(null);
    setPoints([]);
    try {
      const m = await fetchPlanPageMetadata(jobId, uploadId);
      setMeta(m);
      setPageNumber(1);
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : 'failed to load plan pages');
    }
  }, [jobId]);

  useEffect(() => {
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
      if (r.renderable) setAnchorId(defaultAnchorId()); // ready for the next anchor
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'failed to create source anchor');
    } finally {
      setBusy(false);
    }
  }

  if (planUploads.length === 0) return null;

  return (
    <Card className="mt-4">
      <h3 className="font-semibold text-ink">Source-anchor capture (human-confirmed route geometry)</h3>
      <p className="mt-1 text-sm text-ink-3">
        Click the bore route on the uploaded plan page: first click = start, last click = end, middle clicks
        = bends. This records <span className="font-semibold">human-confirmed</span> geometry on the real
        PDF — it is not OCR, not automatic engine placement, and it does <span className="font-semibold">not</span>{' '}
        render a redline yet. Rendering happens only in the next slice, after a source anchor validates.
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
            <span className="text-ink-3">Page</span>
            <select
              value={pageNumber}
              onChange={(e) => { setPageNumber(Number(e.target.value)); setPoints([]); }}
              className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink">
              {meta.pages.map((p) => (
                <option key={p.pageNumber} value={p.pageNumber}>{p.pageNumber}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5">
          <span className="text-ink-3">Reviewed bore-log</span>
          <input
            value={rblId}
            onChange={(e) => setRblId(e.target.value)}
            className="w-28 rounded-md border border-line px-2 py-1 font-mono text-xs text-ink"
          />
        </label>
      </div>

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
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-3">Anchor id</span>
          <input
            value={anchorId}
            onChange={(e) => setAnchorId(e.target.value)}
            className="w-32 rounded-md border border-line px-2 py-1 font-mono text-xs text-ink"
          />
        </label>
        <button
          onClick={onSubmit}
          disabled={busy || points.length < 2 || !planUploadId || anchorId.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Submitting…' : 'Create source anchor'}
        </button>
        {points.length < 2 && (
          <span className="text-xs text-ink-3">Mark at least 2 points (start + end).</span>
        )}
      </div>

      {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm">
            <span className="font-mono text-ink">status: {result.status}</span>
            <span className="ml-2 font-mono text-ink-3">renderable: {String(result.renderable)}</span>
          </p>
          <p className="mt-1 text-xs text-ink-3">
            provenance: <span className="font-mono">{result.provenance}</span> · coordinate space:{' '}
            <span className="font-mono">{result.coordinateSpace}</span>
          </p>
          {result.blockers.length > 0 && (
            <>
              <p className="mt-2 text-xs font-medium text-ink-2">Blockers</p>
              <ul className="mt-1 list-disc space-y-1 pl-6 text-xs text-ink-2">
                {result.blockers.map((b) => (
                  <li key={b.code}><span className="font-mono">{b.code}</span> — {b.reason}</li>
                ))}
              </ul>
            </>
          )}
          {result.renderable && (
            <p className="mt-2 text-xs text-ink-3">
              Source anchor validated and saved as human-confirmed geometry. No redline has been rendered —
              rendering is the next slice.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
