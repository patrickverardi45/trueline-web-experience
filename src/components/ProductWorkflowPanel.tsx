'use client';

// Phase 9 — the product workflow panel. ONE "Generate redline" action runs the orchestrator, which chooses
// the correct path IN ORDER and is shown DISTINCTLY:
//   * RECOGNIZED_DETERMINISTIC — a recognized package serves the EXISTING proven engine render (real
//     FINAL_REDLINE_PNG, DETERMINISTIC_AUTO). No human acceptance needed.
//   * UPLOADED_REVIEW — a supported uploaded package's engine REVIEW candidate (never faked AUTO); Accept /
//     Reject before it can be packaged.
//   * ABSTAIN — neither recognized nor placeable; the SPECIFIC reasons (recognition + engine) are shown and
//     nothing can be accepted.
// After a placed redline, a second action assembles the closeout/export package. KMZ is honestly BLOCKED for
// the pixel-only redline manifest (no faked coordinates). No manual point-clicking anywhere.

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import {
  acceptReviewCandidate,
  assembleCloseoutPackage,
  downloadCloseoutPdfBlob,
  downloadExportBundleBlob,
  fetchJobArtifactBlob,
  fetchJobArtifacts,
  rejectReviewCandidate,
  runProductRedline,
  type CloseoutPackageResult,
  type JobArtifactRef,
  type ProductRedlineOutcome,
} from '@/lib/api/productWrites';

const PATH_COPY: Record<string, { title: string; tone: string; blurb: string }> = {
  RECOGNIZED_DETERMINISTIC: {
    title: 'Recognized deterministic package',
    tone: 'text-emerald-700',
    blurb:
      'This package is recognized — the system served the EXISTING proven engine redline for the matched ' +
      'log (deterministic, engine-derived, not hand-drawn).',
  },
  UPLOADED_REVIEW: {
    title: 'Engine REVIEW candidate',
    tone: 'text-amber-700',
    blurb:
      'Not a recognized package, but the engine placed a candidate on this job’s own plan. REVIEW is a real ' +
      'product output you accept or reject — engine-generated geometry, never relabeled as deterministic AUTO.',
  },
  UPLOADED_AUTO: {
    title: 'Engine AUTO placement',
    tone: 'text-emerald-700',
    blurb: 'The engine placed this automatically from source-tight evidence.',
  },
  ABSTAIN: {
    title: 'Cannot place — specific reasons',
    tone: 'text-ink-2',
    blurb:
      'This package is neither a recognized deterministic project nor placeable by the engine. The system ' +
      'abstains rather than guess — the specific reasons are below, and nothing can be accepted.',
  },
};

const BLOCKER_COPY: Record<string, string> = {
  UPLOADED_CORPUS_NOT_RECOGNIZED:
    'Not a recognized known project — no exact match in the deterministic corpus.',
  UPLOADED_CORPUS_AUTO_HANDOFF_NOT_IMPLEMENTED:
    'Automatic deterministic handoff applies only to recognized corpora.',
  BORE_LOG_NOT_MAPPED_TO_DETERMINISTIC_LOG:
    'The plan is recognized, but this bore-log does not map to a drawn deterministic log.',
  RECOGNIZED_CORPUS_REGISTRY_NOT_CONFIGURED:
    'No recognized-corpus registry is configured on this deployment.',
  NO_ENGINE_READY_REVIEWED_BORE_LOG:
    'No engine-ready reviewed bore-log yet — pass the reviewed-bore-log gate above first.',
  NO_PLAN_PDF_UPLOAD: 'No plan PDF has been uploaded to this job.',
  NO_PLAN_DIALECT_RECOGNIZED: 'This plan format isn’t supported yet — no matching plan dialect.',
  ENGINE_ABSTAINED: 'The engine abstained — it could not place a confident redline from the source.',
  NO_AUTHORED_BOX_MATCH_FOR_BORE_SPAN:
    'No authored bore box matched this bore-log’s station span on the plan.',
};

function copyFor(code: string): string | null {
  return BLOCKER_COPY[code] ?? null;
}

// Honest copy for the closeout-assembly review gate (a REVIEW redline must be human-accepted before packaging).
function assembleBlockerCopy(blocker: string | null): string {
  switch (blocker) {
    case 'REVIEW_NOT_ACCEPTED':
      return 'Accept the engine REVIEW candidate in the Review section first, then assemble.';
    case 'REVIEW_WAS_REJECTED':
      return 'The REVIEW candidate was rejected — correct it in the Review section before assembling.';
    case 'REVIEW_ABSTAINED':
      return 'The engine abstained — there is no placed redline to assemble.';
    default:
      return 'Cannot assemble the closeout package yet.';
  }
}

type Img = { path: string; url: string };

export function ProductWorkflowPanel({
  jobId,
  refreshKey,
  placed = false,
  assembled = false,
  onChanged,
}: {
  jobId: string;
  refreshKey?: string;
  // Persisted truth from the job's slots, so this panel reflects redlines placed/assembled in ANOTHER panel
  // (e.g. a REVIEW candidate accepted in the Review section) without a fresh Generate click in THIS panel.
  placed?: boolean; // slots.redlineManifest — a redline candidate is placed (recognized OR uploaded)
  assembled?: boolean; // slots.exportPackage — the closeout/export package is already assembled
  onChanged?: () => void; // ask the workspace to refresh the job detail (slots) after accept/reject/assemble
}) {
  const [outcome, setOutcome] = useState<ProductRedlineOutcome | null>(null);
  const [images, setImages] = useState<readonly Img[]>([]);
  const [pkg, setPkg] = useState<CloseoutPackageResult | null>(null);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [reviewRejected, setReviewRejected] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when the job/uploads change (a different package -> a fresh decision).
  const reset = useCallback(() => {
    setOutcome(null);
    setImages([]);
    setPkg(null);
    setReviewAccepted(false);
    setReviewRejected(false);
    setReason('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reset();
  }, [reset]);

  // Load the placed redline PNG(s) for the current bundle once a render has happened.
  const loadImages = useCallback(async () => {
    const refs: readonly JobArtifactRef[] = await fetchJobArtifacts(jobId);
    const blobs = await Promise.all(refs.map((r) => fetchJobArtifactBlob(jobId, r.path)));
    return refs.map((r, i) => ({ path: r.path, url: URL.createObjectURL(blobs[i]) }));
  }, [jobId]);

  // Revoke object URLs on unmount / replacement.
  useEffect(() => {
    return () => {
      for (const img of images) URL.revokeObjectURL(img.url);
    };
  }, [images]);

  // Rehydrate: a redline is already placed for this job (slots.redlineManifest) — e.g. a REVIEW candidate
  // accepted in the Review section, or a prior generate — but this panel has no fresh Generate outcome and
  // the package is not yet assembled. Load the placed PNG(s) so the panel offers Assemble directly; the
  // owner is never stranded on "Generate" after accepting elsewhere.
  const showRehydrated = placed && !assembled && !outcome;
  useEffect(() => {
    if (!showRehydrated) return;
    let active = true;
    loadImages()
      .then((imgs) => active && setImages(imgs))
      .catch(() => active && setImages([]));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRehydrated, jobId, refreshKey]);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setPkg(null);
    setReviewAccepted(false);
    setReviewRejected(false);
    try {
      const out = await runProductRedline(jobId);
      setOutcome(out);
      // Reflect the candidate's PERSISTED acceptance (idempotent generate preserves a prior decision), so a
      // re-run after accepting elsewhere shows "ready to assemble", not a fresh acceptance gate.
      setReviewAccepted(out.reviewAccepted);
      setReviewRejected(out.reviewRejected);
      setImages(out.rendered ? await loadImages() : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to run the redline workflow');
    } finally {
      setBusy(false);
    }
  }

  async function onAccept() {
    if (!outcome?.candidateId) return;
    setBusy(true);
    setError(null);
    try {
      await acceptReviewCandidate(jobId, outcome.candidateId);
      setReviewAccepted(true);
      onChanged?.();                                   // refresh slots so Closeout/Exports see the acceptance
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to accept');
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!outcome?.candidateId) return;
    if (!reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectReviewCandidate(jobId, outcome.candidateId, reason.trim());
      setReviewRejected(true);
      setReason('');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to reject');
    } finally {
      setBusy(false);
    }
  }

  async function onAssemble() {
    setBusy(true);
    setError(null);
    try {
      const result = await assembleCloseoutPackage(jobId);
      if (result.assembled) {
        setPkg(result);
        onChanged?.();                                // refresh slots so Closeout/Exports reflect the package
      } else {
        // The backend review gate refused (pending/rejected REVIEW) — surface the honest next step.
        setPkg(null);
        setError(assembleBlockerCopy(result.blocker));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to assemble the closeout package');
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadExportBundleBlob(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `redline_export_${jobId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to download the export package');
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadPdf() {
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadCloseoutPdfBlob(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `closeout_packet_${jobId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to download the closeout PDF');
    } finally {
      setBusy(false);
    }
  }

  const path = outcome?.path ?? '';
  const pathCopy = PATH_COPY[path];
  const isReview = path === 'UPLOADED_REVIEW';
  const isAbstain = path === 'ABSTAIN';
  const canPackage =
    outcome?.rendered === true && !reviewRejected && (!outcome.requiresAcceptance || reviewAccepted);

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Redline workflow</h3>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy && !outcome ? 'Working…' : 'Generate redline'}
        </button>
      </div>

      <p className="mt-1 text-sm text-ink-3">
        One step decides the path: a recognized deterministic package serves the proven engine redline; a
        supported uploaded package produces an engine REVIEW candidate to accept or reject; anything else
        honestly abstains with specific reasons. No coordinates are ever invented.
      </p>

      {/* Rehydrated: a redline is ALREADY placed for this job (e.g. accepted in the Review section) and the
          package is not yet assembled — offer Assemble directly so the owner is never stranded on "Generate".
          The backend review gate still enforces acceptance; a pending/rejected REVIEW surfaces a clear next
          step via onAssemble's error. */}
      {showRehydrated && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-semibold text-emerald-700">A redline is already placed for this job.</p>
          <p className="mt-1 text-xs text-ink-3">
            It was placed in an earlier step (a recognized deterministic render or an accepted REVIEW
            candidate). You don’t need to generate again — assemble the closeout &amp; export package here, or
            from the <span className="font-semibold">Closeout</span> section.
          </p>
          {images.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {images.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={img.path}
                  src={img.url}
                  alt={`Redline ${img.path}`}
                  className="w-full rounded-lg border border-line bg-white"
                />
              ))}
            </div>
          )}
          <div className="mt-3 border-t border-line pt-3">
            <button
              onClick={onAssemble}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-2 hover:text-ink disabled:opacity-50">
              {busy && !pkg ? 'Assembling…' : 'Assemble closeout & export package'}
            </button>
          </div>
        </div>
      )}

      {/* Already assembled — point to Exports instead of a dead "Generate" landing on a finished job. */}
      {assembled && !outcome && !pkg && (
        <p className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-ink-2">
          The closeout &amp; export package for this job is already assembled — download the ZIP / PDF in the{' '}
          <span className="font-semibold">Exports</span> section.
        </p>
      )}

      {outcome && pathCopy && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm">
            <span className={`font-semibold ${pathCopy.tone}`}>{pathCopy.title}</span>
            <span className="ml-2 font-mono text-xs text-ink-3">{path}</span>
          </p>
          <p className="mt-1 text-xs text-ink-3">{pathCopy.blurb}</p>
          <p className="mt-1 text-xs text-ink-3">
            {outcome.provenance && (
              <>provenance: <span className="font-mono">{outcome.provenance}</span></>
            )}
            {outcome.deterministicLogId && (
              <span className="ml-2">log: <span className="font-mono">{outcome.deterministicLogId}</span></span>
            )}
            {outcome.renderCommit && (
              <span className="ml-2">render: <span className="font-mono">{outcome.renderCommit}</span></span>
            )}
          </p>

          {/* ABSTAIN — specific reasons grouped by source (recognition + engine), never a bare code. */}
          {isAbstain && outcome.blockers.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">
              {outcome.blockers.map((b, i) => (
                <li key={`${b.source}-${b.code}-${i}`}>
                  <span className="uppercase text-[10px] font-semibold text-ink-3">{b.source}</span>{' '}
                  {copyFor(b.code) ?? b.reason}{' '}
                  <span className="font-mono text-[10px] text-ink-3">({b.code})</span>
                </li>
              ))}
            </ul>
          )}

          {/* The placed redline PNG(s). */}
          {images.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {images.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={img.path}
                  src={img.url}
                  alt={`Redline ${img.path}`}
                  className="w-full rounded-lg border border-line bg-white"
                />
              ))}
            </div>
          )}

          {/* REVIEW accept / reject (the only human gate; no geometry drawn). */}
          {isReview && !reviewAccepted && !reviewRejected && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button
                onClick={onAccept}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                Accept engine redline
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
          )}
          {reviewAccepted && (
            <p className="mt-2 text-sm text-emerald-700">Accepted (human-accepted REVIEW).</p>
          )}
          {reviewRejected && (
            <p className="mt-2 text-sm text-red-600">Rejected — cannot be packaged until corrected.</p>
          )}

          {/* Closeout / export package (enabled once the redline is placed + accepted). */}
          {canPackage && (
            <div className="mt-3 border-t border-line pt-3">
              <button
                onClick={onAssemble}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-2 hover:text-ink disabled:opacity-50">
                {busy && !pkg ? 'Assembling…' : 'Assemble closeout & export package'}
              </button>
            </div>
          )}

        </div>
      )}

      {/* Closeout/export RESULT — panel-level so it shows after Assemble from EITHER the fresh-generate flow
          or the rehydrated (already-placed) flow. */}
      {pkg && (
        <div className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-ink-2">
          <p>
            closeout: <span className="font-mono">{pkg.closeoutStatus}</span>
            {' · '}export package: <span className="font-mono">{pkg.exportStatus}</span>
          </p>
          {pkg.includedSections.length > 0 && (
            <p className="mt-1">included: <span className="font-mono">{pkg.includedSections.join(', ')}</span></p>
          )}
          {pkg.omittedSections.length > 0 && (
            <p className="mt-1">omitted: <span className="font-mono">{pkg.omittedSections.join(', ')}</span></p>
          )}
          <p className="mt-1">
            KMZ: <span className="font-mono">{pkg.kmzStatus}</span>
            {pkg.kmzStatus === 'BLOCKED' && (
              <span className="ml-1 text-ink-3">
                — no geo-referenced coordinates on the pixel-space redline; the system refuses to fake
                them ({pkg.kmzBlockers.join(', ') || pkg.kmzGeometryBasis})
              </span>
            )}
          </p>
          {pkg.assembled && (
            <div className="mt-2 border-t border-line pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onDownload}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                  {busy ? 'Preparing…' : 'Download closeout package (.zip)'}
                </button>
                <button
                  onClick={onDownloadPdf}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
                  {busy ? 'Preparing…' : 'Download closeout PDF'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-ink-3">
                ZIP = redline PNG(s) + manifest + closeout/export/KMZ status + reviewed bore-log metadata.
                PDF = a customer-readable closeout packet (the same trusted data + embedded redline
                evidence; billing quantities only — no dollars unless server cost rules are configured).
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
