'use client';

// Product-mode intake orchestrator: create/load the tenant's project, list + create + select jobs, and
// drive uploads + inventory for the selected job. Product-mode gated (renders an honest note when off);
// no mock fallback — connectivity failures show an honest "unavailable" state, never fake projects/jobs.

import { useCallback, useEffect, useRef, useState } from 'react';

import { productApiEnabled } from '@/lib/api/liveV2Product';
import {
  createProductJob,
  createProductProject,
  fetchProductJobDetail,
  fetchRecognizedCorpusHandoff,
  listProductJobs,
  productProjectExists,
  type ProductJobDetail,
  type ProductJobSummary,
} from '@/lib/api/productWrites';
import { Card } from '@/components/ui/Card';
import { ProductUploadPanel } from '@/components/ProductUploadPanel';
import { ProductUploadInventory } from '@/components/ProductUploadInventory';
import { ProductReviewedBoreLogGate } from '@/components/ProductReviewedBoreLogGate';
import { ProductRecognizedCorpusHandoff } from '@/components/ProductRecognizedCorpusHandoff';
import { ProductReviewCandidates } from '@/components/ProductReviewCandidates';
import { ProductSourceAnchorCapture } from '@/components/ProductSourceAnchorCapture';

type Boot =
  | { phase: 'off' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready' };

function defaultJobId(): string {
  // Browser-only convenience; the backend re-validates the id (^[a-z0-9][a-z0-9_-]{0,62}$).
  return 'job-' + Math.random().toString(36).slice(2, 8);
}

function internalProofEnabled(): boolean {
  // Manual source-anchor capture is an INTERNAL developer proof harness ONLY — never the customer/owner
  // flow. A redline must come from the engine, not from hand-clicked route points. Hidden unless this
  // explicit build-time opt-in is set; default = hidden.
  return process.env.NEXT_PUBLIC_TL2_INTERNAL_PROOF === '1';
}

export function ProductIntake() {
  const [boot, setBoot] = useState<Boot>(() =>
    productApiEnabled() ? { phase: 'loading' } : { phase: 'off' },
  );
  const [projectExists, setProjectExists] = useState(false);
  const [jobs, setJobs] = useState<ProductJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductJobDetail | null>(null);
  const [newJobId, setNewJobId] = useState<string>(defaultJobId());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Which redline path applies to the selected job: true = recognized corpus (automatic deterministic
  // handoff), false = engine REVIEW lane, null = not yet checked. Keeps the two redline cards mutually
  // exclusive so a job never shows a card that does not apply to it.
  const [recognized, setRecognized] = useState<boolean | null>(null);
  const deepLinkApplied = useRef(false);
  const uploadsKey = detail?.uploads.map((u) => u.uploadId).join('|') ?? '';

  const loadProjectAndJobs = useCallback(async () => {
    const list = await listProductJobs(); // connectivity gate: throws on backend-down (honest error)
    const exists = await productProjectExists(); // 404 -> false (genuinely no project yet)
    setJobs(list);
    setProjectExists(exists);
  }, []);

  useEffect(() => {
    if (!productApiEnabled()) return;
    let active = true;
    loadProjectAndJobs()
      .then(() => active && setBoot({ phase: 'ready' }))
      .catch((err: unknown) =>
        active && setBoot({ phase: 'error', message: err instanceof Error ? err.message : 'unavailable' }),
      );
    return () => {
      active = false;
    };
  }, [loadProjectAndJobs]);

  const refreshDetail = useCallback(async (jobId: string) => {
    setDetail(await fetchProductJobDetail(jobId));
  }, []);

  async function onSelectJob(jobId: string) {
    setSelectedJobId(jobId);
    setActionError(null);
    try {
      await refreshDetail(jobId);
    } catch (e) {
      setDetail(null);
      setActionError(e instanceof Error ? e.message : 'failed to load job');
    }
  }

  // Re-evaluate which redline path applies whenever the job changes OR its uploads change (a newly uploaded
  // plan may become a recognized corpus). A failed/!runnable check is non-fatal: default to the engine
  // REVIEW lane (the general case). recognized === null while the check is in flight -> show neither card.
  useEffect(() => {
    // Reset to "unknown" the moment the job/uploads change so a stale card never lingers; the resolved
    // value comes from the awaited fetch below (this is the only synchronous setState — a sanctioned reset).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecognized(null);
    if (!selectedJobId || !detail) return;
    let active = true;
    fetchRecognizedCorpusHandoff(selectedJobId)
      .then((view) => {
        if (active) setRecognized(Boolean(view.runnable) || view.recognizedCorpusId != null);
      })
      .catch(() => {
        if (active) setRecognized(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, uploadsKey]);

  // One-time deep link: /intake?job=<id> auto-selects that job once it appears in the loaded list, so the
  // landing-page cards land directly on the right job. Only ever selects a job that actually exists.
  useEffect(() => {
    if (boot.phase !== 'ready' || deepLinkApplied.current || typeof window === 'undefined') return;
    const wanted = new URLSearchParams(window.location.search).get('job');
    if (!wanted) {
      deepLinkApplied.current = true;
      return;
    }
    if (jobs.some((j) => j.jobId === wanted)) {
      deepLinkApplied.current = true;
      // One-time deep-link selection in reaction to the loaded jobs list (sanctioned data -> action).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void onSelectJob(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.phase, jobs]);

  async function onCreateProject() {
    setBusy(true);
    setActionError(null);
    try {
      await createProductProject('Internal product project');
      await loadProjectAndJobs();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to create project');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateJob() {
    setBusy(true);
    setActionError(null);
    try {
      await createProductJob(newJobId);
      await loadProjectAndJobs();
      await onSelectJob(newJobId);
      setNewJobId(defaultJobId());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to create job');
    } finally {
      setBusy(false);
    }
  }

  if (boot.phase === 'off') {
    return (
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">Product mode is off</h3>
        <p className="mt-1 text-sm text-ink-3">
          This intake page only operates against the real v2 product API. Set{' '}
          <span className="font-mono">NEXT_PUBLIC_TL2_PRODUCT_API=1</span> plus{' '}
          <span className="font-mono">NEXT_PUBLIC_TL2_API_BASE</span> /{' '}
          <span className="font-mono">NEXT_PUBLIC_TL2_TENANT</span>. No mock intake is shown.
        </p>
      </Card>
    );
  }
  if (boot.phase === 'loading') {
    return <p className="mt-6 text-sm text-ink-3">Connecting to the v2 product API…</p>;
  }
  if (boot.phase === 'error') {
    return (
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">v2 product API unavailable</h3>
        <p className="mt-1 text-sm text-ink-3">
          Could not reach the product API — check the connection / configuration. No data is shown rather
          than placeholder values. ({boot.message})
        </p>
      </Card>
    );
  }

  return (
    <div>
      {/* Project */}
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">Project (this tenant)</h3>
        {projectExists ? (
          <p className="mt-1 text-sm text-ink-3">Project ready for this tenant. Create or select a job below.</p>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-ink-3">No project exists for this tenant yet.</p>
            <button
              onClick={onCreateProject}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
              Create project
            </button>
          </div>
        )}
      </Card>

      {/* Jobs */}
      <Card className="mt-4">
        <h3 className="font-semibold text-ink">Jobs</h3>
        {jobs.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No jobs yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.jobId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-sm text-ink">{j.jobId}</span>
                  <span className="ml-2 font-mono text-xs text-ink-3">
                    {j.status} · {j.uploadCount} file(s)
                  </span>
                </div>
                <button
                  onClick={() => onSelectJob(j.jobId)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    selectedJobId === j.jobId
                      ? 'border-accent text-accent-strong'
                      : 'border-line text-ink-2 hover:text-ink'
                  }`}>
                  {selectedJobId === j.jobId ? 'Selected' : 'Select'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input
            value={newJobId}
            onChange={(e) => setNewJobId(e.target.value)}
            placeholder="job id (a-z 0-9 _ -)"
            className="rounded-md border border-line px-2.5 py-1.5 font-mono text-sm text-ink"
          />
          <button
            onClick={onCreateJob}
            disabled={busy || !projectExists || newJobId.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            Create job
          </button>
          {!projectExists && <span className="text-xs text-ink-3">Create the project first.</span>}
        </div>
      </Card>

      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}

      {/* Selected job: upload + inventory */}
      {selectedJobId && detail && (
        <>
          <ProductUploadPanel
            jobId={selectedJobId}
            onUploaded={() => {
              void refreshDetail(selectedJobId);
              void loadProjectAndJobs();
            }}
          />
          <ProductUploadInventory job={detail} />
          <ProductReviewedBoreLogGate
            jobId={selectedJobId}
            boreLogUploads={detail.uploads
              .filter((u) => u.kind === 'BORE_LOG')
              .map((u) => ({ uploadId: u.uploadId, filename: u.filename }))}
          />
          {/* Exactly ONE redline path per job (kept mutually exclusive so no card is shown that does not
              apply, and Hector never has to be told to "ignore this card"):
              · recognized corpus  -> the AUTOMATIC deterministic redline handoff (runs the EXISTING engine
                render, no manual clicks);
              · otherwise          -> the Phase 6 engine REVIEW acceptance lane (the engine generates a
                source-supported REVIEW candidate from this job's plan + reviewed bore-log; the owner accepts
                or rejects it — no hand-drawing; REVIEW is first-class, never AUTO).
              `refreshKey` re-fetches the card when uploads change. `recognized === null` = check in flight. */}
          {recognized === true && (
            <ProductRecognizedCorpusHandoff jobId={selectedJobId} refreshKey={uploadsKey} />
          )}
          {recognized === false && (
            <ProductReviewCandidates jobId={selectedJobId} refreshKey={uploadsKey} />
          )}

          {/* INTERNAL DEV PROOF ONLY. Hidden unless NEXT_PUBLIC_TL2_INTERNAL_PROOF=1, and collapsed by
              default. This manual source-anchor harness exists solely to exercise the renderer/bundle path;
              it must NEVER be presented as how a customer/owner gets a redline. */}
          {internalProofEnabled() && detail.uploads.some((u) => u.kind === 'PLAN_PDF') && (
            <details className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-amber-800">
                Internal developer proof tool — not customer workflow
              </summary>
              <p className="mt-1 text-xs text-amber-700">
                Draws a dashed redline from hand-clicked control points to exercise the renderer/bundle path
                only. Not the product flow — the customer workflow ends at the honest handoff blocker above.
              </p>
              <ProductSourceAnchorCapture
                jobId={selectedJobId}
                planUploads={detail.uploads
                  .filter((u) => u.kind === 'PLAN_PDF')
                  .map((u) => ({ uploadId: u.uploadId, filename: u.filename }))}
              />
            </details>
          )}
        </>
      )}
    </div>
  );
}
