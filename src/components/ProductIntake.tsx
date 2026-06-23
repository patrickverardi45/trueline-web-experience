'use client';

// Product-mode intake with TWO faces, switched by the URL so the GUIDED demo paths stay clean and a viewer
// never sees the raw workbench by default:
//   • /intake                 -> a "Choose a demo workflow" chooser (REVIEW / Cross-sheet / Internal)
//   • /intake?job=<demo job>  -> a MINIMAL guided view: only that demo's one engine redline card
//   • /intake?workspace=1     -> the full Internal upload workspace (job list / uploads / inventory /
//                                reviewed-bore-log gate) — explicitly labeled, NOT the default demo path
// Product-mode gated (honest note when off); no mock fallback — connectivity failures show an honest state.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Layers, Upload } from 'lucide-react';

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

// The known GUIDED demo jobs. A `/intake?job=<id>` that is one of these renders the minimal guided view
// (only the relevant redline card) — never the raw workbench. Generic ids only; no customer/place names.
const GUIDED_DEMO_JOBS: Record<string, { title: string; blurb: string }> = {
  'demo-review-acceptance': {
    title: 'Live REVIEW Acceptance Workflow',
    blurb:
      'The engine generates a source-backed redline candidate from this job’s own plan + reviewed bore-log. Generate it, then accept or reject — no hand-drawing.',
  },
  'demo-cross-sheet-review': {
    title: 'Cross-Sheet REVIEW Workflow',
    blurb:
      'A bore that spans two plan sheets: the engine renders a REVIEW leg on each sheet with honest matchline caveats. Full coverage, still REVIEW — never AUTO.',
  },
  'completed-redline-showcase': {
    title: 'Completed Redline Showcase',
    blurb:
      'A recognized package: the existing deterministic engine render is served as the automatic redline handoff.',
  },
};

function defaultJobId(): string {
  // Browser-only convenience; the backend re-validates the id (^[a-z0-9][a-z0-9_-]{0,62}$).
  return 'job-' + Math.random().toString(36).slice(2, 8);
}

function internalProofEnabled(): boolean {
  // Manual source-anchor capture is an INTERNAL developer proof harness ONLY — never the customer/owner
  // flow. A redline must come from the engine, not from hand-clicked route points. Hidden unless this
  // explicit build-time opt-in is set; default = hidden (and only ever inside the internal workspace).
  return process.env.NEXT_PUBLIC_TL2_INTERNAL_PROOF === '1';
}

export function ProductIntake() {
  // Reactive URL params (consistent SSR/client on this force-dynamic route). These pick the view.
  const searchParams = useSearchParams();
  const jobParam = searchParams.get('job');
  const workspaceMode = searchParams.get('workspace') === '1';
  const guidedJob = jobParam && GUIDED_DEMO_JOBS[jobParam] ? jobParam : null;

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
  // handoff), false = engine REVIEW lane, null = not yet checked.
  const [recognized, setRecognized] = useState<boolean | null>(null);
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
    // setBoot fires only after the awaited fetch resolves (in .then/.catch), not synchronously — the same
    // sanctioned data-fetch-on-mount pattern as the effects below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const onSelectJob = useCallback(async (jobId: string) => {
    setSelectedJobId(jobId);
    setActionError(null);
    try {
      setDetail(await fetchProductJobDetail(jobId));
    } catch (e) {
      setDetail(null);
      setActionError(e instanceof Error ? e.message : 'failed to load job');
    }
  }, []);

  // Re-evaluate which redline path applies whenever the job/uploads change. Failed/!runnable -> REVIEW lane.
  useEffect(() => {
    // Reset to "unknown" so a stale card never lingers; the resolved value comes from the awaited fetch.
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

  // URL-driven selection: select the `?job=` job (a guided demo job, or any job in workspace mode) when it
  // changes. Reactive to client-side nav, so moving between demo cards just works.
  useEffect(() => {
    if (boot.phase !== 'ready' || !jobParam || jobParam === selectedJobId) return;
    if (GUIDED_DEMO_JOBS[jobParam] || jobs.some((j) => j.jobId === jobParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void onSelectJob(jobParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.phase, jobParam, jobs]);

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

  // ---- GUIDED demo view: a known demo job -> ONLY its one redline card. No job list, no uploads, no
  //      inventory, no reviewed-bore-log gate, no create controls, no dev/source-anchor UI. ----
  if (guidedJob) {
    const meta = GUIDED_DEMO_JOBS[guidedJob];
    const ready = selectedJobId === guidedJob && detail !== null;
    return (
      <div className="mt-6">
        <Link href="/intake" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Demo workflows
        </Link>
        <Card className="mt-3">
          <h2 className="text-lg font-semibold text-ink">{meta.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-3">{meta.blurb}</p>
        </Card>
        {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        {!ready ? (
          <p className="mt-4 text-sm text-ink-3">Loading the demo…</p>
        ) : recognized === true ? (
          <ProductRecognizedCorpusHandoff jobId={guidedJob} refreshKey={uploadsKey} />
        ) : recognized === false ? (
          <ProductReviewCandidates jobId={guidedJob} refreshKey={uploadsKey} />
        ) : (
          <p className="mt-4 text-sm text-ink-3">Preparing the workflow…</p>
        )}
      </div>
    );
  }

  // ---- CHOOSER: default /intake. A clean "Choose a demo workflow" screen — NEVER the raw job list. ----
  if (!workspaceMode) {
    return (
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Choose a demo workflow</h2>
        <p className="mt-1 text-sm text-ink-3">
          Each guided workflow runs the real engine on a prepared job. Pick one to begin.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Link href="/intake?job=demo-review-acceptance" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                  <CheckCircle2 className="size-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink group-hover:text-accent-strong">
                    {GUIDED_DEMO_JOBS['demo-review-acceptance'].title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-3">
                    {GUIDED_DEMO_JOBS['demo-review-acceptance'].blurb}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-strong">
                    Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/intake?job=demo-cross-sheet-review" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                  <Layers className="size-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink group-hover:text-accent-strong">
                    {GUIDED_DEMO_JOBS['demo-cross-sheet-review'].title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-3">
                    {GUIDED_DEMO_JOBS['demo-cross-sheet-review'].blurb}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-strong">
                    Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Internal workspace — explicitly NOT part of the guided demo. */}
        <Card className="mt-4 border-dashed">
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-3">
              <Upload className="size-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink">Upload Workspace / Internal Intake</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-3">
                Not part of the guided demo. The raw operator workspace — create jobs, upload plans + bore
                logs, and inspect stored files. Uploads are stored for intake; automatic parsing is not
                enabled in this demo path.
              </p>
              <Link
                href="/intake?workspace=1"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
                Open internal workspace <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ---- INTERNAL WORKSPACE: ?workspace=1. The full raw workbench, explicitly labeled, behind an explicit
  //      route — never the default Hector path. ----
  return (
    <div className="mt-6">
      <Link href="/intake" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Demo workflows
      </Link>
      <Card className="mt-3 border-dashed">
        <h2 className="text-lg font-semibold text-ink">Internal upload workspace</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">
          Not part of the guided demo. Uploads are stored for intake; automatic parsing is not enabled in
          this demo path.
        </p>
      </Card>

      {/* Project */}
      <Card className="mt-4">
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

      {/* Selected job: upload + inventory + gate + the one applicable redline card */}
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
          {/* Exactly ONE redline path per job (recognized -> automatic handoff; otherwise -> engine REVIEW). */}
          {recognized === true && (
            <ProductRecognizedCorpusHandoff jobId={selectedJobId} refreshKey={uploadsKey} />
          )}
          {recognized === false && (
            <ProductReviewCandidates jobId={selectedJobId} refreshKey={uploadsKey} />
          )}

          {/* INTERNAL DEV PROOF ONLY. Hidden unless NEXT_PUBLIC_TL2_INTERNAL_PROOF=1, and collapsed. */}
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
