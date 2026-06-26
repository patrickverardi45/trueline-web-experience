'use client';

// Phase 11 — internal v2 product WORKSPACE body (typed-only /intake?workspace=1; NOT in the public/guided
// nav). The section workflow lives in the MAIN LEFT SIDEBAR (see shell/Sidebar.tsx); this component renders a
// compact job header + the SINGLE selected section full-width. Section + job are URL-driven
// (?workspace=1&job=<id>&section=<key>) so the sidebar and this body stay in sync. Every section works on
// REAL data or shows an honest "not yet"/"not available" state — no mock pages, no fakes. Reuses the proven
// Phase 9/10 components + routes.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { ProductUploadPanel } from '@/components/ProductUploadPanel';
import { ProductUploadInventory } from '@/components/ProductUploadInventory';
import { ProductReviewedBoreLogGate } from '@/components/ProductReviewedBoreLogGate';
import { ProductReviewCandidates } from '@/components/ProductReviewCandidates';
import { ProductWorkflowPanel } from '@/components/ProductWorkflowPanel';
import { ProductRouteMap } from '@/components/ProductRouteMap';
import { coerceSection, workspaceHref, type WorkspaceSectionKey } from '@/lib/workspaceSections';
import {
  assembleCloseoutPackage,
  downloadCloseoutPdfBlob,
  downloadExportBundleBlob,
  fetchCloseoutStatus,
  fetchExportStatus,
  fetchJobArtifacts,
  fetchReviewQueue,
  type ProductJobDetail,
  type ProductJobSummary,
} from '@/lib/api/productWrites';

const WORKSPACE_RBL_ID = 'rbl-main'; // the canonical reviewed-bore-log id the gate uses

// Friendly, understandable titles for the prepared sample jobs (the raw id stays as a muted technical
// sub-label). A job the user creates falls back to its own id (which is the name they typed).
const JOB_TITLES: Record<string, string> = {
  'demo-general-upload': 'Uploaded project — clean placement',
  'demo-general-upload-ambiguous': 'Uploaded project — ambiguous (correct it)',
  'recognized-log9': 'Recognized project — automatic redline',
  'completed-redline-showcase': 'Finished redline showcase',
  'demo-review-acceptance': 'Uploaded project — REVIEW acceptance',
  'demo-cross-sheet-review': 'Uploaded project — cross-sheet REVIEW',
};
function jobTitle(id: string): string {
  return JOB_TITLES[id] ?? id;
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
  const searchParams = useSearchParams();
  const section = coerceSection(searchParams.get('section'));

  // Keep slot-gated sections (Closeout/Exports/Summary) fresh after a Generate/Assemble: re-read the job
  // detail whenever the section changes (sidebar nav) or the job changes.
  useEffect(() => {
    if (selectedJobId) void refreshDetail(selectedJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, selectedJobId]);

  const boreLogUploads = (detail?.uploads ?? [])
    .filter((u) => u.kind === 'BORE_LOG')
    .map((u) => ({ uploadId: u.uploadId, filename: u.filename }));

  async function onCreate() {
    const id = newJobId.trim();
    if (!id) return;
    await onCreateJob();
    router.push(workspaceHref(id, 'summary'));
  }

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <h2 className="text-lg font-semibold text-ink">Project workspace</h2>
        <p className="mt-1 text-sm text-ink-2">
          Upload a plan PDF, KMZ/KML route, bore log, and photos; the engine places redlines on the plan;
          review or correct the placement; then assemble and download the closeout package. Redlines come from
          the real engine — no coordinates are invented, and an uncertain placement is flagged for your review
          and correction rather than guessed.
        </p>
        <Link href="/intake" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink hover:underline">
          <ArrowLeft className="size-3.5" /> Guided demo workflows
        </Link>
      </Card>

      {!projectExists && (
        <Card>
          <h3 className="font-semibold text-ink">Project (this tenant)</h3>
          <p className="mt-1 text-sm text-ink-3">No project exists for this tenant yet.</p>
          <button
            onClick={onCreateProject}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            Create project
          </button>
        </Card>
      )}

      {/* Compact job header: pick the active job (drives ?job= so the sidebar workflow unlocks). */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-ink">Job</h3>
          {jobs.length === 0 ? (
            <span className="text-sm text-ink-3">No jobs yet — create one.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {jobs.map((j) => (
                <button
                  key={j.jobId}
                  onClick={() => router.push(workspaceHref(j.jobId, section))}
                  className={`rounded-md border px-2.5 py-1 text-left ${
                    selectedJobId === j.jobId
                      ? 'border-accent bg-accent-soft text-accent-strong'
                      : 'border-line text-ink-2 hover:text-ink'
                  }`}>
                  <span className="block text-xs font-medium">{jobTitle(j.jobId)}</span>
                  <span className="block font-mono text-[10px] text-ink-3">{j.jobId}</span>
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <input
              value={newJobId}
              onChange={(e) => setNewJobId(e.target.value)}
              placeholder="job id (a-z 0-9 _ -)"
              className="w-40 rounded-md border border-line px-2.5 py-1.5 font-mono text-xs text-ink"
            />
            <button
              onClick={() => void onCreate()}
              disabled={busy || !projectExists || newJobId.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
              Create job
            </button>
          </div>
        </div>
        {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
      </Card>

      {/* The single selected section, full width. */}
      {!selectedJobId || !detail ? (
        <Card>
          <h3 className="font-semibold text-ink">Select or create a job</h3>
          <p className="mt-1 text-sm text-ink-3">
            Pick a job above (or create one) to unlock the workflow sections in the left sidebar: Job Summary,
            Uploads, Map/Route, Bore Logs, Redlines, Review, Closeout, Exports, and Billing.
          </p>
        </Card>
      ) : section === 'summary' ? (
        <JobSummarySection jobId={selectedJobId} detail={detail} refreshKey={uploadsKey}
                           onNavigate={(k) => router.push(workspaceHref(selectedJobId, k))} />
      ) : section === 'uploads' ? (
        <div className="space-y-4">
          <UploadsChecklist detail={detail} />
          <ProductUploadPanel
            jobId={selectedJobId}
            onUploaded={() => {
              void refreshDetail(selectedJobId);
              void loadProjectAndJobs();
            }}
          />
          <ProductUploadInventory job={detail} />
        </div>
      ) : section === 'map' ? (
        <ProductRouteMap jobId={selectedJobId} refreshKey={uploadsKey} />
      ) : section === 'borelogs' ? (
        <ProductReviewedBoreLogGate jobId={selectedJobId} boreLogUploads={boreLogUploads} />
      ) : section === 'redlines' ? (
        <ProductWorkflowPanel
          jobId={selectedJobId}
          refreshKey={uploadsKey}
          placed={detail.slots.redlineManifest}
          assembled={detail.slots.exportPackage}
          onChanged={() => void refreshDetail(selectedJobId)}
        />
      ) : section === 'review' ? (
        <ProductReviewCandidates
          jobId={selectedJobId}
          refreshKey={uploadsKey}
          planUploads={detail.uploads
            .filter((u) => u.kind === 'PLAN_PDF')
            .map((u) => ({ uploadId: u.uploadId, filename: u.filename }))}
          onChanged={() => void refreshDetail(selectedJobId)}
        />
      ) : section === 'closeout' ? (
        <CloseoutSection
          jobId={selectedJobId}
          refreshKey={uploadsKey}
          placed={detail.slots.redlineManifest}
          assembled={detail.slots.exportPackage}
          onAssembled={() => void refreshDetail(selectedJobId)}
        />
      ) : section === 'exports' ? (
        <ExportsSection jobId={selectedJobId} refreshKey={uploadsKey} ready={detail.slots.exportPackage} />
      ) : (
        <BillingSection jobId={selectedJobId} refreshKey={uploadsKey} />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Uploads — what exists vs what's missing (real, from the job's upload kinds).
// --------------------------------------------------------------------------- //
const UPLOAD_KINDS: { kind: string; label: string; required: boolean }[] = [
  { kind: 'PLAN_PDF', label: 'Plan PDF', required: true },
  { kind: 'BORE_LOG', label: 'Bore log', required: true },
  { kind: 'GIS_ROUTE', label: 'GIS route (KMZ/KML)', required: false },
  { kind: 'PHOTO', label: 'Photos', required: false },
];

function UploadsChecklist({ detail }: { detail: ProductJobDetail }) {
  const present = new Set(detail.uploads.map((u) => u.kind));
  return (
    <Card>
      <h3 className="font-semibold text-ink">Uploads — what this job has</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {UPLOAD_KINDS.map((k) => {
          const has = present.has(k.kind);
          return (
            <li key={k.kind} className="flex items-center gap-2">
              {has ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-ink-3" />}
              <span className={has ? 'text-ink' : 'text-ink-3'}>{k.label}</span>
              {!has && k.required && <span className="text-xs text-amber-700">required</span>}
              {!has && !k.required && <span className="text-xs text-ink-3">optional</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-ink-3">Files are stored untrusted (no OCR/parsing on upload).</p>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Job Summary — composes existing reads; honest "not yet" on any unavailable piece. Slot-gated so a pristine
// job makes no doomed 404 requests.
// --------------------------------------------------------------------------- //
interface SummaryState {
  artifactCount: number | null;
  engineReady: boolean | null;
  closeoutStatus: string | null;
  exportStatus: string | null;
}

function JobSummarySection({ jobId, detail, refreshKey, onNavigate }: {
  jobId: string; detail: ProductJobDetail; refreshKey?: string; onNavigate: (s: WorkspaceSectionKey) => void;
}) {
  const [s, setS] = useState<SummaryState>({ artifactCount: null, engineReady: null, closeoutStatus: null, exportStatus: null });

  const hasBundle = detail.slots.artifactBundle;
  // The closeout record + export_package slot are BOTH created by Assemble (not by Generate, which only sets
  // the manifest/bundle) — so gate the closeout/export reads on hasExport to avoid a doomed 404 on a job
  // that is generated (PLACED) but not yet assembled.
  const hasExport = detail.slots.exportPackage;
  const hasBoreLog = detail.uploads.some((u) => u.kind === 'BORE_LOG');

  const load = useCallback(async () => {
    let artifactCount: number | null = hasBundle ? null : 0;
    let engineReady: boolean | null = null;
    let closeoutStatus: string | null = null;
    let exportStatus: string | null = null;
    if (hasBundle) { try { artifactCount = (await fetchJobArtifacts(jobId)).length; } catch { artifactCount = null; } }
    if (hasBoreLog) { try { engineReady = (await fetchReviewQueue(jobId, WORKSPACE_RBL_ID)).engineReady; } catch { engineReady = null; } }
    if (hasExport) { try { closeoutStatus = (await fetchCloseoutStatus(jobId)).status; } catch { closeoutStatus = null; } }
    if (hasExport) { try { exportStatus = (await fetchExportStatus(jobId)).status; } catch { exportStatus = null; } }
    setS({ artifactCount, engineReady, closeoutStatus, exportStatus });
  }, [jobId, hasBundle, hasExport, hasBoreLog]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  const present = new Set(detail.uploads.map((u) => u.kind));
  const yn = (v: boolean) => (v ? 'yes' : 'no');
  const orPending = (v: string | null, pending = 'not yet') => v ?? pending;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Job Summary</h3>
        <span className="font-mono text-xs text-ink-3">{jobId}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Job status" value={detail.status} mono />
        <Stat label="Uploads" value={`${detail.uploads.length} file(s)`} />
        <Stat label="Plan PDF" value={yn(present.has('PLAN_PDF'))} />
        <Stat label="Bore log" value={yn(present.has('BORE_LOG'))} />
        <Stat label="GIS route" value={yn(present.has('GIS_ROUTE'))} />
        <Stat label="Reviewed bore-log ready" value={s.engineReady === null ? 'not yet' : yn(s.engineReady)} />
        <Stat label="Redline manifest" value={yn(detail.slots.redlineManifest)} />
        <Stat label="Redline artifacts" value={s.artifactCount === null ? '—' : String(s.artifactCount)} />
        <Stat label="Export package" value={yn(detail.slots.exportPackage)} />
        <Stat label="Closeout" value={orPending(s.closeoutStatus)} mono />
        <Stat label="Export status" value={orPending(s.exportStatus)} mono />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        {(['uploads', 'map', 'redlines', 'closeout', 'exports'] as WorkspaceSectionKey[]).map((k) => (
          <button
            key={k}
            onClick={() => onNavigate(k)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink">
            Go to {k}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">All values are read from the live product API; “not yet” means the step hasn’t produced server-authoritative state.</p>
    </Card>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`text-ink ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Closeout — OWNS the closeout assembly. Once a redline is PLACED (a recognized deterministic render OR an
// accepted REVIEW candidate, from ANY panel), it offers "Assemble closeout package" here, driven by the
// persisted job slots — NOT a transient Generate click. The backend review gate still enforces acceptance,
// so a pending/rejected REVIEW surfaces a clear next step. Once assembled, it shows the server-authoritative
// status and points to Exports. This is why the owner is never stranded after accepting a REVIEW candidate.
// --------------------------------------------------------------------------- //
function CloseoutSection({ jobId, refreshKey, placed, assembled, onAssembled }: {
  jobId: string; refreshKey?: string; placed: boolean; assembled: boolean; onAssembled: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<readonly string[]>([]);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assembled) {
      setStatus(null);
      setNote('');
      return;
    }
    setNote('Loading…');
    try {
      const v = await fetchCloseoutStatus(jobId);
      setStatus(v.status);
      setBlockers(v.hardBlockerCodes);
      setWarnings(v.warningCodes);
      setNote('');
    } catch {
      setStatus(null);
      setNote('Closeout status unavailable — retry, or re-assemble.');
    }
  }, [jobId, assembled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  async function onAssemble() {
    setBusy(true);
    setError(null);
    try {
      const result = await assembleCloseoutPackage(jobId);
      if (result.assembled) onAssembled();              // refresh detail -> assembled flips -> status loads
      else setError(assembleBlockerCopy(result.blocker));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to assemble the closeout package');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-ink">Closeout</h3>

      {!placed && (
        <p className="mt-1 text-sm text-ink-3">
          No redline is placed yet. Generate one in the <span className="font-semibold">Redlines</span>{' '}
          section (and accept the REVIEW candidate if prompted), then assemble the closeout package here.
        </p>
      )}

      {placed && !assembled && (
        <div className="mt-1">
          <p className="text-sm text-ink-3">
            A redline is placed for this job. Assemble the closeout &amp; export package to finish.
          </p>
          <button
            onClick={onAssemble}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            {busy ? 'Assembling…' : 'Assemble closeout package'}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}

      {assembled && (
        <div className="mt-2 text-sm">
          {note && <p className="text-ink-3">{note}</p>}
          {status && <p>Status: <span className="font-mono text-emerald-700">{status}</span></p>}
          {blockers.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-red-600">
              {blockers.map((b) => <li key={b}>blocker: <span className="font-mono">{b}</span></li>)}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-ink-3">
              {warnings.map((w) => <li key={w}>warning: <span className="font-mono">{w}</span></li>)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-ink-3">
            Closeout status is server-authoritative. Download the package in the Exports section. Approve/lock
            are deferred (await verified-role auth).
          </p>
        </div>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Exports — download ZIP + PDF (proven Phase 10) + the export section list.
// --------------------------------------------------------------------------- //
function ExportsSection({ jobId, refreshKey, ready }: { jobId: string; refreshKey?: string; ready: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [included, setIncluded] = useState<readonly string[]>([]);
  const [omitted, setOmitted] = useState<readonly string[]>([]);
  const [note, setNote] = useState<string>('Loading…');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) {
      setStatus(null);
      setNote('No export package assembled yet. Run Generate → Assemble in the Redlines section first.');
      return;
    }
    setNote('Loading…');
    try {
      const v = await fetchExportStatus(jobId);
      setStatus(v.status);
      setIncluded(v.includedSections);
      setOmitted(v.omittedSections);
      setNote('');
    } catch {
      setStatus(null);
      setNote('No export package assembled yet. Run Generate → Assemble in the Redlines section first.');
    }
  }, [jobId, ready]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  async function download(kind: 'zip' | 'pdf') {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'zip') triggerDownload(await downloadExportBundleBlob(jobId), `redline_export_${jobId}.zip`);
      else triggerDownload(await downloadCloseoutPdfBlob(jobId), `closeout_packet_${jobId}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'download failed (assemble the closeout package first)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-ink">Exports</h3>
      {note && <p className="mt-1 text-sm text-ink-3">{note}</p>}
      {status && (
        <p className="mt-1 text-sm">Export status: <span className="font-mono">{status}</span></p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void download('zip')}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Preparing…' : 'Download closeout package (.zip)'}
        </button>
        <button
          onClick={() => void download('pdf')}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
          {busy ? 'Preparing…' : 'Download closeout PDF'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {included.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">included: <span className="font-mono">{included.join(', ')}</span></p>
      )}
      {omitted.length > 0 && (
        <p className="mt-1 text-xs text-ink-3">omitted: <span className="font-mono">{omitted.join(', ')}</span></p>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Billing — QUANTITIES only; no dollars until server cost rules are configured.
// --------------------------------------------------------------------------- //
function BillingSection({ jobId, refreshKey }: { jobId: string; refreshKey?: string }) {
  const [artifactCount, setArtifactCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setArtifactCount((await fetchJobArtifacts(jobId)).length);
    } catch {
      setArtifactCount(null);
    }
  }, [jobId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  return (
    <Card>
      <h3 className="font-semibold text-ink">Billing</h3>
      <p className="mt-1 text-sm text-ink-3">
        Quantities only — <span className="font-semibold">no dollar amounts</span> are shown. Priced billing
        appears only when server cost rules are configured (none configured on this deployment); the system
        never shows operator-entered or client-side dollars.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Stat label="Redline PNG artifacts" value={artifactCount === null ? '—' : String(artifactCount)} />
      </dl>
      <p className="mt-2 text-[11px] text-ink-3">
        The full deliverable-quantity breakdown (drawn/total/blocked log counts, footage when present) is in
        the downloadable closeout PDF (Exports section).
      </p>
    </Card>
  );
}
