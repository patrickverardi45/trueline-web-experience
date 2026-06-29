'use client';

// Phase 6 — REVIEW acceptance lane. The uploaded-corpus ENGINE generates a SOURCE-SUPPORTED REVIEW redline
// candidate from the job's own plan + reviewed bore-log; the human ACCEPTS or REJECTS the engine candidate
// WITHOUT drawing geometry. REVIEW is a first-class product output, never AUTO. This shows the rendered
// candidate redline PNG(s), WHY it is REVIEW and not AUTO, its evidence/caveats, and Accept / Reject buttons.
// The engine candidate is engine geometry only. When the automatic placement is UNCERTAIN (a generic
// general-upload candidate that the engine itself flags LOW / correction-recommended — partial coverage or
// several plausible drawn lines), a customer-understandable "Correct redline placement" step is offered: the
// reviewer marks the real bore route on the plan and saves a human-confirmed REVIEW. No mock fallback.

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { ProductSourceAnchorCapture } from '@/components/ProductSourceAnchorCapture';
import { internalToolingEnabled } from '@/lib/internalMode';
import {
  acceptReviewCandidate,
  fetchJobArtifactBlob,
  fetchJobArtifacts,
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
      return { text: 'Accepted', tone: 'text-emerald-700' };
    case 'REVIEW_REJECTED':
      return { text: 'Rejected', tone: 'text-red-600' };
    case 'REVIEW_CANDIDATE':
      return { text: 'Awaiting your decision', tone: 'text-amber-700' };
    case 'REVIEW_SUPERSEDED':
      return { text: 'Corrected — your placement saved', tone: 'text-emerald-700' };
    case 'ABSTAINED':
      return { text: 'Couldn’t place automatically — see reasons below', tone: 'text-ink-3' };
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

// Plain-English copy for the generic-fallback confidence warning codes. Several codes carry a dynamic value
// (a coverage %, a rival count), so they are matched by prefix; the rest map exactly. CORRECTION_RECOMMENDED
// is intentionally NOT shown as a bullet — it drives the "Correct redline placement" step below instead.
const WARNING_STATIC: Record<string, string> = {
  COMPETING_RUNS_NEAR_SCORE: 'Other drawn runs score almost as high — the selection is not clearly the bore.',
  NOISY_STATION_AXIS: 'The station labels fit the axis loosely, so the placement position is approximate.',
  RUN_LENGTH_UNLIKE_BORE_SPAN: 'The drawn run’s length is unlike the bore span — it may not be the bore.',
  PLACED_ON_FULL_SHEET_ALIGNMENT_LINE:
    'Placed on a full-sheet alignment line — the station location is right but the exact drawn line is unverified.',
  LOW_CONFIDENCE_REVIEW_VERIFY_PLACEMENT: 'Low overall confidence — review this placement carefully before use.',
};

const CORRECTION_RECOMMENDED = 'CORRECTION_RECOMMENDED';

function warningCopy(code: string): string {
  const partial = /^PARTIAL_SPAN_COVERAGE_(\d+)_PCT$/.exec(code);
  if (partial) return `The drawn run covers only about ${partial[1]}% of the bore span — coverage is partial.`;
  const rivals = /^MULTIPLE_PLAUSIBLE_RUNS_(\d+)$/.exec(code);
  if (rivals)
    return `${rivals[1]} drawn lines could each be the bore over this span — the automatic pick may not be the right line.`;
  const ticks = /^SPARSE_STATION_LABELS_(\d+)$/.exec(code);
  if (ticks) return `Only ${ticks[1]} station labels fit the axis here, so the placement position is approximate.`;
  return WARNING_STATIC[code] ?? code;
}

export function ProductReviewCandidates({
  jobId,
  refreshKey,
  planUploads,
  onChanged,
  hideGenerate = false,
  placed = false,
  allowCustomerCorrection = false,
}: {
  jobId: string;
  // Changes when the job's uploads change so the lane re-reads the current candidate (if any).
  refreshKey?: string;
  // The job's PLAN_PDF uploads — enables the "mark the route on the plan" step when a placement is uncertain.
  planUploads?: readonly { uploadId: string; filename: string }[];
  // Ask the workspace to refresh the job detail (slots) after accept/reject, so the Redlines/Closeout sections
  // recognize the accepted REVIEW candidate and offer Assemble — the user is never stranded after accepting.
  onChanged?: () => void;
  // Single-page workspace: the SOLE Generate lives in the Redline section, so suppress this lane's own
  // Generate button and, when no candidate exists yet, show a short pointer instead (default OFF preserves
  // standalone usage where this lane owns its own Generate).
  hideGenerate?: boolean;
  // Whether a redline is already placed (slots.redlineManifest) — drives the no-candidate hint copy.
  placed?: boolean;
  // Surface the existing "mark the route on the plan" capture to the CUSTOMER as the next step when automatic
  // placement fails / is uncertain (the approved guided-stepper fallback). Without this it stays internal-only.
  allowCustomerCorrection?: boolean;
}) {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [images, setImages] = useState<readonly { path: string; url: string }[]>([]);

  // No synchronous setState in the body (the mount effect calls this, so it must not trip
  // react-hooks/set-state-in-effect); callers set the loading state themselves before calling it.
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
      onChanged?.();                              // refresh slots so Redlines/Closeout offer Assemble
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
      onChanged?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to reject');
    } finally {
      setBusy(false);
    }
  }

  // Load the rendered redline PNG(s) WITH identity headers (a plain <img src> can't send them). For a
  // SUPERSEDED candidate (the human corrected it), show the CORRECTED redline from the job's current slot —
  // not the engine candidate's now-superseded bundle. setImages is only called inside the async fn (never
  // synchronously in the effect body), so an empty set resolves to [] without a sync setState.
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    const loadImages = async () => {
      const refs: readonly JobArtifactRef[] =
        candidate?.status === 'REVIEW_SUPERSEDED'
          ? await fetchJobArtifacts(jobId)
          : (candidate?.bundle?.artifacts ?? []);
      const blobs = await Promise.all(refs.map((r) => fetchJobArtifactBlob(jobId, r.path)));
      if (!active) return;
      setImages(
        refs.map((r, i) => {
          const url = URL.createObjectURL(blobs[i]);
          created.push(url);
          return { path: r.path, url };
        }),
      );
    };
    void loadImages().catch(() => active && setImages([]));
    return () => {
      active = false;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [jobId, candidate]);

  const status = candidate ? statusLabel(candidate.status) : null;
  const isCandidate = candidate?.status === 'REVIEW_CANDIDATE';
  const isAbstain = candidate?.status === 'ABSTAINED';
  // The engine itself flagged this generic placement as uncertain (LOW band, or an explicit
  // correction-recommended warning) -> offer the human correction step instead of a confident accept.
  const correctionRecommended =
    candidate?.genericFallback === true &&
    (candidate.confidence?.band === 'LOW' ||
      (candidate.confidence?.warnings.includes(CORRECTION_RECOMMENDED) ?? false));
  const isRejected = candidate?.status === 'REVIEW_REJECTED';
  // The customer may place the redline by hand (mark the route on the plan) when automatic placement fails or
  // is uncertain — the approved guided-stepper fallback. Requires a plan PDF to mark on. Internal tooling also
  // unlocks it for QA on any surface.
  const canCorrect = (allowCustomerCorrection || internalToolingEnabled()) && !!planUploads && planUploads.length > 0;

  return (
    <Card className="mt-4">
      <h3 className="font-semibold text-ink">Review the redline placement</h3>

      <p className="mt-1 text-sm text-ink-3">
        The system placed a redline from your plan and bore log. Check it below, then accept it — or correct
        the placement if it’s off.
      </p>

      {boot.phase === 'loading' && <p className="mt-2 text-sm text-ink-3">Checking for a candidate…</p>}
      {boot.phase === 'error' && (
        <p className="mt-2 text-sm text-ink-3">
          REVIEW candidate status unavailable — check the v2 product API connection. ({boot.message})
        </p>
      )}

      {boot.phase === 'ready' && !candidate && !hideGenerate && (
        <button
          onClick={onGenerate}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate engine REVIEW candidate'}
        </button>
      )}
      {boot.phase === 'ready' && !candidate && hideGenerate && (
        <>
          <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink-3">
            {placed
              ? 'No review needed — the redline was placed automatically. Continue to the Export step below.'
              : 'Generate the redline above; the candidate to review and accept (or correct) appears here. If automatic placement can’t find the bore, place it yourself below.'}
          </p>
          {canCorrect && !placed && planUploads && planUploads.length > 0 && (
            <details className="mt-3 rounded-lg border border-line bg-paper px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-ink-2">
                Place the redline yourself — mark the route on the plan
              </summary>
              <div className="mt-3">
                <ProductSourceAnchorCapture
                  jobId={jobId}
                  planUploads={planUploads}
                  onChanged={() => { void load(); onChanged?.(); }}
                />
              </div>
            </details>
          )}
        </>
      )}

      {candidate && status && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm">
            <span className={`font-semibold ${status.tone}`}>{status.text}</span>
          </p>

          {/* Corrected: the human replaced the uncertain engine placement with a confirmed route. */}
          {candidate.status === 'REVIEW_SUPERSEDED' && (
            <div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <span className="font-semibold">Placement corrected.</span> Your human-confirmed redline is
              saved and is now this job&apos;s placed redline (shown below). Assemble &amp; download it in the{' '}
              <span className="font-semibold">Closeout</span> and <span className="font-semibold">Exports</span>{' '}
              sections.
            </div>
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
              {candidate.confidence!.warnings.filter((w) => w !== CORRECTION_RECOMMENDED).length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
                  {candidate.confidence!.warnings
                    .filter((w) => w !== CORRECTION_RECOMMENDED)
                    .map((w) => (
                      <li key={w}>{warningCopy(w)}</li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {/* Why REVIEW and not AUTO — honest, never an AUTO claim. */}
          {candidate.whyNotAuto?.autoBlocked && (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Why this needs your review:</span> there isn’t tight enough
              evidence to place it automatically.
              <ul className="mt-1 list-disc pl-5">
                {candidate.whyNotAuto.blockers.map((b) => (
                  <li key={b}>{blockerCopy(b) ?? b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Engine evidence / caveats — raw diagnostic codes, collapsed behind Details (not the headline). */}
          {(candidate.caveats.length > 0 || candidate.matchlineContinuity || candidate.tier) && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-ink-3">Technical details</summary>
              <div className="mt-1 text-xs text-ink-2">
                {candidate.tier && <p>tier: <span className="font-mono">{candidate.tier}</span>
                  {candidate.placementStatus && <span> · engine: <span className="font-mono">{candidate.placementStatus}</span></span>}</p>}
                {candidate.matchlineContinuity && (
                  <p>matchline continuity: <span className="font-mono">{candidate.matchlineContinuity}</span></p>
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
            </details>
          )}

          {/* Abstain / blockers — plain-English only; the raw codes live under Technical details, not inline. */}
          {isAbstain && candidate.blockers.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">
              {candidate.blockers.map((b) => (
                <li key={b.code}>{blockerCopy(b.code) ?? b.reason}</li>
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

          {/* Placement uncertain — explain it, and (when correction is allowed) offer the on-plan
              mark-the-route tool as the next step, alongside accept/reject. */}
          {correctionRecommended && isCandidate && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
              <h4 className="text-sm font-semibold text-amber-900">This placement needs your review</h4>
              <p className="mt-1 text-xs text-amber-800">
                The automatic placement is uncertain
                {candidate.boreSpan ? ` for bore ${candidate.boreSpan}` : ''} — the plan has more than one
                plausible line over these stations, so FieldRoute is not confident which one is the bore.
                Review it on the proof above: <span className="font-semibold">accept</span> it if the
                placement is correct, <span className="font-semibold">reject</span> it, or mark the route
                yourself below.
              </p>
              {canCorrect && planUploads && planUploads.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Mark the route on the plan
                  </p>
                  <ProductSourceAnchorCapture
                    jobId={jobId}
                    planUploads={planUploads}
                    reviewedBoreLogId={candidate.reviewedBoreLogId ?? undefined}
                    suggestedSheets={candidate.renderSheets}
                    onChanged={() => {
                      void load();      // re-read the candidate -> SUPERSEDED (hides accept/correct, shows corrected)
                      onChanged?.();    // refresh workspace slots -> Redline/Export recognize the placed redline
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Abstained or rejected — the engine placed nothing usable. Surface the mark-the-route tool as the
              calm, actionable next step (the approved fallback), never a dead-end. */}
          {canCorrect && planUploads && planUploads.length > 0 && (isAbstain || isRejected) && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
              <h4 className="text-sm font-semibold text-amber-900">Place the redline yourself</h4>
              <p className="mt-1 text-xs text-amber-800">
                {isAbstain
                  ? 'FieldRoute couldn’t place this one automatically — it doesn’t guess. Mark the bore route on the plan and we’ll draw the redline from your points.'
                  : 'Mark the corrected bore route on the plan and we’ll draw the redline from your points.'}
              </p>
              <div className="mt-3">
                <ProductSourceAnchorCapture
                  jobId={jobId}
                  planUploads={planUploads}
                  reviewedBoreLogId={candidate.reviewedBoreLogId ?? undefined}
                  suggestedSheets={candidate.renderSheets}
                  onChanged={() => { void load(); onChanged?.(); }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
    </Card>
  );
}
