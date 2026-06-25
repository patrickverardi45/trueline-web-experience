'use client';

// Phase 6 — REVIEW acceptance lane. The uploaded-corpus ENGINE generates a SOURCE-SUPPORTED REVIEW redline
// candidate from the job's own plan + reviewed bore-log; the human ACCEPTS or REJECTS the engine candidate
// WITHOUT drawing geometry. REVIEW is a first-class product output, never AUTO. This shows the rendered
// candidate redline PNG(s), WHY it is REVIEW and not AUTO, its evidence/caveats, and Accept / Reject
// buttons. It NEVER exposes manual point-clicking — the geometry is the engine's. No mock fallback.

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import {
  acceptReviewCandidate,
  fetchJobArtifactBlob,
  generateReviewCandidate,
  listReviewCandidates,
  rejectReviewCandidate,
  type JobArtifactRef,
  type ReviewCandidateView,
} from '@/lib/api/productWrites';

type Boot =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; candidate: ReviewCandidateView | null };

function statusLabel(status: string | null): { text: string; tone: string } {
  switch (status) {
    case 'REVIEW_ACCEPTED':
      return { text: 'Accepted (human-accepted REVIEW)', tone: 'text-emerald-700' };
    case 'REVIEW_REJECTED':
      return { text: 'Rejected', tone: 'text-red-600' };
    case 'REVIEW_CANDIDATE':
      return { text: 'Awaiting your decision', tone: 'text-amber-700' };
    case 'ABSTAINED':
      return { text: 'Engine abstained — see the reasons below', tone: 'text-ink-3' };
    default:
      return { text: status ?? 'unknown', tone: 'text-ink-3' };
  }
}

// Plain-English copy for the engine's blocker / abstain codes. The raw code is still shown for traceability.
const BLOCKER_COPY: Record<string, string> = {
  NO_PLAN_DIALECT_RECOGNIZED:
    'This plan format isn’t supported yet — the engine has no matching plan dialect for it.',
  ENGINE_ABSTAINED: 'The engine abstained — it could not place a confident redline from the source.',
  NO_DRAWN_BORE_OVER_SPAN: 'No drawn bore was found over the bore-log’s station span on the plan.',
  INSUFFICIENT_DRAWN_COVERAGE: 'The drawn extent covers too little of the bore span to place confidently.',
  NO_CALLOUTS_EXTRACTED: 'No bore callouts could be extracted from the plan.',
  NO_PLAN_PDF_UPLOAD: 'No plan PDF has been uploaded to this job.',
  NO_ENGINE_READY_REVIEWED_BORE_LOG:
    'No engine-ready reviewed bore-log yet — pass the reviewed-bore-log gate above first.',
  PLAN_PDF_FILE_NOT_AVAILABLE: 'The uploaded plan PDF file is not available on the server.',
  BORE_LOG_FILE_NOT_AVAILABLE: 'The uploaded bore-log file is not available on the server.',
  NO_PER_BORE_TERMINI:
    'The plan draws one continuous alignment with no per-bore start/end — so the engine offers a REVIEW, not an automatic AUTO.',
  MATCHLINE_CONTINUATION_UNVERIFIED:
    'The cross-sheet continuation could not be verified from printed matchline stations.',
  CROSS_SHEET_CONTINUATION_REVIEW:
    'This bore spans multiple sheets; the legs are rendered per sheet, not assembled into one validated route.',
};

function blockerCopy(code: string): string | null {
  return BLOCKER_COPY[code] ?? null;
}

// Confidence band -> badge tone (HIGH = strong, LOW = verify). REVIEW confidence is never AUTO.
function confidenceTone(band: string | null): { bg: string; text: string; label: string } {
  switch (band) {
    case 'HIGH':
      return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'High confidence' };
    case 'MEDIUM':
      return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Medium confidence' };
    case 'LOW':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Low confidence — verify' };
    default:
      return { bg: 'bg-line', text: 'text-ink-2', label: 'Confidence not graded' };
  }
}

// Plain-English copy for the generic-fallback confidence warning codes.
const WARNING_COPY: Record<string, string> = {
  MANY_RIVAL_RUNS: 'Several drawn lines compete near the alignment — the chosen run may not be the bore.',
  NOISY_STATION_AXIS: 'The station labels fit the axis loosely, so the placement position is approximate.',
  SHORT_DRAWN_EXTENT: 'The matched drawn run is shorter than the bore span — coverage is partial.',
  LOW_CONFIDENCE_REVIEW_VERIFY_PLACEMENT: 'Low overall confidence — review this placement carefully before use.',
};

export function ProductReviewCandidates({
  jobId,
  refreshKey,
}: {
  jobId: string;
  // Changes when the job's uploads change so the lane re-reads the current candidate (if any).
  refreshKey?: string;
}) {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [images, setImages] = useState<readonly { path: string; url: string }[]>([]);

  // No synchronous setState in the body (the mount effect calls this, so it must not trip
  // react-hooks/set-state-in-effect); the Re-check button sets the loading state itself before calling it.
  const load = useCallback(async () => {
    try {
      const list = await listReviewCandidates(jobId);
      setBoot({ phase: 'ready', candidate: list.length > 0 ? list[0] : null });
    } catch (e) {
      setBoot({ phase: 'error', message: e instanceof Error ? e.message : 'unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  useEffect(() => {
    // Data fetch on mount/refresh: load() sets state only AFTER its awaited fetch resolves (never
    // synchronously in this effect body), so it does not cause the cascading renders the rule guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const candidate = boot.phase === 'ready' ? boot.candidate : null;

  async function onGenerate() {
    setBusy(true);
    setActionError(null);
    try {
      const report = await generateReviewCandidate(jobId);
      if (report.record) {
        setBoot({ phase: 'ready', candidate: report.record });
      } else {
        // Not runnable (inputs missing) — surface the honest blockers; no candidate was created.
        setActionError(
          report.blockers.map((b) => blockerCopy(b.code) ?? `${b.code}: ${b.reason}`).join(' · ') ||
            'The engine could not produce a candidate for this job yet.',
        );
        setBoot({ phase: 'ready', candidate: null });
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to generate a REVIEW candidate');
    } finally {
      setBusy(false);
    }
  }

  async function onAccept() {
    if (!candidate?.candidateId) return;
    setBusy(true);
    setActionError(null);
    try {
      setBoot({ phase: 'ready', candidate: await acceptReviewCandidate(jobId, candidate.candidateId) });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to accept');
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!candidate?.candidateId) return;
    if (!reason.trim()) {
      setActionError('A rejection reason is required.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      setBoot({
        phase: 'ready',
        candidate: await rejectReviewCandidate(jobId, candidate.candidateId, reason.trim()),
      });
      setReason('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to reject');
    } finally {
      setBusy(false);
    }
  }

  // Load the candidate's rendered redline PNG(s) WITH identity headers (a plain <img src> can't send them).
  useEffect(() => {
    // setImages is only called inside the async then/catch (never synchronously in the effect body), so an
    // empty artifact set resolves Promise.all([]) -> [] -> clears the images without a sync setState.
    const refs: readonly JobArtifactRef[] = candidate?.bundle?.artifacts ?? [];
    let active = true;
    const created: string[] = [];
    Promise.all(refs.map((r) => fetchJobArtifactBlob(jobId, r.path)))
      .then((blobs) => {
        if (!active) return;
        setImages(
          refs.map((r, i) => {
            const url = URL.createObjectURL(blobs[i]);
            created.push(url);
            return { path: r.path, url };
          }),
        );
      })
      .catch(() => active && setImages([]));
    return () => {
      active = false;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [jobId, candidate]);

  const status = candidate ? statusLabel(candidate.status) : null;
  const isCandidate = candidate?.status === 'REVIEW_CANDIDATE';
  const isAbstain = candidate?.status === 'ABSTAINED';

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Engine REVIEW redline candidate</h3>
        <button
          onClick={() => {
            setActionError(null);
            setBoot({ phase: 'loading' });
            void load();
          }}
          disabled={boot.phase === 'loading' || busy}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-50">
          {boot.phase === 'loading' ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      <p className="mt-1 text-sm text-ink-3">
        The engine generates a source-supported REVIEW redline from this job&apos;s own plan + reviewed
        bore-log. REVIEW is a real product output you accept or reject — it is engine-generated geometry,
        never hand-drawn, and never relabeled as deterministic AUTO.
      </p>

      {boot.phase === 'loading' && <p className="mt-2 text-sm text-ink-3">Checking for a candidate…</p>}
      {boot.phase === 'error' && (
        <p className="mt-2 text-sm text-ink-3">
          REVIEW candidate status unavailable — check the v2 product API connection. ({boot.message})
        </p>
      )}

      {boot.phase === 'ready' && !candidate && (
        <button
          onClick={onGenerate}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate engine REVIEW candidate'}
        </button>
      )}

      {candidate && status && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm">
            <span className={`font-semibold ${status.tone}`}>{status.text}</span>
            {candidate.tier && <span className="ml-2 font-mono text-ink-3">tier: {candidate.tier}</span>}
            {candidate.placementStatus && (
              <span className="ml-2 font-mono text-ink-3">engine: {candidate.placementStatus}</span>
            )}
          </p>
          {candidate.provenance && (
            <p className="mt-1 text-xs text-ink-3">
              provenance: <span className="font-mono">{candidate.provenance}</span>
              {candidate.noManualGeometry && ' · no manual geometry (engine-generated)'}
            </p>
          )}

          {/* Confidence — the general-upload (generic-geometry) REVIEW grade. Honest: a candidate, not
              deterministic truth. The reasons explain the support; the warnings flag what to verify. */}
          {candidate.genericFallback && (
            <div className="mt-2 rounded-md border border-line bg-paper px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const tone = confidenceTone(candidate.confidence?.band ?? null);
                  return (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.bg} ${tone.text}`}>
                      {tone.label}
                      {candidate.confidence?.score != null &&
                        ` · ${Math.round(candidate.confidence.score * 100)}%`}
                    </span>
                  );
                })()}
                <span className="text-xs text-ink-3">
                  Inferred from general plan evidence (station labels + drawn geometry). Review before use.
                </span>
              </div>
              {(candidate.confidence?.reasons.length ?? 0) > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">
                  {candidate.confidence!.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              {(candidate.confidence?.warnings.length ?? 0) > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
                  {candidate.confidence!.warnings.map((w) => (
                    <li key={w}>
                      {WARNING_COPY[w] ?? w}{' '}
                      <span className="font-mono text-[10px] text-red-500">({w})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Why REVIEW and not AUTO — honest, never an AUTO claim. */}
          {candidate.whyNotAuto?.autoBlocked && (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Why this is REVIEW, not AUTO:</span> the engine has no
              source-tight per-bore evidence to place this automatically.
              <ul className="mt-1 list-disc pl-5">
                {candidate.whyNotAuto.blockers.map((b) => (
                  <li key={b}>
                    {blockerCopy(b) ?? b}{' '}
                    <span className="font-mono text-[10px] text-amber-700">({b})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence / caveats. */}
          {(candidate.caveats.length > 0 || candidate.matchlineContinuity) && (
            <div className="mt-2 text-xs text-ink-2">
              {candidate.matchlineContinuity && (
                <p>
                  matchline continuity:{' '}
                  <span className="font-mono">{candidate.matchlineContinuity}</span>
                </p>
              )}
              {candidate.renderSheets.length > 0 && (
                <p>render sheet(s): <span className="font-mono">{candidate.renderSheets.join(', ')}</span></p>
              )}
              {candidate.caveats.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {candidate.caveats.map((c) => (
                    <li key={c} className="font-mono">{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Abstain / blockers. */}
          {isAbstain && candidate.blockers.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">
              {candidate.blockers.map((b) => (
                <li key={b.code}>
                  {blockerCopy(b.code) ?? b.reason}{' '}
                  <span className="font-mono text-[10px] text-ink-3">({b.code})</span>
                </li>
              ))}
            </ul>
          )}

          {candidate.status === 'REVIEW_REJECTED' && candidate.rejectionReason && (
            <p className="mt-2 text-xs text-ink-3">reason: {candidate.rejectionReason}</p>
          )}

          {/* The rendered candidate redline PNG(s). */}
          {images.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {images.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={img.path}
                  src={img.url}
                  alt={`Engine REVIEW redline ${img.path}`}
                  className="w-full rounded-lg border border-line bg-white"
                />
              ))}
            </div>
          )}

          {/* Accept / Reject — only while the candidate is awaiting a decision. */}
          {isCandidate && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onAccept}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? 'Working…' : 'Accept engine redline'}
                </button>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required to reject)"
                  className="min-w-[14rem] flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                />
                <button
                  onClick={onReject}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                  Reject / needs correction
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
    </Card>
  );
}
