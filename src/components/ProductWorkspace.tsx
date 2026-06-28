'use client';

// Single-page job WORKSPACE (mirrors v1: one job, one understandable page). All sections render stacked in
// order on ONE scrollable page — Overview (job header) / Project files / Map / Bore logs / Redline / Review &
// correct / Closeout review / Export & print — each as <section id="ws-<key>"> so the left sidebar acts as
// same-page anchors (scroll-spy), NOT separate routes. One owner per action: Redline=Generate, Review=Accept/
// Correct, Closeout=Assemble, Export=Download/Print. Dev plumbing (raw slots/provenance/sha/codes/internal
// statuses) is collapsed behind "Technical details / Diagnostics". Composed entirely from existing reads — no
// new backend capability, no fakes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Printer, XCircle } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { ProductUploadPanel } from '@/components/ProductUploadPanel';
import { ProductUploadInventory } from '@/components/ProductUploadInventory';
import { ProductReviewedBoreLogGate } from '@/components/ProductReviewedBoreLogGate';
import { ProductReviewCandidates } from '@/components/ProductReviewCandidates';
import { ProductWorkflowPanel } from '@/components/ProductWorkflowPanel';
import { ProductBoreStepThrough } from '@/components/ProductBoreStepThrough';
import { ProductRouteMap } from '@/components/ProductRouteMap';
import {
  WORKSPACE_SECTIONS, coerceSection, sectionAnchorId, workspaceHref, type WorkspaceSectionKey,
} from '@/lib/workspaceSections';
import { jobTitle, jobAlias } from '@/lib/jobLabels';
import {
  assembleCloseoutPackage,
  downloadCloseoutPdfBlob,
  downloadExportBundleBlob,
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
// jobTitle (readable product name) + jobAlias (neutral technical reference) come from @/lib/jobLabels so the
// raw "demo-*" store slug is never displayed anywhere — including Diagnostics / Technical details / URLs.

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
  { kind: 'PLAN_PDF', label: 'Plan PDF', required: true, use: 'The construction plan the engine draws the redline on.' },
  { kind: 'BORE_LOG', label: 'Bore log', required: true, use: 'The bore stations the redline is placed against.' },
  { kind: 'GIS_ROUTE', label: 'KMZ / KML route', required: false, use: 'Route context drawn on the Map section.' },
  { kind: 'PHOTO', label: 'Photos', required: false, use: 'Field photos stored with the project.' },
];

// Plain-English copy for the closeout warning/blocker codes (raw code kept behind Diagnostics).
const CLOSEOUT_CODE_COPY: Record<string, string> = {
  KMZ_EXPORT_BLOCKED:
    'A geo-referenced KMZ is not produced — the redline is pixel-only on the plan (no map coordinates), and the system will not fake them.',
  REVIEW_NOT_ACCEPTED: 'The redline candidate still needs to be accepted (or corrected) in the Review section.',
  REVIEW_WAS_REJECTED: 'The redline candidate was rejected — correct it in the Review section before assembling.',
};
function closeoutCodeCopy(code: string): string {
  return CLOSEOUT_CODE_COPY[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

// Product-friendly download filename slug from the readable project title (never the raw internal id), so a
// saved file is e.g. "closeout_packet_uploaded-project-clean-placement.pdf", not the raw store id.
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

function scrollToSection(key: WorkspaceSectionKey) {
  if (typeof document === 'undefined') return;
  document.getElementById(sectionAnchorId(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface WorkspaceProps {
  projectExists: boolean;
  busy: boolean;
  jobs: readonly ProductJobSummary[];
  selectedJobId: string | null;
  detail: ProductJobDetail | null;
  newJobId: string;
  setNewJobId: (v: string) => void;
  actionError: string | null;
  uploadsKey: string;
  onCreateProject: () => void;
  onCreateJob: () => Promise<void> | void;
  refreshDetail: (jobId: string) => void;
  loadProjectAndJobs: () => void;
}

export function ProductWorkspace(props: WorkspaceProps) {
  const { projectExists, busy, jobs, selectedJobId, detail, newJobId, setNewJobId, actionError, uploadsKey,
          onCreateProject, onCreateJob, refreshDetail, loadProjectAndJobs } = props;
  const router = useRouter();
  const sectionParam = useSearchParams().get('section');
  const deepLinkedRef = useRef<string | null>(null);

  // Any in-page action (generate / accept / correct / assemble) bumps this so every read section re-reads the
  // now-current state — the single page stays in sync without separate-page navigation.
  const [flowVersion, setFlowVersion] = useState(0);
  const refreshKey = `${uploadsKey}:${flowVersion}`;
  const onChanged = useCallback(() => {
    if (selectedJobId) void refreshDetail(selectedJobId);
    setFlowVersion((v) => v + 1);
  }, [selectedJobId, refreshDetail]);

  // Refresh the job detail on JOB change (one page now, so no per-section nav refresh).
  useEffect(() => {
    if (selectedJobId) void refreshDetail(selectedJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  // Honor a ?section= deep-link: once the job's sections have mounted, scroll to the requested section (W5 —
  // previously the URL carried ?section= but nothing read it). Once per job+section; 'summary' is the top.
  useEffect(() => {
    if (!selectedJobId || !detail) return;
    const target = coerceSection(sectionParam);
    if (target === 'summary') return;
    const tag = `${selectedJobId}:${target}`;
    if (deepLinkedRef.current === tag) return;
    deepLinkedRef.current = tag;
    const t = window.setTimeout(() => scrollToSection(target), 250);
    return () => window.clearTimeout(t);
  }, [selectedJobId, detail, sectionParam]);

  const boreLogUploads = (detail?.uploads ?? [])
    .filter((u) => u.kind === 'BORE_LOG')
    .map((u) => ({ uploadId: u.uploadId, filename: u.filename }));
  const planUploads = (detail?.uploads ?? [])
    .filter((u) => u.kind === 'PLAN_PDF')
    .map((u) => ({ uploadId: u.uploadId, filename: u.filename }));

  async function onCreate() {
    const id = newJobId.trim();
    if (!id) return;
    await onCreateJob();
    router.push(workspaceHref(id, 'summary'));
  }

  function renderSection(key: WorkspaceSectionKey) {
    if (!detail || !selectedJobId) return null;
    switch (key) {
      case 'summary':
        return <JobHeaderBand jobId={selectedJobId} detail={detail} jobs={jobs} refreshKey={refreshKey} />;
      case 'uploads':
        return (
          <SectionShell n={2} label="Project files">
            <PackageReadiness jobId={selectedJobId} detail={detail} refreshKey={refreshKey} />
            <UploadsCards detail={detail} />
            <ProductUploadPanel
              jobId={selectedJobId}
              onUploaded={() => { void refreshDetail(selectedJobId); void loadProjectAndJobs(); setFlowVersion((v) => v + 1); }}
            />
            <details className="rounded-lg border border-line bg-paper px-3 py-2">
              <summary className="cursor-pointer text-xs text-ink-3">Technical details — stored file inventory</summary>
              <div className="mt-1"><ProductUploadInventory job={detail} /></div>
            </details>
          </SectionShell>
        );
      case 'map':
        return (
          <SectionShell n={3} label="Map / route">
            <ProductRouteMap jobId={selectedJobId} refreshKey={refreshKey} />
          </SectionShell>
        );
      case 'borelogs':
        return (
          <SectionShell n={4} label="Bore log">
            <ProductReviewedBoreLogGate jobId={selectedJobId} boreLogUploads={boreLogUploads} />
          </SectionShell>
        );
      case 'redlines':
        return (
          <SectionShell n={5} label="Redline">
            <ProductWorkflowPanel
              jobId={selectedJobId}
              refreshKey={refreshKey}
              placed={detail.slots.redlineManifest}
              onChanged={onChanged}
              onGoToReview={() => scrollToSection('review')}
              onGoToCloseout={() => scrollToSection('closeout')}
            />
            {/* Multi-bore recognized package: step through each bore log's redline on its plan sheet.
                Renders nothing for a single-REVIEW / abstain job (no recognized bores). */}
            <ProductBoreStepThrough jobId={selectedJobId} refreshKey={refreshKey} />
          </SectionShell>
        );
      case 'review':
        return (
          <SectionShell n={6} label="Review &amp; correct">
            <ProductReviewCandidates
              jobId={selectedJobId}
              refreshKey={refreshKey}
              planUploads={planUploads}
              placed={detail.slots.redlineManifest}
              hideGenerate
              onChanged={onChanged}
            />
          </SectionShell>
        );
      case 'closeout':
        return (
          <SectionShell n={7} label="Closeout review">
            <CloseoutReviewSection
              jobId={selectedJobId}
              detail={detail}
              refreshKey={refreshKey}
              onAssembled={onChanged}
              onGoToReview={() => scrollToSection('review')}
              onGoToExports={() => scrollToSection('exports')}
            />
          </SectionShell>
        );
      case 'exports':
        return (
          <SectionShell n={8} label="Export &amp; print">
            <ExportsSection jobId={selectedJobId} refreshKey={refreshKey} ready={detail.slots.exportPackage} />
          </SectionShell>
        );
      default:
        return null;
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <h2 className="text-lg font-semibold text-ink">Project workspace</h2>
        <p className="mt-1 text-sm text-ink-2">
          One project, one page: upload files, see the route and bore logs, generate the redline, review or
          correct the placement, then review and download the closeout package. Redlines come from the real
          engine — nothing is invented, and an uncertain placement is flagged for your review rather than guessed.
        </p>
      </Card>

      {!projectExists && (
        <Card>
          <h3 className="font-semibold text-ink">First-time setup</h3>
          <p className="mt-1 text-sm text-ink-3">
            This workspace hasn’t been initialized yet. Set it up once, then create your first project below.
          </p>
          <button
            onClick={onCreateProject}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            Set up workspace
          </button>
        </Card>
      )}

      {/* Job picker — pick or create the project to work on (stays above the page flow). */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-ink">Project</h3>
          {jobs.length === 0 ? (
            <span className="text-sm text-ink-3">No projects yet — create one.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {jobs.map((j) => (
                <button
                  key={j.jobId}
                  onClick={() => router.push(workspaceHref(j.jobId, 'summary'))}
                  className={`rounded-md border px-2.5 py-1 text-left ${
                    selectedJobId === j.jobId
                      ? 'border-accent bg-accent-soft text-accent-strong'
                      : 'border-line text-ink-2 hover:text-ink'
                  }`}>
                  <span className="block text-xs font-medium">{jobTitle(j.jobId)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <input
              value={newJobId}
              onChange={(e) => setNewJobId(e.target.value)}
              placeholder="new project name (a-z 0-9 - _)"
              className="w-44 rounded-md border border-line px-2.5 py-1.5 font-mono text-xs text-ink"
            />
            <button
              onClick={() => void onCreate()}
              disabled={busy || !projectExists || newJobId.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
              Create project
            </button>
          </div>
        </div>
        {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
      </Card>

      {!selectedJobId || !detail ? (
        <Card>
          <h3 className="font-semibold text-ink">Select or create a project</h3>
          <p className="mt-1 text-sm text-ink-3">
            Pick a project above (or create one) to open the full workflow on this page: files, map, bore logs,
            redline, review, closeout, and export.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {WORKSPACE_SECTIONS.map(({ key }) => (
            <section key={key} id={sectionAnchorId(key)} className="scroll-mt-24">
              {renderSection(key)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// A thin, numbered section marker so the scrollable flow reads in order (the sidebar anchors land here).
// --------------------------------------------------------------------------- //
function SectionShell({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">{n}</span>
        <h2 className="text-base font-semibold text-ink">{label}</h2>
      </div>
      {children}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Job header band (Overview) — readable name, stage, files summary, redline + closeout status, and ONE
// derived primary next action. Raw status matrix sits behind Diagnostics. Slot-gated reads (no doomed 404s).
// --------------------------------------------------------------------------- //
interface HeaderFacts {
  engineReady: boolean | null;
  artifactCount: number | null;
  closeoutStatus: string | null;
  exportStatus: string | null;
  reviewStatus: string | null;
}

function JobHeaderBand({ jobId, detail, jobs, refreshKey }: {
  jobId: string; detail: ProductJobDetail; jobs: readonly ProductJobSummary[]; refreshKey?: string;
}) {
  const [f, setF] = useState<HeaderFacts>({ engineReady: null, artifactCount: null, closeoutStatus: null, exportStatus: null, reviewStatus: null });

  const hasBundle = detail.slots.artifactBundle;
  const hasExport = detail.slots.exportPackage;
  const hasBoreLog = detail.uploads.some((u) => u.kind === 'BORE_LOG');
  const placed = detail.slots.redlineManifest;

  const load = useCallback(async () => {
    let engineReady: boolean | null = null;
    let artifactCount: number | null = hasBundle ? null : 0;
    let closeoutStatus: string | null = null;
    let exportStatus: string | null = null;
    let reviewStatus: string | null = null;
    if (hasBoreLog) { try { engineReady = (await fetchReviewQueue(jobId, WORKSPACE_RBL_ID)).engineReady; } catch { engineReady = null; } }
    if (hasBundle) { try { artifactCount = (await fetchJobArtifacts(jobId)).length; } catch { artifactCount = null; } }
    if (hasExport) { try { closeoutStatus = (await fetchCloseoutStatus(jobId)).status; } catch { closeoutStatus = null; } }
    if (hasExport) { try { exportStatus = (await fetchExportStatus(jobId)).status; } catch { exportStatus = null; } }
    if (placed) { try { const cs = await listReviewCandidates(jobId); reviewStatus = cs.length > 0 ? (cs[0].status ?? null) : null; } catch { reviewStatus = null; } }
    setF({ engineReady, artifactCount, closeoutStatus, exportStatus, reviewStatus });
  }, [jobId, hasBundle, hasExport, hasBoreLog, placed]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  const present = new Set(detail.uploads.map((u) => u.kind));
  const hasPlan = present.has('PLAN_PDF');
  const summary = jobs.find((j) => j.jobId === jobId);

  // ONE derived primary next action (same detail the sections read -> never stale after an action).
  const primary: { label: string; to: WorkspaceSectionKey } = (() => {
    if (!hasPlan || !hasBoreLog) return { label: 'Upload the plan + bore log', to: 'uploads' };
    // engine_ready must be explicitly true before Generate. null (just-uploaded, not yet reviewed) or false
    // both mean "not ready" — point to the bore-log gate first so Generate never abstains in a loop (W2).
    if (hasBoreLog && f.engineReady !== true && !placed) return { label: 'Review the bore log', to: 'borelogs' };
    if (!placed) return { label: 'Generate the redline', to: 'redlines' };
    if (f.reviewStatus === 'REVIEW_CANDIDATE') return { label: 'Accept or correct the redline', to: 'review' };
    if (f.reviewStatus === 'REVIEW_REJECTED') return { label: 'Correct the rejected redline', to: 'review' };
    if (!hasExport) return { label: 'Assemble the closeout package', to: 'closeout' };
    return { label: 'Download / print the closeout package', to: 'exports' };
  })();

  const redlineStatus = !placed ? 'not placed'
    : f.reviewStatus === 'REVIEW_ACCEPTED' ? 'placed · accepted'
    : f.reviewStatus === 'REVIEW_SUPERSEDED' ? 'placed · corrected'
    : f.reviewStatus === 'REVIEW_CANDIDATE' ? 'placed · awaiting review'
    : f.reviewStatus === 'REVIEW_REJECTED' ? 'placed · rejected'
    : 'placed';

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{jobTitle(jobId)}</h2>
        </div>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
          {friendlyStage(detail.status)}
        </span>
      </div>

      {/* Readable status strip. */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <span className="text-ink-2"><span className="text-ink-3">Files:</span> {detail.uploads.length} ({UPLOAD_KINDS.filter((k) => present.has(k.kind)).map((k) => k.label).join(', ') || 'none'})</span>
        <span className="text-ink-2"><span className="text-ink-3">Redline:</span> {redlineStatus}{f.artifactCount != null && placed ? ` · ${f.artifactCount} image(s)` : ''}</span>
        <span className="text-ink-2"><span className="text-ink-3">Closeout:</span> {hasExport ? friendlyCloseout(f.closeoutStatus) : 'not assembled'}</span>
      </div>

      {/* ONE primary next action. */}
      <button
        onClick={() => scrollToSection(primary.to)}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
        {primary.label} <ArrowRight className="size-4" />
      </button>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-ink-3">Diagnostics</summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3 lg:grid-cols-4">
          <Diag label="Project key" value={jobAlias(jobId)} mono />
          <Diag label="status" value={detail.status} mono />
          <Diag label="created" value={summary?.createdAt ?? '—'} />
          <Diag label="redline_manifest slot" value={String(detail.slots.redlineManifest)} mono />
          <Diag label="artifact_bundle slot" value={String(detail.slots.artifactBundle)} mono />
          <Diag label="export_package slot" value={String(detail.slots.exportPackage)} mono />
          <Diag label="engine_ready" value={f.engineReady == null ? '—' : String(f.engineReady)} mono />
          <Diag label="review status" value={f.reviewStatus ?? '—'} mono />
          <Diag label="closeout status" value={f.closeoutStatus ?? '—'} mono />
          <Diag label="export status" value={f.exportStatus ?? '—'} mono />
          <Diag label="redline images" value={f.artifactCount == null ? '—' : String(f.artifactCount)} />
        </dl>
      </details>
    </Card>
  );
}

function Diag({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className={`text-ink-2 ${mono ? 'font-mono' : ''}`}>{value}</dd>
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
  const hasGis = present.has('GIS_ROUTE');
  const boreCount = detail.uploads.filter((u) => u.kind === 'BORE_LOG').length;
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
    detailLine = 'This package matches a proven project; the engine redline can be placed automatically in the Redline section.';
  } else if (engineReady === true) {
    tone = 'ready';
    title = 'Ready to process';
    detailLine = 'The bore log is reviewed. Generate the redline candidate in the Redline section.';
  } else {
    tone = 'pending';
    title = 'Required files present — one step left';
    detailLine = 'Review the bore log in the Bore log section to enable redline placement.';
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
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span>{hasPlan ? '✓' : '—'} Plan PDF</span>
        <span>{hasBore ? `✓ Bore log (${boreCount} file${boreCount === 1 ? '' : 's'})` : '— Bore log'}</span>
        <span>{hasGis ? '✓ KMZ / KML route' : '— KMZ / KML route (optional)'}</span>
        {recognized === true && <span className="font-medium text-emerald-700">✓ Recognized project</span>}
      </div>
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
// Closeout review (v1 review-before-print) — composed from existing reads. The SOLE Assemble owner. Wrapped
// in id="closeout-print" so window.print() (in the Export section) can scope to just this review.
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
    // candidate in Review and the refresh bus fires), a prior "needs to be accepted" block must not linger.
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
      else setError(closeoutCodeCopy(result.blocker ?? '') + (result.blocker === 'REVIEW_NOT_ACCEPTED' || result.blocker === 'REVIEW_WAS_REJECTED' ? '' : ''));
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
          No redline is placed yet. Generate one in the <span className="font-semibold">Redline</span> section
          above (and accept or correct it in <span className="font-semibold">Review</span>), then assemble and
          review the closeout package here.
        </p>
      </Card>
    );
  }

  const present = new Set(detail.uploads.map((u) => u.kind));
  const redlineSummary = reviewStatus === 'REVIEW_ACCEPTED' ? 'Accepted REVIEW redline'
    : reviewStatus === 'REVIEW_SUPERSEDED' ? 'Human-corrected REVIEW redline'
    : reviewStatus === 'REVIEW_CANDIDATE' ? 'REVIEW candidate — not yet accepted'
    : reviewStatus === 'REVIEW_REJECTED' ? 'Rejected — needs correction'
    : 'Automatic (recognized) redline';

  // Positive completeness checklist — every row derived from a real server value (no fabricated ✓).
  const reviewedOk = reviewStatus === 'REVIEW_ACCEPTED' || reviewStatus === 'REVIEW_SUPERSEDED' || (placed && reviewStatus === null);
  const reviewLabel = reviewStatus === 'REVIEW_REJECTED' ? 'Placement rejected — correct it in Review'
    : reviewStatus === 'REVIEW_CANDIDATE' ? 'Placement awaiting your review'
    : reviewStatus === 'REVIEW_SUPERSEDED' ? 'Placement reviewed (human-corrected)'
    : reviewStatus === 'REVIEW_ACCEPTED' ? 'Placement reviewed (accepted)'
    : 'Placement reviewed (automatic — recognized)';
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
                {(error.includes('accept') || error.includes('Review')) && (
                  <button onClick={onGoToReview} className="font-semibold underline">Go to Review</button>
                )}
              </p>
            )}
          </div>
        )}
        {assembled && (
          <p className="mt-3 text-sm text-ink-2">
            The package is assembled. <button onClick={onGoToExports} className="font-semibold text-accent-strong hover:underline">Download or print it in Export &amp; print ↓</button>
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
              evidence the PDF/ZIP omit. (Photos remain visible in the Project files section.) */}
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
                <li key={b} className="text-red-600">{closeoutCodeCopy(b)} <span className="font-mono text-[10px] text-ink-3">({b})</span></li>
              ))}
              {warnings.map((w) => (
                <li key={w} className="text-ink-3">{closeoutCodeCopy(w)} <span className="font-mono text-[10px] text-ink-3">({w})</span></li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-ink-3">
          Generated from the uploaded source evidence. This is a REVIEW deliverable — review it before
          construction or use. Closeout status is server-authoritative. Final sign-off (approve / lock for
          billing) requires sign-in — coming with accounts; until then the assembled package is ready to
          review, download, and print.
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
// Export & print — the SOLE Download owner + Print/Save (window.print of the closeout review).
// --------------------------------------------------------------------------- //
function ExportsSection({ jobId, refreshKey, ready }: { jobId: string; refreshKey?: string; ready: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState<string>('Loading…');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) { setStatus(null); setNote('No closeout package assembled yet. Assemble it in the Closeout review section above.'); return; }
    setNote('Loading…');
    try { setStatus((await fetchExportStatus(jobId)).status); setNote(''); }
    catch { setStatus(null); setNote('No closeout package assembled yet. Assemble it in the Closeout review section above.'); }
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
      <h3 className="font-semibold text-ink">Export &amp; print</h3>
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
          className="inline-flex items-center gap-1 text-sm text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50">
          <Printer className="size-4" /> Print / save the on-screen review
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
