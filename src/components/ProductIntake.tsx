'use client';

// Projects workspace entry point. `/intake` renders the project list + the selected project's single-page
// workflow (upload → redline → review/correct → closeout → export). The selected project comes from ?job=
// (and ?section= deep-links a section). State is owned here and passed into ProductWorkspace. Product-mode
// only — honest "not configured" / "unavailable" states; never a mock fallback.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { productApiEnabled } from '@/lib/api/liveV2Product';
import {
  createProductJob,
  createProductProject,
  fetchProductJobDetail,
  listProductJobs,
  productProjectExists,
  type ProductJobDetail,
  type ProductJobSummary,
} from '@/lib/api/productWrites';
import { Card } from '@/components/ui/Card';
import { ProductWorkspace } from '@/components/ProductWorkspace';

type Boot =
  | { phase: 'off' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready' };

function defaultProjectId(): string {
  // Browser-only convenience; the backend re-validates the id (^[a-z0-9][a-z0-9_-]{0,62}$).
  return 'project-' + Math.random().toString(36).slice(2, 8);
}

export function ProductIntake() {
  const searchParams = useSearchParams();
  const jobParam = searchParams.get('job');

  const [boot, setBoot] = useState<Boot>(() =>
    productApiEnabled() ? { phase: 'loading' } : { phase: 'off' },
  );
  const [projectExists, setProjectExists] = useState(false);
  const [jobs, setJobs] = useState<ProductJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductJobDetail | null>(null);
  const [newJobId, setNewJobId] = useState<string>(defaultProjectId());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
    // setBoot fires only after the awaited fetch resolves (in .then/.catch), not synchronously.
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
      setActionError(e instanceof Error ? e.message : 'failed to load the project');
    }
  }, []);

  // URL-driven selection: select the ?job= project when it changes. Reactive to client-side nav.
  useEffect(() => {
    if (boot.phase !== 'ready' || !jobParam || jobParam === selectedJobId) return;
    if (jobs.some((j) => j.jobId === jobParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void onSelectJob(jobParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.phase, jobParam, jobs]);

  async function onCreateProject() {
    setBusy(true);
    setActionError(null);
    try {
      await createProductProject('Product project');
      await loadProjectAndJobs();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to set up the workspace');
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
      setNewJobId(defaultProjectId());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to create the project');
    } finally {
      setBusy(false);
    }
  }

  if (boot.phase === 'off') {
    return (
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">Product API not configured</h3>
        <p className="mt-1 text-sm text-ink-3">
          This page operates against the real v2 product API. Set{' '}
          <span className="font-mono">NEXT_PUBLIC_TL2_PRODUCT_API=1</span> plus{' '}
          <span className="font-mono">NEXT_PUBLIC_TL2_API_BASE</span> /{' '}
          <span className="font-mono">NEXT_PUBLIC_TL2_TENANT</span>.
        </p>
      </Card>
    );
  }
  if (boot.phase === 'loading') {
    return <p className="mt-6 text-sm text-ink-3">Connecting to the product API…</p>;
  }
  if (boot.phase === 'error') {
    return (
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">Product API unavailable</h3>
        <p className="mt-1 text-sm text-ink-3">
          Could not reach the product API — check the connection / configuration. No data is shown rather
          than placeholder values. ({boot.message})
        </p>
      </Card>
    );
  }

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
