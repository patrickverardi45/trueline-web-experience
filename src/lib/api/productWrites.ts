// Live v2 PRODUCT-API write/intake adapter (product mode only). Creates the tenant's project + jobs and
// registers real uploads against the /v2/product API, and reads back the tenant's jobs + one job's upload
// inventory. The X-TL-Tenant / X-TL-Session headers are the backend's DEV STAND-IN identity (NOT real
// auth), and there is NO mock fallback: a failed live write/read THROWS so the UI surfaces an honest
// error.
//
// Self-contained on purpose (no relative runtime imports) so the pure path/body/kind helpers are
// unit-checkable under plain Node — the same convention liveV2Product.ts follows.

// Dev stand-in session id recorded as the audit `by` (not auth).
const SESSION = 'web-intake';

export type UploadCategory = 'PLAN_PDF' | 'BORE_LOG';

export interface ProductJobSummary {
  readonly jobId: string;
  readonly status: string;
  readonly uploadCount: number;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface ProductUploadRecord {
  readonly uploadId: string;
  readonly kind: string;
  readonly filename: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly extractionStatus: string;
}

export interface ProductJobDetail {
  readonly jobId: string;
  readonly status: string;
  readonly uploads: readonly ProductUploadRecord[];
}

// --- config (read at call time; mirrors liveV2Product) --------------------------------------------- //

function requireEnv(value: string | undefined, name: string): string {
  const v = (value ?? '').trim();
  if (!v) throw new Error(`product mode requires ${name}`);
  return v;
}

function apiBase(): string {
  const raw = requireEnv(process.env.NEXT_PUBLIC_TL2_API_BASE, 'NEXT_PUBLIC_TL2_API_BASE');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_TL2_API_BASE must be an HTTP(S) URL');
  }
  return raw.replace(/\/+$/, '');
}

function tenant(): string {
  return requireEnv(process.env.NEXT_PUBLIC_TL2_TENANT, 'NEXT_PUBLIC_TL2_TENANT');
}

function headers(): Record<string, string> {
  // Backend DEV STAND-IN identity headers — not real auth.
  return { 'X-TL-Tenant': tenant(), 'X-TL-Session': SESSION };
}

// --- pure helpers (unit-checkable) ----------------------------------------------------------------- //

/** Map a filename to its upload kind. `.pdf` is ambiguous (plan vs bore-log) so the caller's selected
 *  category decides it; unsupported extensions return null (the UI rejects them honestly, never guesses). */
export function inferUploadKind(filename: string, pdfCategory: UploadCategory): string | null {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (ext === '.pdf') return pdfCategory;
  if (ext === '.csv' || ext === '.xlsx') return 'BORE_LOG';
  if (ext === '.kmz' || ext === '.kml') return 'GIS_ROUTE';
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') return 'PHOTO';
  return null;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid v2 product response: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function int(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function composeJobSummaries(doc: unknown): ProductJobSummary[] {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return [];
  const list = (doc as Record<string, unknown>).jobs;
  if (!Array.isArray(list)) return [];
  const out: ProductJobSummary[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const j = item as Record<string, unknown>;
    const jobId = strOrNull(j.job_id);
    if (!jobId) continue;
    out.push({
      jobId,
      status: str(j.status),
      uploadCount: int(j.upload_count),
      createdAt: strOrNull(j.created_at),
      updatedAt: strOrNull(j.updated_at),
    });
  }
  return out;
}

export function composeJobDetail(doc: unknown): ProductJobDetail {
  const j = asRecord(doc, 'job');
  const rawUploads = Array.isArray(j.uploads) ? j.uploads : [];
  const uploads: ProductUploadRecord[] = rawUploads
    .filter((u): u is Record<string, unknown> => typeof u === 'object' && u !== null && !Array.isArray(u))
    .map((u) => ({
      uploadId: str(u.upload_id),
      kind: str(u.kind),
      filename: str(u.original_filename),
      bytes: int(u.bytes),
      sha256: str(u.sha256),
      extractionStatus: str(u.extraction_status),
    }));
  return { jobId: str(j.job_id), status: str(j.status), uploads };
}

// --- live reads/writes (throw on failure; never mock) ---------------------------------------------- //

async function getProductJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, { method: 'GET', cache: 'no-store', headers: headers() });
  if (!response.ok) throw new Error(`product GET ${path} failed with HTTP ${response.status}`);
  return response.json();
}

async function postProductJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`product POST ${path} failed with HTTP ${response.status}`);
  return response.json();
}

/** Create the tenant's customer_project (id == verified tenant; display_name is opaque). 409 if it exists. */
export async function createProductProject(displayName: string): Promise<unknown> {
  return postProductJson('/v2/product/project', { display_name: displayName });
}

/** True iff the tenant's project already exists (GET /project is 404 when not). */
export async function productProjectExists(): Promise<boolean> {
  try {
    await getProductJson('/v2/product/project');
    return true;
  } catch {
    return false;
  }
}

export async function createProductJob(jobId: string): Promise<unknown> {
  return postProductJson('/v2/product/jobs', { job_id: jobId });
}

export async function listProductJobs(): Promise<ProductJobSummary[]> {
  return composeJobSummaries(await getProductJson('/v2/product/jobs'));
}

export async function fetchProductJobDetail(jobId: string): Promise<ProductJobDetail> {
  return composeJobDetail(await getProductJson(`/v2/product/jobs/${jobId}`));
}

/** Register one upload (UNTRUSTED, stays extraction_status="queued" — no OCR). Bytes are base64-JSON
 *  (the backend route's contract; no multipart). Throws on a non-OK response. */
export async function uploadProductFile(
  jobId: string,
  file: { kind: string; filename: string; contentBase64: string },
): Promise<unknown> {
  return postProductJson(`/v2/product/jobs/${jobId}/uploads`, {
    kind: file.kind,
    filename: file.filename,
    content_base64: file.contentBase64,
  });
}

/** Browser-only: read a File's bytes and base64-encode them (chunked, to avoid call-stack limits). */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ====================================================================================================
// Slice B — reviewed bore-log gate (manual reviewed structured rows; NO OCR, NO engine run).
// ====================================================================================================

export type ReviewStatus = 'UNREVIEWED' | 'CONFIRMED' | 'CORRECTED' | 'REJECTED' | 'NEEDS_CLARIFICATION';
export type SegmentRelation = 'SEPARATE_BORE' | 'SAME_RUN_SEGMENTS' | 'AMBIGUOUS';
export type GroupingStatus = 'PENDING' | 'CONFIRMED' | 'SOURCE_CONFLICT';

/** One manually-entered (human-supplied, reviewed/corrected) row — NOT OCR/auto-extracted. */
export interface ManualRowInput {
  readonly rowId: string;
  readonly startStation: string;
  readonly endStation: string;
  readonly note?: string;
}

export interface ReviewedRowView {
  readonly rowId: string;
  readonly startStation: string;
  readonly endStation: string;
  readonly extractionMethod: string;
  readonly reviewStatus: string;
  readonly reason: string | null;
}

export interface ReviewedGroupView {
  readonly groupId: string;
  readonly memberRowIds: readonly string[];
  readonly relation: string;
  readonly groupingStatus: string;
}

export interface ReviewedBoreLogView {
  readonly rblId: string;
  readonly sourceUploadId: string;
  readonly rows: readonly ReviewedRowView[];
  readonly groups: readonly ReviewedGroupView[];
}

export interface ReviewQueueView {
  readonly rowsNeedingReview: readonly string[];
  readonly rowsRejected: readonly string[];
  readonly rowsReviewPassed: readonly string[];
  readonly engineEligibleRowIds: readonly string[];
  readonly ungroupedRows: readonly string[];
  readonly rowsInMultipleGroups: readonly string[];
  readonly unresolvedGroups: readonly string[];
  readonly engineReady: boolean;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// --- pure compose (unit-checkable) ----------------------------------------------------------------- //

export function composeReviewedBoreLog(doc: unknown): ReviewedBoreLogView {
  const r = asRecord(doc, 'reviewed-bore-log');
  const rawRows = Array.isArray(r.rows) ? r.rows : [];
  const rows: ReviewedRowView[] = rawRows
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
    .map((row) => {
      const normalized = (typeof row.normalized === 'object' && row.normalized !== null)
        ? (row.normalized as Record<string, unknown>) : {};
      const raw = (typeof row.raw === 'object' && row.raw !== null)
        ? (row.raw as Record<string, unknown>) : {};
      const extraction = (typeof row.extraction === 'object' && row.extraction !== null)
        ? (row.extraction as Record<string, unknown>) : {};
      const review = (typeof row.review === 'object' && row.review !== null)
        ? (row.review as Record<string, unknown>) : {};
      return {
        rowId: str(row.row_id),
        startStation: str(normalized.start_station) || str(raw.start_station),
        endStation: str(normalized.end_station) || str(raw.end_station),
        extractionMethod: str(extraction.extraction_method),
        reviewStatus: str(review.status),
        reason: strOrNull(review.reason),
      };
    });
  const rawGroups = Array.isArray(r.groups) ? r.groups : [];
  const groups: ReviewedGroupView[] = rawGroups
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
    .map((g) => ({
      groupId: str(g.group_id),
      memberRowIds: strList(g.member_row_ids),
      relation: str(g.relation),
      groupingStatus: str(g.grouping_status),
    }));
  return { rblId: str(r.reviewed_bore_log_id), sourceUploadId: str(r.source_upload_id), rows, groups };
}

export function composeReviewQueue(doc: unknown): ReviewQueueView {
  const q = asRecord(doc, 'review-queue');
  return {
    rowsNeedingReview: strList(q.rows_needing_review),
    rowsRejected: strList(q.rows_rejected),
    rowsReviewPassed: strList(q.rows_review_passed),
    engineEligibleRowIds: strList(q.engine_eligible_row_ids),
    ungroupedRows: strList(q.ungrouped_rows),
    rowsInMultipleGroups: strList(q.rows_in_multiple_groups),
    unresolvedGroups: strList(q.unresolved_groups),
    engineReady: q.engine_ready === true,
  };
}

// --- live reads/writes (throw on failure; never mock) ---------------------------------------------- //

export async function createReviewedBoreLog(jobId: string, rblId: string, sourceUploadId: string): Promise<unknown> {
  return postProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs`, {
    reviewed_bore_log_id: rblId,
    source_upload_id: sourceUploadId,
  });
}

export async function fetchReviewedBoreLog(jobId: string, rblId: string): Promise<ReviewedBoreLogView> {
  return composeReviewedBoreLog(await getProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}`));
}

/** Append manually-reviewed rows (extraction_method MANUAL_ENTRY — human-supplied, NOT OCR). */
export async function addReviewedRows(
  jobId: string, rblId: string, sourceUploadId: string, rows: readonly ManualRowInput[],
): Promise<unknown> {
  return postProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/rows`, {
    rows: rows.map((r) => ({
      row_id: r.rowId,
      source_upload_id: sourceUploadId,
      raw: { start_station: r.startStation, end_station: r.endStation, ...(r.note ? { note: r.note } : {}) },
      normalized: { start_station: r.startStation, end_station: r.endStation },
      extraction_method: 'MANUAL_ENTRY',
    })),
  });
}

export async function reviewReviewedRow(
  jobId: string, rblId: string, rowId: string,
  decision: { toStatus: ReviewStatus; reason?: string; correctedValues?: Record<string, unknown> },
): Promise<unknown> {
  return postProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/rows/${rowId}/review`, {
    to_status: decision.toStatus,
    reason: decision.reason ?? null,
    corrected_values: decision.correctedValues ?? null,
  });
}

export async function defineSegmentGroup(
  jobId: string, rblId: string, groupId: string, memberRowIds: readonly string[], relation: SegmentRelation,
): Promise<unknown> {
  return postProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/groups`, {
    group_id: groupId,
    member_row_ids: [...memberRowIds],
    relation,
  });
}

export async function setGroupingStatus(
  jobId: string, rblId: string, groupId: string, toStatus: GroupingStatus, reason?: string,
): Promise<unknown> {
  return postProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/groups/${groupId}/status`, {
    to_status: toStatus,
    reason: reason ?? null,
  });
}

export async function fetchReviewQueue(jobId: string, rblId: string): Promise<ReviewQueueView> {
  return composeReviewQueue(
    await getProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/review-queue`));
}

// ====================================================================================================
// Slice C — uploaded-corpus engine-handoff readiness (read-only; the API renders nothing / creates nothing).
// ====================================================================================================

export interface EngineHandoffBlocker {
  readonly code: string;
  readonly reason: string;
}

export interface EngineHandoffReadinessView {
  readonly status: string;
  readonly runnable: boolean;
  readonly hasPlanPdf: boolean;
  readonly hasEngineReadyReviewedBoreLog: boolean;
  readonly blockers: readonly EngineHandoffBlocker[];
}

export function composeEngineHandoffReadiness(doc: unknown): EngineHandoffReadinessView {
  const d = asRecord(doc, 'engine-handoff');
  const checks = (typeof d.checks === 'object' && d.checks !== null && !Array.isArray(d.checks))
    ? (d.checks as Record<string, unknown>) : {};
  const rawBlockers = Array.isArray(d.blockers) ? d.blockers : [];
  const blockers: EngineHandoffBlocker[] = rawBlockers
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ code: str(b.code), reason: str(b.reason) }));
  return {
    status: str(d.status),
    runnable: d.runnable === true,
    hasPlanPdf: checks.has_plan_pdf === true,
    hasEngineReadyReviewedBoreLog: checks.has_engine_ready_reviewed_bore_log === true,
    blockers,
  };
}

/** Read-only uploaded-corpus engine-handoff readiness for a job. Throws on a failed live read (no mock). */
export async function fetchEngineHandoffReadiness(jobId: string): Promise<EngineHandoffReadinessView> {
  return composeEngineHandoffReadiness(await getProductJson(`/v2/product/jobs/${jobId}/engine-handoff`));
}

// ====================================================================================================
// M2 Slice 2 — uploaded PLAN_PDF page display + human-confirmed source-anchor capture.
// The page raster is the plan AS-IS (NO redline drawn); creating a source anchor RECORDS geometry only —
// it does NOT render a redline. All reads/writes throw on failure (no mock fallback).
// ====================================================================================================

export interface PlanPageBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface PlanPageInfo {
  readonly pageNumber: number;
  readonly bounds: PlanPageBounds;        // PDF DISPLAY-space (the space control points are stored in)
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
}

export interface PlanPageMetadata {
  readonly planUploadId: string;
  readonly pageCount: number;
  readonly pages: readonly PlanPageInfo[];
}

export function composePlanPageMetadata(doc: unknown): PlanPageMetadata {
  const d = asRecord(doc, 'plan-pages');
  const rawPages = Array.isArray(d.pages) ? d.pages : [];
  const pages: PlanPageInfo[] = rawPages
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p))
    .map((p) => {
      const b = (typeof p.bounds === 'object' && p.bounds !== null && !Array.isArray(p.bounds))
        ? (p.bounds as Record<string, unknown>) : {};
      return {
        pageNumber: int(p.page_number),
        bounds: { x0: int(b.x0), y0: int(b.y0), x1: int(b.x1), y1: int(b.y1) },
        width: int(p.width),
        height: int(p.height),
        zoom: int(p.zoom),
        rasterWidth: int(p.raster_width),
        rasterHeight: int(p.raster_height),
      };
    });
  return { planUploadId: str(d.plan_upload_id), pageCount: int(d.page_count), pages };
}

/** Read-only PLAN_PDF page metadata (page_count + per-page display-space bounds + raster size). The web
 *  maps click pixels back to display-space using a page's bounds. Throws on a failed live read (no mock). */
export async function fetchPlanPageMetadata(jobId: string, planUploadId: string): Promise<PlanPageMetadata> {
  return composePlanPageMetadata(
    await getProductJson(`/v2/product/jobs/${jobId}/plan-pages/${planUploadId}`));
}

async function getProductBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiBase()}${path}`, { method: 'GET', cache: 'no-store', headers: headers() });
  if (!response.ok) throw new Error(`product GET ${path} failed with HTTP ${response.status}`);
  return response.blob();
}

/** Read-only PNG raster of ONE uploaded PLAN_PDF page (the plan AS-IS — NO redline overlay). Header-
 *  bearing fetch -> Blob (a plain <img src> cannot send the identity headers). Throws on non-OK (no mock). */
export async function fetchPlanPageRasterBlob(
  jobId: string, planUploadId: string, pageNumber: number,
): Promise<Blob> {
  return getProductBlob(`/v2/product/jobs/${jobId}/plan-pages/${planUploadId}/${pageNumber}/raster`);
}

export interface ControlPointInput {
  readonly x: number;          // PDF DISPLAY-space coordinates (NOT screen pixels)
  readonly y: number;
}

export interface SourceAnchorIdentityInput {
  readonly station?: string;
  readonly structureLabel?: string;
  readonly note?: string;
}

export interface SourceAnchorBlocker {
  readonly code: string;
  readonly reason: string;
}

export interface SourceAnchorResult {
  readonly sourceAnchorId: string;
  readonly status: string;            // VALIDATED | REJECTED
  readonly renderable: boolean;
  readonly provenance: string;        // HUMAN_CONFIRMED_CONTROL_POINTS
  readonly coordinateSpace: string;   // pdf_display_space
  readonly blockers: readonly SourceAnchorBlocker[];
}

export function composeSourceAnchorResult(doc: unknown): SourceAnchorResult {
  const d = asRecord(doc, 'source-anchor');
  const rawBlockers = Array.isArray(d.blockers) ? d.blockers : [];
  const blockers: SourceAnchorBlocker[] = rawBlockers
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ code: str(b.code), reason: str(b.reason) }));
  return {
    sourceAnchorId: str(d.source_anchor_id),
    status: str(d.status),
    renderable: d.renderable === true,
    provenance: str(d.provenance),
    coordinateSpace: str(d.coordinate_space),
    blockers,
  };
}

export interface SourceAnchorCreateInput {
  readonly sourceAnchorId: string;
  readonly planUploadId: string;
  readonly reviewedBoreLogId: string;
  readonly pageNumber: number;
  readonly controlPoints: readonly ControlPointInput[];   // ordered; >= 2; PDF display-space
  readonly groupId?: string | null;
  readonly rowIds?: readonly string[];
  readonly startIdentity?: SourceAnchorIdentityInput;
  readonly endIdentity?: SourceAnchorIdentityInput;
  readonly notes?: string;
}

function identityBody(identity?: SourceAnchorIdentityInput): Record<string, unknown> | null {
  if (!identity) return null;
  // coordinate-FREE identity only (station / structure label / note) — never x/y geometry
  return {
    station: identity.station ?? null,
    structure_label: identity.structureLabel ?? null,
    note: identity.note ?? null,
  };
}

/** Create + validate a HUMAN-confirmed source anchor (ordered PDF display-space control points). Returns
 *  the backend's validation result (VALIDATED/REJECTED + named blockers). This RECORDS geometry only — it
 *  does NOT render a redline. Throws on a failed live write (no mock fallback). */
export async function createSourceAnchor(
  jobId: string, input: SourceAnchorCreateInput,
): Promise<SourceAnchorResult> {
  return composeSourceAnchorResult(await postProductJson(`/v2/product/jobs/${jobId}/source-anchors`, {
    source_anchor_id: input.sourceAnchorId,
    plan_upload_id: input.planUploadId,
    reviewed_bore_log_id: input.reviewedBoreLogId,
    page_number: input.pageNumber,
    control_points: input.controlPoints.map((p) => ({ x: p.x, y: p.y })),
    group_id: input.groupId ?? null,
    row_ids: input.rowIds ? [...input.rowIds] : null,
    start_identity: identityBody(input.startIdentity),
    end_identity: identityBody(input.endIdentity),
    notes: input.notes ?? null,
  }));
}

// --- M2 Slice 3: render a validated source anchor -> real redline bundle + job-scoped artifact reads --- //

export interface JobArtifactRef {
  readonly logId: string;
  readonly path: string;
  readonly sha256: string | null;
  readonly bytes: number;
  readonly kind: string;
}

export interface SourceAnchorRenderResult {
  readonly status: string;            // SUCCEEDED on a real publish
  readonly bundleId: string | null;
  readonly bundleOrigin: string;      // HUMAN_CONFIRMED_SOURCE_ANCHOR
  readonly artifactCount: number;
  readonly sourceAnchorIds: readonly string[];
  readonly artifacts: readonly JobArtifactRef[];
}

function composeArtifactRefList(value: unknown): JobArtifactRef[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null && !Array.isArray(a))
    .map((a) => ({
      logId: str(a.log_id), path: str(a.path), sha256: strOrNull(a.sha256),
      bytes: int(a.bytes), kind: str(a.kind),
    }));
}

export function composeSourceAnchorRenderResult(doc: unknown): SourceAnchorRenderResult {
  const d = asRecord(doc, 'source-anchor-render');
  return {
    status: str(d.status),
    bundleId: strOrNull(d.bundle_id),
    bundleOrigin: str(d.bundle_origin),
    artifactCount: int(d.artifact_count),
    sourceAnchorIds: strList(d.source_anchor_ids),
    artifacts: composeArtifactRefList(d.artifacts),
  };
}

export function composeJobArtifacts(doc: unknown): JobArtifactRef[] {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return [];
  return composeArtifactRefList((doc as Record<string, unknown>).artifacts);
}

/** Render the job's VALIDATED source anchors into a real `mock_example:false` redline bundle (dashed,
 *  human-adjustable) and set the job's output slots. Records human-confirmed geometry only — NOT automatic
 *  engine placement. Throws on a failed live write (no mock fallback). */
export async function renderSourceAnchor(
  jobId: string, sourceAnchorId: string,
): Promise<SourceAnchorRenderResult> {
  return composeSourceAnchorRenderResult(
    await postProductJson(`/v2/product/jobs/${jobId}/source-anchors/${sourceAnchorId}/render`, {}));
}

/** List a job's manifest-backed FINAL_REDLINE_PNG artifacts (job-scoped, unlike the configured-job gallery). */
export async function fetchJobArtifacts(jobId: string): Promise<JobArtifactRef[]> {
  return composeJobArtifacts(await getProductJson(`/v2/product/jobs/${jobId}/artifacts`));
}

/** Header-bearing fetch of ONE job artifact PNG -> Blob (a plain <img src> cannot send identity headers). */
export async function fetchJobArtifactBlob(jobId: string, path: string): Promise<Blob> {
  return getProductBlob(`/v2/product/jobs/${jobId}/artifacts/${path}`);
}

// ====================================================================================================
// Recognized-corpus AUTOMATIC handoff — positive sha256 recognition -> the EXISTING deterministic engine
// render, served as a job-local FINAL_REDLINE_PNG bundle. NO manual point-clicking. Throws on failure.
// ====================================================================================================

export interface RecognizedCorpusHandoffView {
  readonly status: string;                 // RUNNABLE | BLOCKED
  readonly runnable: boolean;
  readonly recognizedCorpusId: string | null;       // generic id (NOT a customer/location/project name)
  readonly recognizedPackageLabel: string | null;   // generic label, e.g. "Recognized uploaded project package"
  readonly deterministicLogId: string | null;
  readonly renderSheets: readonly number[];
  readonly renderCommit: string | null;
  readonly blockers: readonly EngineHandoffBlocker[];
}

export function composeRecognizedCorpusHandoff(doc: unknown): RecognizedCorpusHandoffView {
  const d = asRecord(doc, 'recognized-corpus-handoff');
  const rawBlockers = Array.isArray(d.blockers) ? d.blockers : [];
  const blockers: EngineHandoffBlocker[] = rawBlockers
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ code: str(b.code), reason: str(b.reason) }));
  const rawSheets = Array.isArray(d.render_sheets) ? d.render_sheets : [];
  return {
    status: str(d.status),
    runnable: d.runnable === true,
    recognizedCorpusId: strOrNull(d.recognized_corpus_id),
    recognizedPackageLabel: strOrNull(d.recognized_package_label),
    deterministicLogId: strOrNull(d.deterministic_log_id),
    renderSheets: rawSheets.filter((n): n is number => typeof n === 'number'),
    renderCommit: strOrNull(d.render_commit),
    blockers,
  };
}

/** Read-only recognized-corpus auto-handoff readiness. RUNNABLE only for a positively-recognized corpus. */
export async function fetchRecognizedCorpusHandoff(jobId: string): Promise<RecognizedCorpusHandoffView> {
  return composeRecognizedCorpusHandoff(
    await getProductJson(`/v2/product/jobs/${jobId}/recognized-corpus-handoff`));
}

export interface RecognizedCorpusRenderResult {
  readonly status: string;
  readonly bundleId: string | null;
  readonly bundleOrigin: string;           // DETERMINISTIC_RECOGNIZED_CORPUS
  readonly recognizedCorpusId: string | null;
  readonly recognizedPackageLabel: string | null;
  readonly deterministicLogId: string | null;
  readonly renderCommit: string | null;
  readonly artifactCount: number;
  readonly artifacts: readonly JobArtifactRef[];
}

export function composeRecognizedCorpusRenderResult(doc: unknown): RecognizedCorpusRenderResult {
  const d = asRecord(doc, 'recognized-corpus-render');
  return {
    status: str(d.status),
    bundleId: strOrNull(d.bundle_id),
    bundleOrigin: str(d.bundle_origin),
    recognizedCorpusId: strOrNull(d.recognized_corpus_id),
    recognizedPackageLabel: strOrNull(d.recognized_package_label),
    deterministicLogId: strOrNull(d.deterministic_log_id),
    renderCommit: strOrNull(d.render_commit),
    artifactCount: int(d.artifact_count),
    artifacts: composeArtifactRefList(d.artifacts),
  };
}

/** Run the recognized-corpus auto-handoff: publish the EXISTING deterministic engine render for the
 *  recognized log as a job-local FINAL_REDLINE_PNG bundle (engine-derived, NOT human-clicked). Throws on a
 *  failed live write (incl. 409 when not recognized/runnable). */
export async function runRecognizedCorpusRender(jobId: string): Promise<RecognizedCorpusRenderResult> {
  return composeRecognizedCorpusRenderResult(
    await postProductJson(`/v2/product/jobs/${jobId}/recognized-corpus-handoff/render`, {}));
}

// ====================================================================================================
// Phase 6 — REVIEW acceptance lane. The uploaded-corpus ENGINE generates a SOURCE-SUPPORTED REVIEW redline
// candidate from the job's own plan + reviewed bore-log; a human ACCEPTS or REJECTS the engine candidate
// WITHOUT drawing geometry. REVIEW is a first-class product output, never AUTO. The accepted FINAL_REDLINE_PNG
// is retrieved via the job-artifact reads above. All reads/writes throw on failure (no mock fallback).
// ====================================================================================================

export interface ReviewCandidateBundle {
  readonly bundleId: string | null;
  readonly bundleOrigin: string;          // UPLOADED_CORPUS_ENGINE
  readonly artifactCount: number;
  readonly artifacts: readonly JobArtifactRef[];
}

export interface ReviewWhyNotAuto {
  readonly autoBlocked: boolean;
  readonly blockers: readonly string[];   // e.g. NO_PER_BORE_TERMINI, MATCHLINE_CONTINUATION_UNVERIFIED
  readonly engineReason: string | null;
}

export interface ReviewCandidateView {
  readonly candidateId: string | null;
  readonly tier: string | null;           // REVIEW | AUTO | ABSTAIN
  readonly status: string | null;         // REVIEW_CANDIDATE | REVIEW_ACCEPTED | REVIEW_REJECTED | ABSTAINED
  readonly provenance: string | null;     // ENGINE_GENERATED_REVIEW_CANDIDATE | ENGINE_GENERATED_HUMAN_ACCEPTED_REVIEW
  readonly placementStatus: string | null;
  readonly engineReason: string | null;
  readonly noManualGeometry: boolean;
  readonly referencedSheets: readonly number[];
  readonly renderSheets: readonly number[];
  readonly caveats: readonly string[];
  readonly matchlineContinuity: string | null;
  readonly whyNotAuto: ReviewWhyNotAuto | null;
  readonly rejectionReason: string | null;
  readonly blockers: readonly EngineHandoffBlocker[];
  readonly bundle: ReviewCandidateBundle | null;
}

export interface ReviewCandidateReport {
  readonly tier: string | null;           // REVIEW | AUTO | ABSTAIN | null (not runnable)
  readonly runnable: boolean;
  readonly candidateId: string | null;
  readonly record: ReviewCandidateView | null;
  readonly blockers: readonly EngineHandoffBlocker[];
}

function numList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : [];
}

function composeBlockerList(value: unknown): EngineHandoffBlocker[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ code: str(b.code), reason: str(b.reason) }));
}

function composeReviewBundle(value: unknown): ReviewCandidateBundle | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const b = value as Record<string, unknown>;
  return {
    bundleId: strOrNull(b.bundle_id),
    bundleOrigin: str(b.bundle_origin),
    artifactCount: int(b.artifact_count),
    artifacts: composeArtifactRefList(b.artifacts),
  };
}

function composeWhyNotAuto(value: unknown): ReviewWhyNotAuto | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const w = value as Record<string, unknown>;
  return { autoBlocked: w.auto_blocked === true, blockers: strList(w.blockers),
           engineReason: strOrNull(w.engine_reason) };
}

/** Compose ONE acceptance record (the shape returned by get/accept/reject and nested in the report). */
export function composeReviewCandidate(doc: unknown): ReviewCandidateView {
  const d = asRecord(doc, 'review-candidate');
  return {
    candidateId: strOrNull(d.candidate_id),
    tier: strOrNull(d.tier),
    status: strOrNull(d.status),
    provenance: strOrNull(d.provenance),
    placementStatus: strOrNull(d.placement_status),
    engineReason: strOrNull(d.engine_reason),
    noManualGeometry: d.no_manual_geometry === true,
    referencedSheets: numList(d.referenced_sheets),
    renderSheets: numList(d.render_sheets),
    caveats: strList(d.caveats),
    matchlineContinuity: strOrNull(d.matchline_continuity),
    whyNotAuto: composeWhyNotAuto(d.why_not_auto),
    rejectionReason: strOrNull(d.rejection_reason),
    blockers: composeBlockerList(d.blockers),
    bundle: composeReviewBundle(d.bundle),
  };
}

/** Compose the generate() report ({ tier, runnable, candidate_id, record, blockers }). */
export function composeReviewCandidateReport(doc: unknown): ReviewCandidateReport {
  const d = asRecord(doc, 'review-candidate-report');
  const hasRecord = typeof d.record === 'object' && d.record !== null && !Array.isArray(d.record);
  return {
    tier: strOrNull(d.tier),
    runnable: d.runnable === true,
    candidateId: strOrNull(d.candidate_id),
    record: hasRecord ? composeReviewCandidate(d.record) : null,
    blockers: composeBlockerList(d.blockers),
  };
}

export function composeReviewCandidateList(doc: unknown): ReviewCandidateView[] {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return [];
  const list = (doc as Record<string, unknown>).review_candidates;
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null && !Array.isArray(r))
    .map((r) => composeReviewCandidate(r));
}

/** Ask the engine for this job's redline candidate + record its honest tier. A REVIEW candidate is rendered
 *  (real FINAL_REDLINE_PNG) and held for human accept/reject; an engine ABSTAIN is recorded with its named
 *  blocker; missing inputs report blockers with no record. Never promotes REVIEW to AUTO. Throws on failure. */
export async function generateReviewCandidate(jobId: string): Promise<ReviewCandidateReport> {
  return composeReviewCandidateReport(
    await postProductJson(`/v2/product/jobs/${jobId}/review-candidates/generate`, {}));
}

export async function listReviewCandidates(jobId: string): Promise<ReviewCandidateView[]> {
  return composeReviewCandidateList(await getProductJson(`/v2/product/jobs/${jobId}/review-candidates`));
}

export async function getReviewCandidate(jobId: string, candidateId: string): Promise<ReviewCandidateView> {
  return composeReviewCandidate(
    await getProductJson(`/v2/product/jobs/${jobId}/review-candidates/${candidateId}`));
}

/** ACCEPT the engine-generated REVIEW candidate as-is (no geometry drawn): -> REVIEW_ACCEPTED, provenance
 *  ENGINE_GENERATED_HUMAN_ACCEPTED_REVIEW. The rendered artifacts are unchanged. Throws on failure. */
export async function acceptReviewCandidate(jobId: string, candidateId: string): Promise<ReviewCandidateView> {
  return composeReviewCandidate(
    await postProductJson(`/v2/product/jobs/${jobId}/review-candidates/${candidateId}/accept`, {}));
}

/** REJECT the engine-generated REVIEW candidate (needs correction) with a required reason. A rejected
 *  candidate stays rejected and can never be silently accepted. Throws on failure (400 if reason empty). */
export async function rejectReviewCandidate(
  jobId: string, candidateId: string, reason: string,
): Promise<ReviewCandidateView> {
  return composeReviewCandidate(
    await postProductJson(`/v2/product/jobs/${jobId}/review-candidates/${candidateId}/reject`, { reason }));
}
