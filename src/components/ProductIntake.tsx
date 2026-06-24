'use client';

// Product-mode intake with THREE faces, switched by the URL so the guided demo never exposes the raw
// workbench as a clickable path:
//   • /intake                 -> a "Choose a demo workflow" chooser with ONLY the two guided REVIEW
//                                workflows (NO visible link to the internal upload workspace)
//   • /intake?job=<demo job>  -> a MINIMAL guided view: only that demo's one engine redline card
//   • /intake?workspace=1     -> the internal upload workspace, reachable ONLY by typing this URL (no card
//                                links here from the demo UI). STORAGE/INTAKE ONLY — it stores files and
//                                produces NO redline; the strong banner says so.
// Product-mode gated (honest note when off); no mock fallback — connectivity failures show an honest state.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Layers } from 'lucide-react';

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
import { ProductRecognizedCorpusHandoff } from '@/components/ProductRecognizedCorpusHandoff';
import { ProductReviewCandidates } from '@/components/ProductReviewCandidates';
import { ProductWorkspace } from '@/components/ProductWorkspace';

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

export function ProductIntake() {
  // Reactive URL params (consistent SSR/client on this force-dynamic route). These pick the view.
  const searchParams = useSearchParams();
  const jobParam = searchParams.get('job');
  const workspaceMode = searchParams.get('workspace') === '1';
  // Guided view only OUTSIDE the workspace — in workspace mode any ?job= (incl. a demo job that also lives in
  // the store) drives the workspace section workflow, never the guided card.
  const guidedJob = !workspaceMode && jobParam && GUIDED_DEMO_JOBS[jobParam] ? jobParam : null;

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
  // handoff), false = engine REVIEW lane, null = not yet checked. Drives the single guided card.
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

  // Re-evaluate which redline path applies whenever the job/uploads change (used by the guided view).
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
  // changes. Reactive to client-side nav.
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

  // ---- GUIDED demo view: a known demo job -> ONLY its one redline card. ----
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

  // ---- CHOOSER: default /intake. ONLY the two guided REVIEW workflows. No internal-workspace card. ----
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
      </div>
    );
  }

  // ---- INTERNAL WORKSPACE: ?workspace=1 (typed-only; NOT in the public/guided nav). A left-rail SECTION
  //      workflow over the selected job (Job Summary / Uploads / Map / Bore Logs / Redlines / Review /
  //      Closeout / Exports / Billing), reusing the proven Phase 9/10 routes. State is owned here and passed
  //      in so the guided/chooser faces above are untouched. ----
  return (
    <ProductWorkspace
      projectExists={projectExists}
      busy={busy}
      jobs={jobs}
      selectedJobId={selectedJobId}
      detail={detail}
      newJobId={newJobId}
      setNewJobId={setNewJobId}
      actionError={actionError}
      uploadsKey={uploadsKey}
      onCreateProject={onCreateProject}
      onCreateJob={onCreateJob}
      refreshDetail={refreshDetail}
      loadProjectAndJobs={loadProjectAndJobs}
    />
  );
}
