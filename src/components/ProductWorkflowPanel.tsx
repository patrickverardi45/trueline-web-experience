'use client';

// Redline section (single-page workspace). ONE "Generate redline" action runs the orchestrator, which
// chooses the path IN ORDER and shows it honestly:
//   * RECOGNIZED_DETERMINISTIC / UPLOADED_AUTO — placed automatically from the proven engine render; no human
//     acceptance needed -> assemble in the Closeout section below.
//   * UPLOADED_REVIEW — an engine REVIEW candidate placed on the job's own plan -> review & accept (or
//     correct) it in the Review section below. Never faked AUTO.
//   * ABSTAIN — neither recognized nor placeable; the SPECIFIC reasons are shown and nothing is placed.
// This section OWNS only Generate + the verdict + the placed PNG + a pointer. Accept/Reject + Correct live in
// the Review section; Assemble lives in Closeout; Download lives in Exports (one owner per action).

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import {
  fetchJobArtifactBlob,
  fetchJobArtifacts,
  runProductRedline,
  type JobArtifactRef,
  type ProductRedlineOutcome,
} from '@/lib/api/productWrites';

const PATH_COPY: Record<string, { title: string; tone: string; blurb: string }> = {
  RECOGNIZED_DETERMINISTIC: {
    title: 'Redline placed automatically',
    tone: 'text-emerald-700',
    blurb: 'This is a recognized project — the proven redline was placed automatically. No review needed; assemble the closeout package below.',
  },
  UPLOADED_REVIEW: {
    title: 'Redline placed — review it',
    tone: 'text-amber-700',
    blurb: 'The system placed a redline on your plan. Check it in the next section and accept it — or correct it if it’s off.',
  },
  UPLOADED_AUTO: {
    title: 'Redline placed automatically',
    tone: 'text-emerald-700',
    blurb: 'Placed automatically from your source files. Assemble the closeout package below.',
  },
  ABSTAIN: {
    title: 'Automatic placement needs a quick step',
    tone: 'text-amber-700',
    blurb: 'FieldRoute didn’t place this one automatically — it doesn’t guess when the source evidence is unclear. Here’s what it found. If your plan is uploaded, you can place the redline yourself below by marking the bore route on the plan.',
  },
};

const BLOCKER_COPY: Record<string, string> = {
  UPLOADED_CORPUS_NOT_RECOGNIZED: 'Not a recognized known project — no exact match in the deterministic library.',
  UPLOADED_CORPUS_AUTO_HANDOFF_NOT_IMPLEMENTED: 'Automatic deterministic handoff applies only to recognized projects.',
  BORE_LOG_NOT_MAPPED_TO_DETERMINISTIC_LOG:
    'The plan is recognized, but this bore-log does not map to a drawn deterministic bore.',
  RECOGNIZED_CORPUS_REGISTRY_NOT_CONFIGURED: 'No recognized-project library is configured on this deployment.',
  NO_ENGINE_READY_REVIEWED_BORE_LOG: 'The bore log still needs review — finish the Bore logs section above first.',
  NO_PLAN_PDF_UPLOAD: 'No plan PDF has been uploaded to this project.',
  NO_PLAN_DIALECT_RECOGNIZED: 'This plan format isn’t supported automatically yet — no matching plan dialect.',
  ENGINE_ABSTAINED: 'The engine could not place a confident redline from the uploaded source.',
  NO_AUTHORED_BOX_MATCH_FOR_BORE_SPAN: 'No drawn bore matched this bore-log’s station span on the plan.',
};

function copyFor(code: string): string | null {
  return BLOCKER_COPY[code] ?? null;
}

type Img = { path: string; url: string };

export function ProductWorkflowPanel({
  jobId,
  refreshKey,
  placed = false,
  onChanged,
  onGoToReview,
  onGoToCloseout,
}: {
  jobId: string;
  refreshKey?: string;
  // Persisted truth from the job's redline slot, so this panel reflects a redline placed in an earlier visit
  // (rehydrate) without re-clicking Generate.
  placed?: boolean;
  onChanged?: () => void; // refresh the job detail (slots) so Review/Closeout react to a fresh Generate
  onGoToReview?: () => void; // scroll to the Review section
  onGoToCloseout?: () => void; // scroll to the Closeout section
}) {
  const [outcome, setOutcome] = useState<ProductRedlineOutcome | null>(null);
  const [images, setImages] = useState<readonly Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset only when the JOB changes (a different project -> a fresh decision). NOT on every refreshKey bump,
  // so a just-generated verdict isn't wiped when an in-page action (accept/correct/assemble) refreshes state.
  // jobId is an intentional dep: it changes `reset`'s identity per project (driving the reset-on-job effect),
  // even though it isn't referenced in the body — so exhaustive-deps' "unnecessary" flag is suppressed here.
  const reset = useCallback(() => {
    setOutcome(null);
    setImages([]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reset();
  }, [reset]);

  const loadImages = useCallback(async () => {
    const refs: readonly JobArtifactRef[] = await fetchJobArtifacts(jobId);
    const blobs = await Promise.all(refs.map((r) => fetchJobArtifactBlob(jobId, r.path)));
    return refs.map((r, i) => ({ path: r.path, url: URL.createObjectURL(blobs[i]) }));
  }, [jobId]);

  useEffect(() => {
    return () => {
      for (const img of images) URL.revokeObjectURL(img.url);
    };
  }, [images]);

  // Rehydrate: a redline is already placed for this job (from an earlier visit or a recognized render). Show
  // the placed PNG(s) so the section reflects reality even before a fresh Generate click.
  const showRehydrated = placed && !outcome;
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
    try {
      const out = await runProductRedline(jobId);
      setOutcome(out);
      setImages(out.rendered ? await loadImages() : []);
      onChanged?.(); // let the Review/Closeout sections react to the fresh placement
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to generate the redline');
    } finally {
      setBusy(false);
    }
  }

  const path = outcome?.path ?? '';
  const pathCopy = PATH_COPY[path];
  const isReview = path === 'UPLOADED_REVIEW';
  const isAuto = path === 'RECOGNIZED_DETERMINISTIC' || path === 'UPLOADED_AUTO';
  const isAbstain = path === 'ABSTAIN';

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Redline</h3>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Generating…' : outcome || showRehydrated ? 'Regenerate redline' : 'Generate redline'}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-3">
        Generate the redline from your plan and bore log. It’s placed automatically when possible, or offered
        for your review — never guessed.
      </p>

      {/* Rehydrated: a redline is already placed (earlier visit) and no fresh outcome yet. */}
      {showRehydrated && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-semibold text-emerald-700">A redline is already placed for this project.</p>
          <p className="mt-1 text-xs text-ink-3">
            Generate again to refresh it, or continue to <button onClick={onGoToReview} className="font-semibold text-accent-strong hover:underline">Review</button>{' '}
            and <button onClick={onGoToCloseout} className="font-semibold text-accent-strong hover:underline">Closeout</button> below.
          </p>
          {images.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {images.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={img.path} src={img.url} alt={`Redline ${img.path}`}
                  className="w-full rounded-lg border border-line bg-white" />
              ))}
            </div>
          )}
        </div>
      )}

      {outcome && pathCopy && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-semibold">
            <span className={pathCopy.tone}>{pathCopy.title}</span>
          </p>
          <p className="mt-1 text-xs text-ink-3">{pathCopy.blurb}</p>

          {/* Placed redline PNG(s). */}
          {images.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {images.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={img.path} src={img.url} alt={`Redline ${img.path}`}
                  className="w-full rounded-lg border border-line bg-white" />
              ))}
            </div>
          )}

          {/* State pointer — one clear next step, no duplicate action here. */}
          {isReview && (
            <button
              onClick={onGoToReview}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
              Review &amp; accept (or correct) the placement ↓
            </button>
          )}
          {isAuto && (
            <button
              onClick={onGoToCloseout}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
              Continue to closeout ↓
            </button>
          )}

          {/* ABSTAIN — plain-English reasons only; the raw codes live under Technical details, never as a
              headline. Framed as an interim step (place it yourself below), not a terminal failure. */}
          {isAbstain && outcome.blockers.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
              {outcome.blockers.map((b, i) => (
                <li key={`${b.source}-${b.code}-${i}`}>{copyFor(b.code) ?? b.reason}</li>
              ))}
            </ul>
          )}

          {/* Diagnostics — raw path / provenance / blocker codes, collapsed (not the headline). */}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-ink-3">Technical details</summary>
            <p className="mt-1 text-xs text-ink-3">
              path: <span className="font-mono">{path}</span>
              {outcome.provenance && (<span className="ml-2">provenance: <span className="font-mono">{outcome.provenance}</span></span>)}
              {outcome.deterministicLogId && (<span className="ml-2">log: <span className="font-mono">{outcome.deterministicLogId}</span></span>)}
              {outcome.renderCommit && (<span className="ml-2">render: <span className="font-mono">{outcome.renderCommit}</span></span>)}
            </p>
            {isAbstain && outcome.blockers.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-ink-3">
                {outcome.blockers.map((b, i) => (
                  <li key={`code-${b.source}-${b.code}-${i}`} className="font-mono">{b.source}: {b.code}</li>
                ))}
              </ul>
            )}
          </details>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
