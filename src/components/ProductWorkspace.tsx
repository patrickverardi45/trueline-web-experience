'use client';

// Guided 6-step project WORKSPACE. The body shows ONLY the active step (never one long scrolling page): a
// status rail (done / current / upcoming / locked) sits on top, and one step renders below it —
//   Project → Upload package → Route map → Bore logs → Redline proof → Export.
// The active step comes from ?step= (workspaceSections is gone). Future steps stay LOCKED until they are
// relevant (Upload unlocks once a project exists; Bore logs once a bore log is uploaded; Redline once the
// bore log is engine-ready or the project is recognized; Export once a redline is placed). One owner per
// action: Redline proof=Generate/Accept/Correct, Export=Assemble/Download/Print. Composed entirely from
// existing reads — no new backend capability, no fakes.

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Lock, Printer, XCircle } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { ProductOperatorPricing } from '@/components/ProductOperatorPricing';
import { ProductUploadPanel } from '@/components/ProductUploadPanel';
import { ProductUploadInventory } from '@/components/ProductUploadInventory';
import { ProductReviewedBoreLogGate } from '@/components/ProductReviewedBoreLogGate';
import { ProductReviewCandidates } from '@/components/ProductReviewCandidates';
import { ProductWorkflowPanel } from '@/components/ProductWorkflowPanel';
import { ProductBoreStepThrough } from '@/components/ProductBoreStepThrough';
import { ProductRouteMap } from '@/components/ProductRouteMap';
import {
  STEPPER_STEPS, coerceStep, stepHref, stepIndex, type StepKey, type StepStatus,
} from '@/lib/stepperSteps';
import { jobTitle } from '@/lib/jobLabels';
import { internalToolingEnabled } from '@/lib/internalMode';
import {
  assembleCloseoutPackage,
  downloadCloseoutPdfBlob,
  downloadExportBundleBlob,
  downloadRouteKmzBlob,
  fetchCloseoutStatus,
  fetchExportStatus,
  fetchJobArtifactBlob,
  fetchJobArtifacts,
  fetchRecognizedCorpusHandoff,
  fetchReviewQueue,
  fetchReviewedBoreLog,
  listReviewCandidates,
  type JobArtifactRef,
  type ProductJobDetail,
  type ProductJobSummary,
  type ReviewedBoreLogView,
} from '@/lib/api/productWrites';

const WORKSPACE_RBL_ID = 'rbl-main';

const FRIENDLY_STAGE: Record<string, string> = {
  CREATED: 'New project', UPLOADING: 'Uploading files', EXTRACTING: 'Processing',
  AWAITING_REVIEW: 'Awaiting review', PLACING: 'Placing redline', PLACED: 'Redline placed',
  CLOSEOUT_REVIEW: 'Closeout review', CLOSED: 'Closed', FAILED: 'Failed',
};
function friendlyStage(s: string): string {
  return FRIENDLY_STAGE[s] ?? s;
}
function friendlyCloseout(s: string | null): string {
  if (!s) return 'not assembled';
  return s.replace(/_/g, ' ').toLowerCase();
}

const UPLOAD_KINDS: { kind: string; label: string; required: boolean; use: string }[] = [
  { kind: 'PLAN_PDF', label: 'Plan PDF', required: true, use: 'The construction plan.' },
  { kind: 'BORE_LOG', label: 'Bore log', required: true, use: 'The bore stations.' },
  { kind: 'GIS_ROUTE', label: 'KMZ / KML route', required: false, use: 'Route context for the map.' },
  { kind: 'PHOTO', label: 'Photos', required: false, use: 'Stored for reference only — they don’t affect redlines yet.' },
];

// Plain-English copy for the closeout warning/blocker codes (raw code kept behind Diagnostics).
const CLOSEOUT_CODE_COPY: Record<string, string> = {
  KMZ_EXPORT_BLOCKED:
    'A geo-referenced KMZ is not produced — the redline is pixel-only on the plan (no map coordinates), and the system will not fake them.',
  REVIEW_NOT_ACCEPTED: 'The redline candidate still needs to be accepted (or corrected) in the Redline proof step.',
  REVIEW_WAS_REJECTED: 'The redline candidate was rejected — correct it in the Redline proof step before assembling.',
};
function closeoutCodeCopy(code: string): string {
  return CLOSEOUT_CODE_COPY[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

// Product-friendly download filename slug from the readable project title (never the raw internal id).
function downloadSlug(jobId: string): string {
  return jobTitle(jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || jobId;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function scrollToId(id: string) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface WorkspaceProps {
  busy: boolean;
  jobs: readonly ProductJobSummary[];
  selectedJobId: string | null;
  detail: ProductJobDetail | null;
  actionError: string | null;
  uploadsKey: string;
  onStartProject: (name: string) => Promise<void> | void;
  refreshDetail: (jobId: string) => void;
  loadProjectAndJobs: () => void;
}

export function ProductWorkspace(props: WorkspaceProps) {
  const { busy, jobs, selectedJobId, detail, actionError, uploadsKey,
          onStartProject, refreshDetail, loadProjectAndJobs } = props;
  const router = useRouter();
  const stepParam = useSearchParams().get('step');

  // Any in-step action (upload / extract / generate / accept / correct / assemble) bumps this so the gate
  // read + every read section re-reads the now-current state and the rail re-evaluates which steps unlock.
  const [flowVersion, setFlowVersion] = useState(0);
  const refreshKey = `${uploadsKey}:${flowVersion}`;
  const bump = useCallback(() => setFlowVersion((v) => v + 1), []);
  const onChanged = useCallback(() => {
    if (selectedJobId) void refreshDetail(selectedJobId);
    setFlowVersion((v) => v + 1);
  }, [selectedJobId, refreshDetail]);

  // Refresh the job detail on JOB change.
  useEffect(() => {
    if (selectedJobId) void refreshDetail(selectedJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  const present = new Set((detail?.uploads ?? []).map((u) => u.kind));
  const hasPlan = present.has('PLAN_PDF');
  const hasBore = present.has('BORE_LOG');
  const hasRoute = present.has('GIS_ROUTE');
  const placed = !!detail?.slots.redlineManifest;
  const assembled = !!detail?.slots.exportPackage;
  const hasJob = !!selectedJobId && !!detail;

  // Engine-readiness + recognized gate (drives the Redline-proof unlock). Re-read on every refreshKey bump so
  // confirming the bore log (engine_ready -> true) unlocks Redline proof without a manual reload.
  const [gate, setGate] = useState<{ engineReady: boolean | null; recognized: boolean | null }>({ engineReady: null, recognized: null });
  const gateLoad = useCallback(async () => {
    if (!selectedJobId || !hasBore) { setGate({ engineReady: null, recognized: null }); return; }
    let engineReady: boolean | null = null;
    let recognized: boolean | null = null;
    try { engineReady = (await fetchReviewQueue(selectedJobId, WORKSPACE_RBL_ID)).engineReady; } catch { engineReady = null; }
    if (hasPlan) { try { recognized = (await fetchRecognizedCorpusHandoff(selectedJobId)).runnable; } catch { recognized = null; } }
    setGate({ engineReady, recognized });
  }, [selectedJobId, hasBore, hasPlan]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void gateLoad();
  }, [gateLoad, refreshKey]);

  const boreLogUploads = (detail?.uploads ?? [])
    .filter((u) => u.kind === 'BORE_LOG')
    .map((u) => ({ uploadId: u.uploadId, filename: u.filename }));
  const planUploads = (detail?.uploads ?? [])
    .filter((u) => u.kind === 'PLAN_PDF')
    .map((u) => ({ uploadId: u.uploadId, filename: u.filename }));

  // ---- Step gating ----------------------------------------------------------------------------------- //
  const unlocked: Record<StepKey, boolean> = {
    project: true,
    upload: hasJob,
    map: hasJob,
    borelogs: hasJob && hasBore,
    redline: hasJob && (gate.engineReady === true || gate.recognized === true || placed),
    export: hasJob && placed,
  };
  const done: Record<StepKey, boolean> = {
    project: hasJob,
    upload: hasPlan && hasBore,
    map: hasRoute,
    borelogs: gate.engineReady === true || placed,
    redline: placed,
    export: assembled,
  };
  const lockReason: Record<StepKey, string> = {
    project: '',
    upload: 'Create a project first.',
    map: 'Create a project first.',
    borelogs: 'Upload a bore log first.',
    redline: 'Confirm the bore log first.',
    export: 'Place a redline first.',
  };

  function firstActionable(): StepKey {
    for (const s of STEPPER_STEPS) if (unlocked[s.key] && !done[s.key]) return s.key;
    return 'export';
  }
  function lastUnlocked(): StepKey {
    let k: StepKey = 'project';
    for (const s of STEPPER_STEPS) if (unlocked[s.key]) k = s.key;
    return k;
  }
  const requested = stepParam ? coerceStep(stepParam) : null;
  let active: StepKey = requested ?? (hasJob ? firstActionable() : 'project');
  if (!unlocked[active]) active = lastUnlocked();

  const statuses = Object.fromEntries(
    STEPPER_STEPS.map((s) => [s.key, s.key === active ? 'current' : done[s.key] ? 'done' : !unlocked[s.key] ? 'locked' : 'upcoming']),
  ) as Record<StepKey, StepStatus>;

  const goto = useCallback((key: StepKey) => {
    router.push(stepHref(selectedJobId, key));
  }, [router, selectedJobId]);

  const idx = stepIndex(active);
  const def = STEPPER_STEPS[idx];
  const nextKey: StepKey | null = idx < STEPPER_STEPS.length - 1 ? STEPPER_STEPS[idx + 1].key : null;
  const prevKey: StepKey | null = idx > 0 ? STEPPER_STEPS[idx - 1].key : null;

  function renderActive() {
    if (active === 'project' || !hasJob) {
      return (
        <ProjectStep
          jobs={jobs}
          selectedJobId={selectedJobId}
          detail={detail}
          busy={busy}
          actionError={actionError}
          onStartProject={onStartProject}
          onOpenJob={(id) => router.push(stepHref(id, 'project'))}
          onContinue={() => goto(firstActionable())}
        />
      );
    }
    const sid = selectedJobId as string;
    const det = detail as ProductJobDetail;
    switch (active) {
      case 'upload':
        return (
          <div className="space-y-3">
            <PackageReadiness jobId={sid} detail={det} refreshKey={refreshKey} />
            <UploadsCards detail={det} />
            <ProductUploadPanel
              jobId={sid}
              onUploaded={() => { void refreshDetail(sid); void loadProjectAndJobs(); bump(); }}
            />
            {internalToolingEnabled() && (
              <details className="rounded-lg border border-line bg-paper px-3 py-2">
                <summary className="cursor-pointer text-xs text-ink-3">Technical details — stored file inventory (internal)</summary>
                <div className="mt-1"><ProductUploadInventory job={det} /></div>
              </details>
            )}
          </div>
        );
      case 'map':
        return <ProductRouteMap jobId={sid} refreshKey={refreshKey} />;
      case 'borelogs':
        return <ProductReviewedBoreLogGate jobId={sid} boreLogUploads={boreLogUploads} onChanged={onChanged} />;
      case 'redline':
        return (
          <div className="space-y-4">
            <ProductWorkflowPanel
              jobId={sid}
              refreshKey={refreshKey}
              placed={placed}
              onChanged={onChanged}
              onGoToReview={() => scrollToId('redline-review')}
              onGoToCloseout={() => goto('export')}
            />
            {/* Multi-bore recognized package: step through each bore log's redline on its plan sheet.
                Renders nothing until a redline is placed, or for a single-REVIEW / abstain job. */}
            <ProductBoreStepThrough jobId={sid} refreshKey={refreshKey} placed={placed} />
            <div id="redline-review">
              <ProductReviewCandidates
                jobId={sid}
                refreshKey={refreshKey}
                planUploads={planUploads}
                placed={placed}
                hideGenerate
                allowCustomerCorrection
                onChanged={onChanged}
              />
            </div>
          </div>
        );
      case 'export':
        return (
          <div className="space-y-4">
            <CloseoutReviewSection
              jobId={sid}
              detail={det}
              refreshKey={refreshKey}
              onAssembled={onChanged}
              onGoToReview={() => goto('redline')}
              onGoToExports={() => scrollToId('export-downloads')}
            />
            <ProductOperatorPricing jobId={sid} />
            <div id="export-downloads">
              <ExportsSection jobId={sid} refreshKey={refreshKey} ready={det.slots.exportPackage} />
            </div>
            <RouteKmzCard jobId={sid} hasRoute={hasRoute} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <StepperRail statuses={statuses} onSelect={goto} lockReason={lockReason} />

      {active === 'project' ? (
        renderActive()
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">{def.label}</h2>
            <p className="mt-0.5 text-sm text-ink-3">{def.short}</p>
          </div>
          {renderActive()}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            {prevKey ? (
              <button
                onClick={() => goto(prevKey)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink">
                <ArrowLeft className="size-4" /> Back
              </button>
            ) : <span />}
            {nextKey ? (
              unlocked[nextKey] ? (
                <button
                  onClick={() => goto(nextKey)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
                  Continue <ArrowRight className="size-4" />
                </button>
              ) : (
                <span className="text-xs text-ink-3">{lockReason[nextKey]}</span>
              )
            ) : <span />}
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Step rail — the always-visible progress indicator: done / current / upcoming / locked. Unlocked steps are
// clickable; locked steps show why (title attr) and are not clickable.
// --------------------------------------------------------------------------- //
function railBtn(st: StepStatus): string {
  const base = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors';
  if (st === 'current') return `${base} bg-accent-soft ring-1 ring-accent`;
  if (st === 'locked') return `${base} cursor-not-allowed opacity-60`;
  return `${base} hover:bg-paper`;
}
function railDot(st: StepStatus): string {
  const base = 'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold';
  if (st === 'done') return `${base} bg-emerald-600 text-white`;
  if (st === 'current') return `${base} bg-accent text-white`;
  if (st === 'locked') return `${base} bg-line text-ink-3`;
  return `${base} border border-line text-ink-3`;
}

function StepperRail({ statuses, onSelect, lockReason }: {
  statuses: Record<StepKey, StepStatus>;
  onSelect: (key: StepKey) => void;
  lockReason: Record<StepKey, string>;
}) {
  return (
    <Card className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-1">
        {STEPPER_STEPS.map((s, i) => {
          const st = statuses[s.key];
          const clickable = st !== 'locked';
          return (
            <li key={s.key} className="flex items-center">
              <button
                type="button"
                onClick={() => clickable && onSelect(s.key)}
                disabled={!clickable}
                title={st === 'locked' ? lockReason[s.key] : undefined}
                aria-current={st === 'current' ? 'step' : undefined}
                className={railBtn(st)}>
                <span className={railDot(st)}>
                  {st === 'done' ? <Check className="size-4" /> : st === 'locked' ? <Lock className="size-3.5" /> : i + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-tight text-ink">{s.label}</span>
                  <span className="block text-[11px] leading-tight text-ink-3">{s.short}</span>
                </span>
              </button>
              {i < STEPPER_STEPS.length - 1 && (
                <span className={`mx-1 h-px w-5 shrink-0 ${statuses[s.key] === 'done' ? 'bg-emerald-400' : 'bg-line'}`} />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Step 1 — Project. Simple new-customer entry: type a name, we silently initialize the workspace and create
// the project (no "Set up workspace", no slug, no disabled button). Existing projects are listed to resume.
// --------------------------------------------------------------------------- //
function ProjectStep({ jobs, selectedJobId, detail, busy, actionError, onStartProject, onOpenJob, onContinue }: {
  jobs: readonly ProductJobSummary[];
  selectedJobId: string | null;
  detail: ProductJobDetail | null;
  busy: boolean;
  actionError: string | null;
  onStartProject: (name: string) => Promise<void> | void;
  onOpenJob: (jobId: string) => void;
  onContinue: () => void;
}) {
  const [name, setName] = useState('');
  const selected = selectedJobId && detail ? { jobId: selectedJobId, detail } : null;

  return (
    <div className="space-y-4">
      {/* Selected project overview + continue. */}
      {selected && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">{jobTitle(selected.jobId)}</h2>
              <p className="mt-1 text-sm text-ink-3">
                {selected.detail.uploads.length} file(s) uploaded ·{' '}
                {UPLOAD_KINDS.filter((k) => selected.detail.uploads.some((u) => u.kind === k.kind)).map((k) => k.label).join(', ') || 'no files yet'}
              </p>
            </div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
              {friendlyStage(selected.detail.status)}
            </span>
          </div>
          <button
            onClick={onContinue}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
            Continue <ArrowRight className="size-4" />
          </button>
        </Card>
      )}

      {/* Resume an existing project. */}
      {jobs.length > 0 && (
        <Card>
          <h3 className="font-semibold text-ink">Your projects</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {jobs.map((j) => (
              <li key={j.jobId}>
                <button
                  onClick={() => onOpenJob(j.jobId)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    selectedJobId === j.jobId ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50'
                  }`}>
                  <span className="block text-sm font-medium text-ink">{jobTitle(j.jobId)}</span>
                  <span className="block text-xs text-ink-3">{friendlyStage(j.status)} · {j.uploadCount} file(s)</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Create a project — friendly name only; the workspace auto-initializes behind the scenes. */}
      <Card>
        <h3 className="font-semibold text-ink">{jobs.length > 0 ? 'Start another project' : 'Start a new project'}</h3>
        <p className="mt-1 text-sm text-ink-3">
          Give your project a name. We’ll set everything up — then you upload your files.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void onStartProject(name); }}
            placeholder="e.g. Main Street relocation"
            className="w-72 max-w-full rounded-md border border-line px-3 py-2 text-sm text-ink"
          />
          <button
            onClick={() => void onStartProject(name)}
            disabled={busy || name.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
        {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Package readiness — one honest verdict composed from existing reads: required files present, project
// recognized (sha256 → automatic), or bore-log reviewed (engine_ready). Never overstated.
// --------------------------------------------------------------------------- //
function PackageReadiness({ jobId, detail, refreshKey }: {
  jobId: string; detail: ProductJobDetail; refreshKey?: string;
}) {
  const present = new Set(detail.uploads.map((u) => u.kind));
  const hasPlan = present.has('PLAN_PDF');
  const hasBore = present.has('BORE_LOG');
  const [recognized, setRecognized] = useState<boolean | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    let rec: boolean | null = null;
    let er: boolean | null = null;
    if (hasPlan && hasBore) {
      try { rec = (await fetchRecognizedCorpusHandoff(jobId)).runnable; } catch { rec = null; }
      try { er = (await fetchReviewQueue(jobId, WORKSPACE_RBL_ID)).engineReady; } catch { er = null; }
    }
    setRecognized(rec);
    setEngineReady(er);
  }, [jobId, hasPlan, hasBore]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  // Honest tri-state verdict (no overstatement — "ready" only when truly placeable).
  let tone: 'ready' | 'pending' | 'missing';
  let title: string;
  let detailLine: string;
  if (!hasPlan || !hasBore) {
    tone = 'missing';
    const missing = [!hasPlan ? 'plan PDF' : null, !hasBore ? 'bore log' : null].filter(Boolean).join(' and ');
    title = `Missing required file: ${missing}`;
    detailLine = 'Upload the required files below to enable redline placement.';
  } else if (recognized === true) {
    tone = 'ready';
    title = 'Recognized project — ready to process';
    detailLine = 'This package matches a proven project; the engine redline can be placed automatically in the Redline proof step.';
  } else if (engineReady === true) {
    tone = 'ready';
    title = 'Ready to process';
    detailLine = 'The bore log is reviewed. Generate the redline candidate in the Redline proof step.';
  } else {
    tone = 'pending';
    title = 'Required files present — one step left';
    detailLine = 'Review the bore log in the Bore logs step to enable redline placement.';
  }
  const styles = tone === 'ready' ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50';

  return (
    <div className={`rounded-lg border px-4 py-3 ${styles}`}>
      <div className="flex items-center gap-2">
        {tone === 'ready'
          ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
          : <span className="mx-1 size-2.5 shrink-0 rounded-full bg-amber-500" />}
        <p className="font-semibold text-ink">{title}</p>
      </div>
      <p className="mt-1 text-sm text-ink-2">{detailLine}</p>
      {recognized === true && (
        <p className="mt-1.5 text-xs font-medium text-emerald-700">✓ Recognized project</p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Project files — clean cards: uploaded/missing (with count + filenames), what it's for, next action.
// --------------------------------------------------------------------------- //
function UploadsCards({ detail }: { detail: ProductJobDetail }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {UPLOAD_KINDS.map((k) => {
        const files = detail.uploads.filter((u) => u.kind === k.kind);
        const has = files.length > 0;
        return (
          <Card key={k.kind} className={has ? '' : 'border-dashed'}>
            <div className="flex items-start gap-2">
              {has ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-ink-3" />}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-ink">{k.label}</h4>
                  {has ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      {files.length === 1 ? 'Uploaded' : `${files.length} uploaded`}
                    </span>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${k.required ? 'bg-amber-100 text-amber-800' : 'bg-line text-ink-3'}`}>
                      {k.required ? 'Required — missing' : 'Optional'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-3">{k.use}</p>
                {has ? (
                  <ul className="mt-1 space-y-0.5">
                    {files.map((u) => (
                      <li key={u.uploadId} className="truncate text-xs text-ink-2" title={u.filename}>· {u.filename}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-ink-2">
                    {k.required ? 'Add this file below to enable redline placement.' : 'Add below (optional).'}
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Google Earth route export (Export step) — re-serves the operator's uploaded design KMZ FAITHFULLY
// (folders / names / descriptions / styles preserved). The redline is pixel-only on the plan (not
// georeferenced), so it is NOT in the KMZ (no invented coordinates).
// --------------------------------------------------------------------------- //
function RouteKmzCard({ jobId, hasRoute }: { jobId: string; hasRoute: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function dl() {
    setBusy(true);
    setError(null);
    try {
      triggerDownload(await downloadRouteKmzBlob(jobId), `route_${downloadSlug(jobId)}.kmz`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'download failed (no usable route uploaded)');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h3 className="font-semibold text-ink">Google Earth route (.kmz)</h3>
      <p className="mt-1 text-sm text-ink-3">
        Open your uploaded design KMZ in Google Earth — your{' '}
        <span className="font-medium">folders, placemark names, descriptions and styles are preserved</span>{' '}
        exactly as you provided them. The redline is pixel-only on the plan (not georeferenced), so it is not
        added to the KMZ — no coordinates are invented.
      </p>
      {hasRoute ? (
        <button
          onClick={() => void dl()}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
          {busy ? 'Preparing…' : 'Download Google Earth route (.kmz)'}
        </button>
      ) : (
        <p className="mt-3 text-sm text-ink-3">No KMZ/KML route uploaded — add one in the Upload package step to enable this.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Closeout review (v1 review-before-print) — composed from existing reads. The SOLE Assemble owner. Wrapped
// in id="closeout-print" so window.print() (in the Export downloads) can scope to just this review.
// --------------------------------------------------------------------------- //
type Img = { path: string; url: string };

function CloseoutReviewSection({ jobId, detail, refreshKey, onAssembled, onGoToReview, onGoToExports }: {
  jobId: string; detail: ProductJobDetail; refreshKey?: string;
  onAssembled: () => void; onGoToReview: () => void; onGoToExports: () => void;
}) {
  const placed = detail.slots.redlineManifest;
  const assembled = detail.slots.exportPackage;
  const [rbl, setRbl] = useState<ReviewedBoreLogView | null>(null);
  const [images, setImages] = useState<readonly Img[]>([]);
  const [closeoutStatus, setCloseoutStatus] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [blockers, setBlockers] = useState<readonly string[]>([]);
  const [included, setIncluded] = useState<readonly string[]>([]);
  const [omitted, setOmitted] = useState<readonly string[]>([]);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Clear any stale assemble error: when this section re-reads (e.g. after the user accepts/corrects the
    // candidate in Redline proof and the refresh bus fires), a prior "needs to be accepted" block must not linger.
    setError(null);
    try { setRbl(await fetchReviewedBoreLog(jobId, WORKSPACE_RBL_ID)); } catch { setRbl(null); }
    try { const cs = await listReviewCandidates(jobId); setReviewStatus(cs.length ? (cs[0].status ?? null) : null); } catch { setReviewStatus(null); }
    if (detail.slots.artifactBundle) {
      try {
        const refs: readonly JobArtifactRef[] = await fetchJobArtifacts(jobId);
        const blobs = await Promise.all(refs.map((r) => fetchJobArtifactBlob(jobId, r.path)));
        setImages(refs.map((r, i) => ({ path: r.path, url: URL.createObjectURL(blobs[i]) })));
      } catch { setImages([]); }
    } else setImages([]);
    if (assembled) {
      try { const c = await fetchCloseoutStatus(jobId); setCloseoutStatus(c.status); setWarnings(c.warningCodes); setBlockers(c.hardBlockerCodes); } catch { setCloseoutStatus(null); }
      try { const e = await fetchExportStatus(jobId); setIncluded(e.includedSections); setOmitted(e.omittedSections); } catch { /* not assembled */ }
    } else { setCloseoutStatus(null); setWarnings([]); setBlockers([]); setIncluded([]); setOmitted([]); }
  }, [jobId, assembled, detail.slots.artifactBundle]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { for (const im of images) URL.revokeObjectURL(im.url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  async function onAssemble() {
    setBusy(true);
    setError(null);
    try {
      const result = await assembleCloseoutPackage(jobId);
      if (result.assembled) onAssembled();
      else setError(closeoutCodeCopy(result.blocker ?? ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to assemble the closeout package');
    } finally {
      setBusy(false);
    }
  }

  if (!placed) {
    return (
      <Card>
        <h3 className="font-semibold text-ink">Closeout review</h3>
        <p className="mt-1 text-sm text-ink-3">
          No redline is placed yet. Place one in the <span className="font-semibold">Redline proof</span> step
          (and accept or correct it there), then assemble and review the closeout package here.
        </p>
      </Card>
    );
  }

  const present = new Set(detail.uploads.map((u) => u.kind));
  const redlineSummary = reviewStatus === 'REVIEW_ACCEPTED' ? 'Accepted REVIEW redline'
    : reviewStatus === 'REVIEW_SUPERSEDED' ? 'Human-corrected REVIEW redline'
    : reviewStatus === 'REVIEW_CANDIDATE' ? 'REVIEW candidate — not yet accepted'
    : reviewStatus === 'REVIEW_REJECTED' ? 'Rejected — needs correction'
    : 'Placed redline';

  // Positive completeness checklist — every row derived from a real server value (no fabricated ✓). A placed
  // redline with no pending REVIEW decision (recognized-automatic, or human-marked on an abstained job) counts
  // as reviewed; we do NOT claim "automatic — recognized" for a redline the human marked themselves.
  const reviewedOk = reviewStatus === 'REVIEW_ACCEPTED' || reviewStatus === 'REVIEW_SUPERSEDED'
    || (placed && (reviewStatus === null || reviewStatus === 'ABSTAINED'));
  const reviewLabel = reviewStatus === 'REVIEW_REJECTED' ? 'Placement rejected — correct it in Redline proof'
    : reviewStatus === 'REVIEW_CANDIDATE' ? 'Placement awaiting your review'
    : reviewStatus === 'REVIEW_SUPERSEDED' ? 'Placement reviewed (human-corrected)'
    : reviewStatus === 'REVIEW_ACCEPTED' ? 'Placement reviewed (accepted)'
    : 'Placement reviewed';
  const boreReviewed = (rbl?.rows.length ?? 0) > 0 && (rbl?.rows.every((r) => r.reviewStatus === 'CONFIRMED') ?? false);
  const kmzBlocked = warnings.includes('KMZ_EXPORT_BLOCKED');

  return (
    <div id="closeout-print" className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-ink">Closeout review</h3>
          {assembled
            ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Assembled — {friendlyCloseout(closeoutStatus)}</span>
            : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Not assembled</span>}
        </div>
        <p className="mt-1 text-sm text-ink-3">Review everything below before downloading or printing the closeout package.</p>

        {!assembled && (
          <div className="mt-3">
            <button onClick={onAssemble} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
              {busy ? 'Assembling…' : 'Assemble closeout package'}
            </button>
            {error && (
              <p className="mt-2 text-sm text-red-600">
                {error}{' '}
                {(error.includes('accept') || error.includes('Redline')) && (
                  <button onClick={onGoToReview} className="font-semibold underline">Go to Redline proof</button>
                )}
              </p>
            )}
          </div>
        )}
        {assembled && (
          <p className="mt-3 text-sm text-ink-2">
            The package is assembled. <button onClick={onGoToExports} className="font-semibold text-accent-strong hover:underline">Download or print it below ↓</button>
          </p>
        )}
      </Card>

      {/* Job summary + files */}
      <Card>
        <h4 className="font-medium text-ink">Project summary</h4>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <Field label="Project" value={jobTitle(jobId)} />
          <Field label="Stage" value={friendlyStage(detail.status)} />
          <Field label="Redline" value={redlineSummary} />
        </dl>
        <h4 className="mt-4 font-medium text-ink">Uploaded files</h4>
        <ul className="mt-2 space-y-1 text-sm">
          {/* PHOTO is intentionally excluded here: field photos are stored with the project but are NOT yet
              embedded in the closeout deliverable, so listing them in the package summary would promise
              evidence the PDF/ZIP omit. (Photos remain visible in the Upload package step.) */}
          {UPLOAD_KINDS.filter((k) => k.kind !== 'PHOTO').map((k) => (
            <li key={k.kind} className="flex items-center gap-2">
              {present.has(k.kind) ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-ink-3" />}
              <span className={present.has(k.kind) ? 'text-ink' : 'text-ink-3'}>{k.label}</span>
              {detail.uploads.filter((u) => u.kind === k.kind).map((u) => (
                <span key={u.uploadId} className="text-xs text-ink-3">· {u.filename}</span>
              ))}
            </li>
          ))}
        </ul>
      </Card>

      {/* Final review checklist — positive affirmation (v1-style), every row a real server value. */}
      <Card>
        <h4 className="font-medium text-ink">Final review checklist</h4>
        <ul className="mt-2 space-y-1.5 text-sm">
          <ChecklistRow state={placed ? 'ok' : 'pending'} label={placed ? 'Redline placed' : 'Redline not placed yet'} />
          <ChecklistRow state={reviewedOk ? 'ok' : 'pending'} label={reviewLabel} />
          <ChecklistRow state={boreReviewed ? 'ok' : 'pending'} label={boreReviewed ? 'Bore log reviewed & confirmed' : 'Bore log not fully confirmed'} />
          <ChecklistRow state={assembled ? 'ok' : 'pending'} label={assembled ? 'Closeout package assembled' : 'Closeout package not assembled yet'} />
          <ChecklistRow state="info" label={kmzBlocked ? 'Map export: pixel-only on the plan (no geo-coordinates — not faked)' : 'Map export: route context from the uploaded KMZ/KML'} />
          <ChecklistRow state="info" label="Billing: quantities only (no dollar amounts)" />
        </ul>
      </Card>

      {/* Redline evidence images */}
      {images.length > 0 && (
        <Card>
          <h4 className="font-medium text-ink">Redline evidence</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {images.map((img) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={img.path} src={img.url} alt={`Redline ${img.path}`} className="w-full rounded-lg border border-line bg-white" />
            ))}
          </div>
        </Card>
      )}

      {/* Bore-log rows */}
      <Card>
        <h4 className="font-medium text-ink">Bore-log rows</h4>
        {(rbl?.rows.length ?? 0) === 0 ? (
          <p className="mt-1 text-sm text-ink-3">No reviewed bore-log rows recorded.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th className="py-1.5 pr-3 font-medium">Start → End station</th>
                <th className="py-1.5 font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {rbl?.rows.map((r) => (
                <tr key={r.rowId} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-ink">{r.startStation} → {r.endStation}</td>
                  <td className="py-1.5 text-ink-2">{r.reviewStatus.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Quantities + warnings + package contents (assembled) */}
      <Card>
        <h4 className="font-medium text-ink">Quantities &amp; package</h4>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <Field label="Redline images" value={String(images.length)} />
          <Field label="Reviewed rows" value={String(rbl?.rows.length ?? 0)} />
          <Field label="Billing dollars" value="not shown (quantities only)" />
        </dl>
        <p className="mt-2 text-xs text-ink-3">
          The full itemized deliverable quantities (drawn / total / blocked counts and footage when present)
          and the review disclaimer are in the downloadable closeout PDF.
        </p>

        {assembled && (included.length > 0 || omitted.length > 0) && (
          <div className="mt-3 border-t border-line pt-3 text-sm">
            <p className="font-medium text-ink">Package contents</p>
            {included.length > 0 && <p className="mt-1 text-ink-2">Included: {included.map((s) => s.replace(/_/g, ' ').toLowerCase()).join(', ')}</p>}
            {omitted.length > 0 && <p className="mt-0.5 text-ink-3">Omitted: {omitted.map((s) => s.replace(/_/g, ' ').toLowerCase()).join(', ')}</p>}
          </div>
        )}

        {assembled && (warnings.length > 0 || blockers.length > 0) && (
          <div className="mt-3 border-t border-line pt-3 text-sm">
            <p className="font-medium text-ink">Notes</p>
            <ul className="mt-1 space-y-1">
              {blockers.map((b) => (
                <li key={b} className="text-red-600">{closeoutCodeCopy(b)}</li>
              ))}
              {warnings.map((w) => (
                <li key={w} className="text-ink-3">{closeoutCodeCopy(w)}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-ink-3">
          Generated from your uploaded source evidence — review it before construction or use. Quantities
          only; no dollar amounts.
        </p>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function ChecklistRow({ state, label }: { state: 'ok' | 'pending' | 'info'; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {state === 'ok'
        ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        : <span className={`mx-1 size-2 shrink-0 rounded-full ${state === 'pending' ? 'bg-amber-400' : 'bg-slate-300'}`} />}
      <span className={state === 'ok' ? 'text-ink' : 'text-ink-2'}>{label}</span>
    </li>
  );
}

// --------------------------------------------------------------------------- //
// Export downloads — the SOLE Download owner + Print/Save (window.print of the closeout review).
// --------------------------------------------------------------------------- //
function ExportsSection({ jobId, refreshKey, ready }: { jobId: string; refreshKey?: string; ready: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState<string>('Loading…');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) { setStatus(null); setNote('No closeout package assembled yet. Assemble it in the Closeout review above.'); return; }
    setNote('Loading…');
    try { setStatus((await fetchExportStatus(jobId)).status); setNote(''); }
    catch { setStatus(null); setNote('No closeout package assembled yet. Assemble it in the Closeout review above.'); }
  }, [jobId, ready]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  async function download(kind: 'zip' | 'pdf') {
    setBusy(true);
    setError(null);
    try {
      const slug = downloadSlug(jobId);
      if (kind === 'zip') triggerDownload(await downloadExportBundleBlob(jobId), `closeout_data_${slug}.zip`);
      else triggerDownload(await downloadCloseoutPdfBlob(jobId), `closeout_packet_${slug}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'download failed (assemble the closeout package first)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-ink">Download &amp; print</h3>
      {note && <p className="mt-1 text-sm text-ink-3">{note}</p>}
      {status && <p className="mt-1 text-sm text-ink-2">Closeout package: <span className="font-medium">{ready ? 'ready' : friendlyCloseout(status)}</span></p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void download('pdf')}
          disabled={busy || !ready}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Preparing…' : 'Download closeout PDF'}
        </button>
        <button
          onClick={() => void download('zip')}
          disabled={busy || !ready}
          className="inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
          {busy ? 'Preparing…' : 'Download data package (.zip)'}
        </button>
        <button
          onClick={() => window.print()}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
          <Printer className="size-4" /> Print / save review
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        <span className="font-medium">Download closeout PDF</span> is the official deliverable — the
        server-generated packet with embedded redline evidence and itemized quantities.{' '}
        <span className="font-medium">Data package (.zip)</span> = the redline images + manifest + status files.{' '}
        <span className="font-medium">Print / save</span> is a quick browser snapshot of the on-screen review
        only (thinner than the PDF). No dollar amounts are shown — quantities only.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
