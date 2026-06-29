'use client';

// Projects workspace entry point. `/intake?workspace=1` renders the GUIDED 6-step workflow for the selected
// project (Project → Upload → Route map → Bore logs → Redline proof → Export). The selected project comes
// from ?job= and the active step from ?step=. State is owned here and passed into ProductWorkspace.
// Product-mode only — honest "not configured" / "unavailable" states; never a mock fallback.

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
import { jobAlias, resolveJobId } from '@/lib/jobLabels';
import { coerceStep, stepHref } from '@/lib/stepperSteps';
import { internalToolingEnabled } from '@/lib/internalMode';

type Boot =
  | { phase: 'off' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready' };

// Turn a customer's free-text project name into a backend-safe job id (^[a-z0-9][a-z0-9_-]{0,62}$). The
// customer never sees or types a slug — they type a name ("Main Street relocation") and we derive the id
// ("main-street-relocation") silently; jobTitle() humanizes it back for display.
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

// Keep the derived id unique within the project so two same-named projects don't collide on the backend.
function uniqueJobId(base: string, jobs: readonly ProductJobSummary[]): string {
  const taken = new Set(jobs.map((j) => j.jobId));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 63);
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

export function ProductIntake() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobParam = searchParams.get('job');
  const stepParam = searchParams.get('step');

  const [boot, setBoot] = useState<Boot>(() =>
    productApiEnabled() ? { phase: 'loading' } : { phase: 'off' },
  );
  const [projectExists, setProjectExists] = useState(false);
  const [jobs, setJobs] = useState<ProductJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductJobDetail | null>(null);
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

  // Normalize a raw-slug ?job= to its NEUTRAL alias in the URL so the address bar (and the hydration
  // payload) never carry the internal "demo-*" store slug — even on a directly-typed/bookmarked raw URL.
  // One-time: after the replace, jobParam === alias, so this no-ops (no redirect loop).
  useEffect(() => {
    if (!jobParam) return;
    const realId = resolveJobId(jobParam);
    const alias = jobAlias(realId);
    if (jobParam !== alias) {
      router.replace(stepHref(realId, coerceStep(stepParam)));
    }
  }, [jobParam, stepParam, router]);

  // URL-driven selection: the ?job= value is a NEUTRAL alias (or a real id for a user-created project);
  // resolve it back to the store id before selecting. Reactive to client-side nav.
  useEffect(() => {
    if (boot.phase !== 'ready' || !jobParam) return;
    const realId = resolveJobId(jobParam);
    if (realId === selectedJobId) return;
    if (jobs.some((j) => j.jobId === realId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void onSelectJob(realId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.phase, jobParam, jobs]);

  // Create a project from a friendly name: silently ensure the tenant workspace exists (no "Set up
  // workspace" step), derive the id, create the job, select it, and land on Step 2 (Upload).
  const onStartProject = useCallback(async (displayName: string) => {
    const base = slugify(displayName);
    if (!base) {
      setActionError('Enter a project name to continue.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (!projectExists) await createProductProject('Project');
      const id = uniqueJobId(base, jobs);
      await createProductJob(id);
      await loadProjectAndJobs();
      await onSelectJob(id);
      router.push(stepHref(id, 'upload'));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'failed to create the project');
    } finally {
      setBusy(false);
    }
  }, [projectExists, jobs, loadProjectAndJobs, onSelectJob, router]);

  if (boot.phase === 'off') {
    return (
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">Workspace not connected</h3>
        <p className="mt-1 text-sm text-ink-3">
          This workspace isn’t connected to FieldRoute yet. Contact your administrator to finish setup.
          {internalToolingEnabled() && (
            <span className="ml-1 font-mono text-xs">
              (internal: set NEXT_PUBLIC_TL2_PRODUCT_API=1 + NEXT_PUBLIC_TL2_API_BASE / _TENANT)
            </span>
          )}
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
        <h3 className="font-semibold text-ink">Workspace temporarily unavailable</h3>
        <p className="mt-1 text-sm text-ink-3">
          Couldn’t reach FieldRoute — check your connection and try again. No data is shown rather than
          placeholder values.{internalToolingEnabled() && <span className="ml-1 font-mono text-xs">({boot.message})</span>}
        </p>
      </Card>
    );
  }

  return (
    <ProductWorkspace
      busy={busy}
      jobs={jobs}
      selectedJobId={selectedJobId}
      detail={detail}
      actionError={actionError}
      uploadsKey={uploadsKey}
      onStartProject={onStartProject}
      refreshDetail={refreshDetail}
      loadProjectAndJobs={loadProjectAndJobs}
    />
  );
}
