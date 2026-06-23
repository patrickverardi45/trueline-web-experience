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
      return { text: 'Engine abstained — no credible source evidence', tone: 'text-ink-3' };
    default:
      return { text: status ?? 'unknown', tone: 'text-ink-3' };
  }
}

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
          report.blockers.map((b) => `${b.code}: ${b.reason}`).join(' · ') ||
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

          {/* Why REVIEW and not AUTO — honest, never an AUTO claim. */}
          {candidate.whyNotAuto?.autoBlocked && (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Why this is REVIEW, not AUTO:</span> the engine has no
              source-tight per-bore evidence to place this automatically.
              <ul className="mt-1 list-disc pl-5">
                {candidate.whyNotAuto.blockers.map((b) => (
                  <li key={b} className="font-mono">{b}</li>
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
                <li key={b.code}><span className="font-mono">{b.code}</span> — {b.reason}</li>
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
