'use client';

// Recognized-corpus AUTOMATIC redline handoff — the NORMAL product path (NO manual point-clicking). Reads
// the recognized-corpus readiness for the selected job: for a POSITIVELY-recognized known corpus it offers
// "Run automatic redline" -> publishes the EXISTING deterministic engine render as a job-local
// FINAL_REDLINE_PNG bundle and shows it inline. For an unrecognized/arbitrary upload it shows the honest
// named blockers — a redline must come from the engine, never from hand-clicked geometry. No mock fallback.

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import {
  fetchJobArtifactBlob,
  fetchRecognizedCorpusHandoff,
  runRecognizedCorpusRender,
  type JobArtifactRef,
  type RecognizedCorpusHandoffView,
  type RecognizedCorpusRenderResult,
} from '@/lib/api/productWrites';

type Boot =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; view: RecognizedCorpusHandoffView };

// Honest dominant-blocker summary for the NOT-runnable state. The previous copy hard-coded "not a
// recognized known corpus", which mislabeled BOTH (a) the deployment having no registry loaded — the
// public-staging cause — and (b) a recognized plan that simply hasn't passed the review gate. Pick the
// most specific honest message by blocker code, and NEVER interpolate the corpus's real name (no
// project/location/operator names in the visible UI).
function blockedSummary(view: RecognizedCorpusHandoffView): { title: string; body: string } {
  const codes = new Set(view.blockers.map((b) => b.code));
  if (codes.has('RECOGNIZED_CORPUS_REGISTRY_NOT_CONFIGURED')) {
    return {
      title: 'Automatic redline is not configured on this deployment',
      body:
        'The recognized-corpus registry is not loaded on the server, so no uploaded plan can be matched. ' +
        'This is a deployment/configuration issue — not a problem with your upload. Re-check once the ' +
        'server is configured.',
    };
  }
  if (codes.has('UPLOADED_CORPUS_NOT_RECOGNIZED')) {
    return {
      title: 'No automatic redline — the uploaded plan is not a recognized known corpus',
      body:
        'The engine cannot derive route geometry from an unrecognized plan. Manual point-tracing is ' +
        'internal proof only and is not the customer workflow — a redline must come from the engine, ' +
        'never from hand-clicked points.',
    };
  }
  if (
    view.recognizedCorpusId ||
    codes.has('NO_ENGINE_READY_REVIEWED_BORE_LOG') ||
    codes.has('BORE_LOG_NOT_MAPPED_TO_DETERMINISTIC_LOG')
  ) {
    return {
      title: 'Recognized known corpus — finish the bore-log review gate to enable the automatic redline',
      body:
        'The uploaded plan is recognized, but the reviewed bore-log has not passed the engine-readiness ' +
        'gate yet. Confirm the reviewed row(s) and segment group(s) above (engine_ready must be true), ' +
        'then Re-check.',
    };
  }
  return { title: 'No automatic redline is available yet', body: 'See the named blockers below.' };
}

export function ProductRecognizedCorpusHandoff({
  jobId,
  refreshKey,
}: {
  jobId: string;
  // Changes when the selected job's uploads change (e.g. the PLAN_PDF is uploaded). Re-fetches recognition
  // so the card never stays stuck on a stale pre-upload "not recognized" response.
  refreshKey?: string;
}) {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [result, setResult] = useState<RecognizedCorpusRenderResult | null>(null);
  const [images, setImages] = useState<readonly { path: string; url: string }[]>([]);

  const load = useCallback(async () => {
    setBoot({ phase: 'loading' });
    setRenderError(null);   // drop any stale render error (e.g. a prior 409) so Re-check reflects current truth
    try {
      setBoot({ phase: 'ready', view: await fetchRecognizedCorpusHandoff(jobId) });
    } catch (e) {
      setBoot({ phase: 'error', message: e instanceof Error ? e.message : 'unavailable' });
    }
    // refreshKey changes when the job's uploads change → re-create load → the effect below re-fetches, so
    // recognition updates the moment the PLAN_PDF is uploaded (never stuck on a pre-upload "not recognized").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRun() {
    // Never POST the render unless the latest readiness says runnable (defence-in-depth — the button is
    // only shown when runnable, and the backend 409s otherwise, but don't fire a known-doomed request).
    if (boot.phase !== 'ready' || !boot.view.runnable) return;
    setBusy(true);
    setRenderError(null);
    setResult(null);
    try {
      setResult(await runRecognizedCorpusRender(jobId));
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : 'failed to run automatic redline');
    } finally {
      setBusy(false);
    }
  }

  // Load the rendered redline PNG(s) WITH identity headers (a plain <img src> cannot send them); revoke
  // object URLs on change/unmount. Honest-empty on failure (never a placeholder image).
  useEffect(() => {
    const refs: readonly JobArtifactRef[] = result?.artifacts ?? [];
    if (refs.length === 0) {
      setImages([]);
      return;
    }
    let active = true;
    const created: string[] = [];
    Promise.all(refs.map((r) => fetchJobArtifactBlob(jobId, r.path)))
      .then((blobs) => {
        if (!active) return;
        setImages(refs.map((r, i) => {
          const url = URL.createObjectURL(blobs[i]);
          created.push(url);
          return { path: r.path, url };
        }));
      })
      .catch(() => active && setImages([]));
    return () => {
      active = false;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [jobId, result]);

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Automatic redline handoff</h3>
        <button
          onClick={() => void load()}
          disabled={boot.phase === 'loading' || busy}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-50">
          {boot.phase === 'loading' ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      {boot.phase === 'loading' && (
        <p className="mt-1 text-sm text-ink-3">Checking automatic redline availability…</p>
      )}
      {boot.phase === 'error' && (
        <p className="mt-1 text-sm text-ink-3">
          Automatic-handoff status unavailable — check the v2 product API connection. ({boot.message})
        </p>
      )}

      {boot.phase === 'ready' && boot.view.runnable && (
        <>
          <p className="mt-1 text-sm text-ink-3">
            <span className="font-semibold text-ink">{boot.view.recognizedPackageLabel ?? 'Recognized known corpus'}</span> — an automatic
            deterministic redline is available. This serves the existing TrueLine engine render for the
            recognized bore-log (<span className="font-mono">{boot.view.deterministicLogId}</span>, render
            commit <span className="font-mono">{boot.view.renderCommit}</span>) — engine-derived, NOT
            hand-clicked, and NOT re-counted in the deterministic 50/58 frontier.
          </p>
          <button
            onClick={onRun}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            {busy ? 'Running…' : 'Run automatic redline'}
          </button>
        </>
      )}

      {boot.phase === 'ready' && !boot.view.runnable && (() => {
        const summary = blockedSummary(boot.view);
        return (
          <>
            <p className="mt-1 text-sm text-ink-3">
              <span className="font-semibold text-ink">{summary.title}</span> — {summary.body}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-xs text-ink-2">
              {boot.view.blockers.map((b) => (
                <li key={b.code}>
                  <span className="font-mono">{b.code}</span> — {b.reason}
                </li>
              ))}
            </ul>
          </>
        );
      })()}

      {renderError && <p className="mt-2 text-sm text-red-600">{renderError}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm">
            <span className="font-mono text-ink">redline: {result.status}</span>
            <span className="ml-2 font-mono text-ink-3">
              {result.artifactCount} artifact(s) · {result.bundleOrigin}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-3">
            recognized known corpus · log:{' '}
            <span className="font-mono">{result.deterministicLogId ?? '—'}</span> · render commit:{' '}
            <span className="font-mono">{result.renderCommit ?? '—'}</span> · bundle:{' '}
            <span className="font-mono">{result.bundleId ?? '—'}</span>
          </p>
          {images.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {images.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={img.path}
                  src={img.url}
                  alt={`Deterministic redline ${img.path}`}
                  className="w-full rounded-lg border border-line bg-white"
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink-3">
              Real redline artifact(s) published to this job. (Preview unavailable — listed in the redline
              gallery.)
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
