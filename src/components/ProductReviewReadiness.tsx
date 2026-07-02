'use client';

// Source-backed redline READINESS panel (display + one Run action). Runs the shipped read-only readiness
// spine on the job's uploaded package and shows an honest verdict: is the package complete enough to generate
// a REVIEW candidate? It draws/places NOTHING itself — a REVIEW candidate before/after overlay is shown ONLY
// when the backend returns one (status READY_FOR_REVIEW_REDLINE), always labeled "REVIEW candidate — not AUTO,
// not final placement". Every refusal shows the named blocker + the next productive step, and no image.
//
// Distinct from ProductReviewCandidates (the Phase-6 accept/reject lane): this is the completeness gate. No
// mock fallback — a failed live read/run degrades to an honest message; a 404 read is an honest "not run yet".

import { useCallback, useEffect, useState } from 'react';

import { internalToolingEnabled } from '@/lib/internalMode';
import {
  fetchReviewReadiness,
  fetchReviewReadinessArtifactBlob,
  runReviewReadiness,
  type ReviewReadinessAnchorBinding,
  type ReviewReadinessResult,
  type ReviewReadinessRouteVerification,
  type ReviewReadinessSpanRow,
} from '@/lib/api/reviewReadiness';
import {
  hasSourceBackedReviewCandidate,
  presentNextInput,
  presentReadinessStatus,
  REVIEW_CANDIDATE_LABEL,
  SOURCE_BACKED_CANDIDATE_HEADING,
  SOURCE_BACKED_CANDIDATE_SUPPORT_LINE,
  type ReviewReadinessTone,
} from '@/lib/reviewReadinessStatus';

// A thrown HTTP 404 on the GET means the readiness has never been run for this job (or the endpoint is not
// enabled on this environment) — an honest "not run yet", NOT an error to surface loudly.
function isNotRun(message: string): boolean {
  return /HTTP 404/.test(message);
}

const TONE_CHIP: Record<ReviewReadinessTone, string> = {
  ready: 'bg-emerald-100 text-emerald-800',
  progress: 'bg-sky-100 text-sky-800',
  blocked: 'bg-amber-100 text-amber-800',
  control: 'bg-slate-200 text-slate-800',
  neutral: 'bg-gray-100 text-gray-700',
};

type CandidateImage = { role: string; url: string };

/** One source-backed info field. A null/empty value renders an honest, muted "not available" — never an
 *  invented placeholder (mirrors ProductTerminusEvidence). */
function InfoField({ label, value }: { label: string; value: string | null }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd
        className={missing ? 'truncate text-xs italic text-ink-3' : 'truncate text-sm text-ink'}
        title={missing ? 'not available' : value}>
        {missing ? 'not available' : value}
      </dd>
    </div>
  );
}

function num(value: number | null): string | null {
  return value === null ? null : String(value);
}

/** One extracted span row: the stations + footage + structures + source file/citation the source carried. */
function SpanRow({ row }: { row: ReviewReadinessSpanRow }) {
  return (
    <div className="rounded-md border border-line bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
        <span className="font-mono">{row.startStation ?? '—'}</span>
        <span className="text-ink-3">→</span>
        <span className="font-mono">{row.endStation ?? '—'}</span>
        {row.footage != null && <span className="text-xs text-ink-3">({row.footage} ft)</span>}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        <InfoField label="Start structure" value={row.startStructure} />
        <InfoField label="End structure" value={row.endStructure} />
        <InfoField label="Confidence" value={num(row.confidence)} />
        <InfoField label="Source file" value={row.sourceFile} />
        <InfoField label="Source page" value={num(row.sourcePage)} />
        <InfoField label="Source kind" value={row.sourceKind} />
      </dl>
      {row.citation && (
        <p className="mt-2 text-xs text-ink-2">
          Cited from source:{' '}
          <span className="rounded bg-paper px-1 py-0.5 font-mono text-ink">{row.citation}</span>
        </p>
      )}
    </div>
  );
}

/** One endpoint-binding row: did both start + end bind to a unique drawn anchor? */
function AnchorRow({ binding }: { binding: ReviewReadinessAnchorBinding }) {
  return (
    <div className="rounded-md border border-line bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
          {binding.startStation ?? '—'} → {binding.endStation ?? '—'}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            binding.bound ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
          {binding.bound ? 'Both endpoints anchored' : 'Not fully anchored'}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2">
        <InfoField label="Start anchor" value={binding.startAnchor.status} />
        <InfoField label="End anchor" value={binding.endAnchor.status} />
      </dl>
      {binding.refusal && <p className="mt-2 text-xs text-amber-800">{binding.refusal}</p>}
    </div>
  );
}

/** One route-verification row: is the run between the two anchored endpoints verifiable? */
function RouteRow({ route }: { route: ReviewReadinessRouteVerification }) {
  const statuses = [route.routeObserverStatus, route.routeIsolationStatus, route.mainRunStatus]
    .filter((s): s is string => !!s)
    .join(' · ');
  return (
    <div className="rounded-md border border-line bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">Route</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            route.routeReady
              ? 'bg-emerald-100 text-emerald-800'
              : route.evaluated
                ? 'bg-amber-100 text-amber-800'
                : 'bg-gray-100 text-gray-700'
          }`}>
          {route.routeReady ? 'Route verified' : route.evaluated ? 'Route not verifiable' : 'Not evaluated'}
        </span>
      </div>
      {statuses && <p className="mt-2 text-xs text-ink-2">{statuses}</p>}
      {route.refusal && <p className="mt-1 text-xs text-amber-800">{route.refusal}</p>}
    </div>
  );
}

/** The REVIEW candidate before/after overlay — rendered ONLY when the backend returned a candidate. Always
 *  labeled as a REVIEW candidate, never AUTO/final. */
function CandidateOverlay({
  result,
  images,
  imagesError,
}: {
  result: ReviewReadinessResult;
  images: readonly CandidateImage[];
  imagesError: string | null;
}) {
  const before = images.find((i) => i.role === 'before');
  const after = images.find((i) => i.role === 'after');
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
          {REVIEW_CANDIDATE_LABEL}
        </span>
        {result.candidate?.sourceCitation && (
          <span className="text-[11px] text-ink-3">from {result.candidate.sourceCitation}</span>
        )}
      </div>
      {imagesError ? (
        <p className="mt-2 text-xs text-ink-3">Candidate images unavailable. ({imagesError})</p>
      ) : images.length === 0 ? (
        <p className="mt-2 text-xs text-ink-3">Loading candidate images…</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {before && (
            <figure className="min-w-0">
              <figcaption className="mb-1 text-[11px] font-semibold text-ink-2">Before (plan as-is)</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={before.url} alt="Plan before the REVIEW candidate stroke" className="w-full rounded border border-line" />
            </figure>
          )}
          {after && (
            <figure className="min-w-0">
              <figcaption className="mb-1 text-[11px] font-semibold text-ink-2">After (REVIEW stroke)</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={after.url} alt="Plan with the REVIEW candidate stroke" className="w-full rounded border border-line" />
            </figure>
          )}
        </div>
      )}
    </div>
  );
}

export function ProductReviewReadiness({
  jobId,
  refreshKey,
  onState,
}: {
  jobId: string;
  refreshKey?: string;
  /** Presentation-only lift: reports whether a source-backed REVIEW candidate is currently the primary
   *  review surface, so sibling sections (the strict-engine panel) can defer their copy to it. Never
   *  couples the backend lanes. */
  onState?: (hasSourceBackedCandidate: boolean) => void;
}) {
  const [result, setResult] = useState<ReviewReadinessResult | null>(null);
  const [notRun, setNotRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [images, setImages] = useState<readonly CandidateImage[]>([]);
  const [imagesError, setImagesError] = useState<string | null>(null);

  // Fetch the candidate before/after PNGs as header-bearing blobs -> object URLs (a plain <img src> cannot send
  // the identity headers). Only when the backend actually returned artifacts.
  const loadImages = useCallback(async (res: ReviewReadinessResult) => {
    setImagesError(null);
    if (res.candidate === null || res.artifacts.length === 0) {
      setImages([]);
      return;
    }
    try {
      const loaded = await Promise.all(
        res.artifacts.map(async (a) => ({ role: a.role, url: URL.createObjectURL(await fetchReviewReadinessArtifactBlob(a.url)) })),
      );
      setImages(loaded);
    } catch (e) {
      setImages([]);
      setImagesError(e instanceof Error ? e.message : 'unavailable');
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    onState?.(false);                       // authoritative reset: never a stale "primary" while (re)loading
    try {
      const res = await fetchReviewReadiness(jobId);
      setNotRun(false);
      setResult(res);
      onState?.(hasSourceBackedReviewCandidate(res));
      await loadImages(res);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unavailable';
      if (isNotRun(message)) {
        setNotRun(true);
        setResult(null);
        setImages([]);
      } else {
        setError(message);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey, loadImages]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { for (const im of images) URL.revokeObjectURL(im.url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function onRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await runReviewReadiness(jobId);
      setNotRun(false);
      setResult(res);
      onState?.(hasSourceBackedReviewCandidate(res));
      await loadImages(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'the readiness check could not be run');
    } finally {
      setRunning(false);
    }
  }

  if (!jobId) return null;

  const present = result ? presentReadinessStatus(result.readinessStatus) : null;
  const nextStep = result ? presentNextInput(result.recommendedNextInput) : null;
  const showCandidate = result?.candidate != null && result.artifacts.length > 0;
  // Candidate PRIMACY: when the spine reports READY with a served candidate, this section IS the step's
  // primary review surface — the heading says so, and the strict-engine panel above defers to it.
  const candidatePrimary = result !== null && hasSourceBackedReviewCandidate(result);

  return (
    <section className="rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">
            {candidatePrimary ? SOURCE_BACKED_CANDIDATE_HEADING : 'Source-backed redline readiness'}
          </h3>
          <p className="mt-1 text-xs text-ink-3">
            {candidatePrimary
              ? SOURCE_BACKED_CANDIDATE_SUPPORT_LINE
              : 'Checks whether your uploaded package is complete enough to generate a REVIEW candidate. ' +
                'Read-only — it places nothing and changes no status.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="shrink-0 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper disabled:opacity-50">
          {running ? 'Checking…' : notRun || !result ? 'Run readiness check' : 'Re-run readiness check'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-xs text-ink-3">
          Readiness check unavailable. ({error})
        </div>
      )}

      {!error && notRun && !result && (
        <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-xs text-ink-3">
          Not checked yet. Run the readiness check to see whether the package is complete enough for a REVIEW
          candidate.
        </div>
      )}

      {!error && result && present && (
        <div className="mt-3 space-y-4">
          {/* Verdict */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CHIP[present.tone]}`}>
                {present.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-2">{present.plainEnglish}</p>
            {result.refusalReason && <p className="mt-1 text-xs text-amber-800">{result.refusalReason}</p>}
            {nextStep && (
              <p className="mt-2 text-xs text-ink-2">
                <span className="font-semibold">Next step:</span> {nextStep}
              </p>
            )}
          </div>

          {/* REVIEW candidate overlay — only when the backend returned one */}
          {showCandidate && (
            <CandidateOverlay result={result} images={images} imagesError={imagesError} />
          )}

          {/* Extracted spans */}
          {result.spanRows.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink-2">Extracted spans ({result.spanRows.length})</h4>
              <div className="mt-2 space-y-2">
                {result.spanRows.map((row) => <SpanRow key={row.spanId} row={row} />)}
              </div>
            </div>
          )}

          {/* Endpoint anchoring */}
          {result.anchorBindings.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink-2">Endpoint anchoring</h4>
              <div className="mt-2 space-y-2">
                {result.anchorBindings.map((b) => <AnchorRow key={b.spanId} binding={b} />)}
              </div>
            </div>
          )}

          {/* Route verification */}
          {result.routeVerifications.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink-2">Route verification</h4>
              <div className="mt-2 space-y-2">
                {result.routeVerifications.map((r) => <RouteRow key={r.spanId} route={r} />)}
              </div>
            </div>
          )}

          {result.notice && <p className="text-[11px] italic text-ink-3">{result.notice}</p>}

          {/* Raw codes for traceability — engineering/QA only. */}
          {internalToolingEnabled() && (
            <details className="rounded-md border border-line bg-white px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-ink-3">Diagnostics (raw)</summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-[11px]">
                <InfoField label="readiness_status" value={result.readinessStatus} />
                <InfoField label="stage" value={result.stage} />
                <InfoField label="review_candidate_status" value={result.reviewCandidateStatus} />
                <InfoField label="recommended_next_input" value={result.recommendedNextInput} />
              </dl>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
