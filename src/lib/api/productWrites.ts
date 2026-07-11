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

export interface ProductJobSlots {
  readonly redlineManifest: boolean;
  readonly artifactBundle: boolean;
  readonly exportPackage: boolean;
}

export interface ProductJobDetail {
  readonly jobId: string;
  readonly status: string;
  readonly uploads: readonly ProductUploadRecord[];
  readonly slots: ProductJobSlots;
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

/** Handwritten/scanned bore-log affordances gate (W3): jpg/png in the bore-log picker, the
 *  extraction-assistant upload copy, and the source-page preview panel. Default OFF/absent — with the flag
 *  unset every one of those three stays byte-identical to the pre-W3 behavior. Same NEXT_PUBLIC_* pattern as
 *  internalToolingEnabled() / fieldEvidence's thumbs gate. */
export function handwrittenBorelogEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_TL2_HANDWRITTEN_BORELOG ?? '').trim() === '1';
}

/** Source-backed route-proposal + explicit-adoption gate (Ticket W-C): the "Search for engineering route"
 *  affordance on the source-anchor capture surface, the proposal overlay/panel, and the route_adoption field
 *  on the source-anchor create write. Default OFF/absent — with the flag unset the capture component fetches
 *  and renders byte-identically to today (no source-route-proposals request is ever issued). */
export function sourceRouteAdoptionEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_TL2_SOURCE_ROUTE_ADOPTION ?? '').trim() === '1';
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
  const rawSlots = (typeof j.slots === 'object' && j.slots !== null && !Array.isArray(j.slots))
    ? (j.slots as Record<string, unknown>) : {};
  const slots: ProductJobSlots = {
    redlineManifest: rawSlots.redline_manifest != null,
    artifactBundle: rawSlots.artifact_bundle != null,
    exportPackage: rawSlots.export_package != null,
  };
  return { jobId: str(j.job_id), status: str(j.status), uploads, slots };
}

// --- live reads/writes (throw on failure; never mock) ---------------------------------------------- //

async function getProductJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, { method: 'GET', cache: 'no-store', headers: headers() });
  if (!response.ok) throw new Error(`product GET ${path} failed with HTTP ${response.status}`);
  return response.json();
}

// Best-effort server-stated reason (the backend's HTTPException `detail` string) so a refusal surfaces to
// the user as the honest named blocker (e.g. BORE_LOG_FORMAT_UNRECOGNIZED with its specific reasons)
// instead of a bare status code. Never throws; never fabricates a reason when the body carries none.
async function serverDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string' && detail.trim()) return `: ${detail.trim().slice(0, 400)}`;
  } catch {
    // no readable JSON body — the status line is all we honestly know
  }
  return '';
}

// Extract a machine-readable refusal CODE from an error response body, tolerant of every shape a backend
// might reasonably use for a named refusal: (a) this repo's own `_to_http` convention — `detail` a string
// with the code as its leading token, e.g. `"ROUTE_ADOPTION_STALE: Proposal expired"` (product_pipeline_
// routes.py `_to_http`) — remains the PRIMARY expected shape; (b) `detail` as an object carrying a `code`
// field; (c) a top-level `code` field on the body itself. Checked in that order (most-specific/most-likely
// first); returns null when none match — never guesses a code that isn't actually present.
function extractRefusalCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const detail = b.detail;
  if (typeof detail === 'string' && detail.trim()) {
    const m = /^([A-Z][A-Z0-9_]*)/.exec(detail.trim());
    if (m) return m[1];
  }
  if (typeof detail === 'object' && detail !== null && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    if (typeof d.code === 'string' && d.code.trim()) return d.code.trim();
  }
  if (typeof b.code === 'string' && b.code.trim()) return b.code.trim();
  return null;
}

// Thrown by postProductJson on a non-OK response. Extends Error (so every existing `e instanceof Error` /
// `e.message` call site is unaffected) and additively carries the extractRefusalCode() result so a caller
// that needs the STRUCTURED code (not just the human-readable message) — e.g. routeAdoptionRefusalCode below
// — doesn't have to re-derive it from a string that may not even contain it (shape (b)/(c) above).
export class ProductApiError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'ProductApiError';
    this.code = code;
  }
}

async function postProductJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    // The body can only be read once — do it here (rather than delegating to serverDetail, which other call
    // sites still use unmodified) so both the human-readable text AND the structured code come from the same
    // read.
    let text = '';
    let code: string | null = null;
    try {
      const errBody: unknown = await response.json();
      const detail = (errBody as { detail?: unknown } | null)?.detail;
      if (typeof detail === 'string' && detail.trim()) text = `: ${detail.trim().slice(0, 400)}`;
      code = extractRefusalCode(errBody);
    } catch {
      // no readable JSON body — the status line is all we honestly know
    }
    throw new ProductApiError(`product POST ${path} failed with HTTP ${response.status}${text}`, code);
  }
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

export interface ProductJobDeleteResult {
  readonly deleted: boolean;
  readonly jobId: string;
  readonly statusBeforeDelete: string | null;
}

/** Permanently delete the tenant's job (record + uploads + all artifacts / stage subdirs). Tenant-safe +
 *  path-safe server-side. Uses POST (not DELETE) so no CORS method change is needed. Throws on a failed live
 *  write (404 missing / 403 cross-tenant); never a mock fallback. */
export async function deleteProductJob(jobId: string): Promise<ProductJobDeleteResult> {
  const d = asRecord(await postProductJson(`/v2/product/jobs/${jobId}/delete`, {}), 'job-delete');
  return {
    deleted: d.deleted === true,
    jobId: str(d.job_id),
    statusBeforeDelete: strOrNull(d.status_before_delete),
  };
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

// Per-cell provenance status (W3): whether ONE canonical field was actually read off the source, and how.
// 'VARIED' is depth_ft/boc_ft-specific — readable per-station values disagreed across the run, so the
// row-level value stays null and the disagreement lives in stationReadings; the field is still editable
// like any other (a human picks/enters the right number), it just isn't a single flat "not present" absence.
export type CellStatus = 'READ' | 'UNREADABLE' | 'NOT_PRESENT' | 'VARIED';

export interface CellEvidenceView {
  readonly status: CellStatus;
  readonly pageIndex: number | null;
  readonly region: Readonly<Record<string, number>> | null;
  readonly verbatim: string | null;
}

export interface SourceEvidenceView {
  readonly sha256: string | null;
  readonly file: string | null;
  readonly pageIndex: number | null;
  readonly region: Readonly<Record<string, number>> | null;
}

/** One reading taken at a point along the bore (e.g. a handwritten log's per-station depth/BOC ticks).
 *  Optional/nullable throughout — an OCR'd or partially-legible reading may carry only some fields. */
export interface StationReadingView {
  readonly station: string | null;
  readonly depthFt: number | null;
  readonly bocFt: number | null;
  readonly note: string | null;
}

export interface ReviewedRowView {
  readonly rowId: string;
  readonly startStation: string;
  readonly endStation: string;
  readonly extractionMethod: string;
  readonly reviewStatus: string;
  readonly reason: string | null;
  // Source-backed raw bore-log fields (present only when the file/extractor carried them; null otherwise —
  // the UI shows an honest "not available", never an invented value).
  readonly footageFt: number | null;
  readonly depthMinFt: number | null;
  readonly bocMinFt: number | null;
  readonly printRaw: string | null;
  readonly sheetRefs: readonly number[];
  readonly sourceFile: string | null;
  readonly date: string | null;
  readonly crew: string | null;
  // --- W3 (handwritten ingestion) additions — all optional/nullable; older rows without them render
  // gracefully via the same honest-absence rules as the fields above. ---
  readonly boreId: string | null;
  readonly footageDerivation: string | null;   // 'DERIVED_FROM_STATIONS' when footageFt was computed, not read
  readonly depthFt: number | null;
  readonly bocFt: number | null;
  readonly notes: string | null;
  readonly stationReadings: readonly StationReadingView[];
  readonly sourceEvidence: SourceEvidenceView | null;
  readonly cellEvidence: Readonly<Record<string, CellEvidenceView>>;
  readonly confidence: 'LOW' | 'MEDIUM' | null;
  readonly warnings: readonly string[];
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

const CELL_STATUSES: readonly CellStatus[] = ['READ', 'UNREADABLE', 'NOT_PRESENT', 'VARIED'];

/** A region is whatever bounds-ish shape the extractor carried (pixel box, PDF-space box, …) — captured
 *  presence-only (numeric keys kept, everything else dropped) since the UI never draws it, only notes it
 *  exists as part of the evidence trail. */
function regionOrNull(value: unknown): Record<string, number> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  let any = false;
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number' && Number.isFinite(v)) { out[k] = v; any = true; }
  }
  return any ? out : null;
}

function composeSourceEvidence(value: unknown): SourceEvidenceView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  return {
    sha256: strOrNull(d.sha256),
    file: strOrNull(d.file),
    pageIndex: numOrNull(d.page_index),
    region: regionOrNull(d.region),
  };
}

// VARIED is meaningful ONLY for depth_ft/boc_ft (per-station readings can legitimately disagree there — see
// StationReadingView). Any OTHER field arriving as VARIED, or ANY field arriving with a status outside the
// known enum, is non-conforming wire data: it is enforced HERE — the single decoder — down to NOT_PRESENT
// plus a row-level warning, so no renderer can accidentally show a bogus "varies" chip on e.g. a bore_id.
const VARIED_ALLOWED_FIELDS = new Set(['depth_ft', 'boc_ft']);

interface CellEvidenceCompose {
  readonly view: Record<string, CellEvidenceView>;
  readonly warnings: readonly string[];
}

function composeCellEvidence(value: unknown): CellEvidenceCompose {
  const view: Record<string, CellEvidenceView> = {};
  const warnings: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { view, warnings };
  for (const [field, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const rawStatus = e.status;
    const recognized = (CELL_STATUSES as readonly string[]).includes(rawStatus as string);
    const conforms = recognized && (rawStatus !== 'VARIED' || VARIED_ALLOWED_FIELDS.has(field));
    let status: CellStatus;
    if (conforms) {
      status = rawStatus as CellStatus;
    } else {
      status = 'NOT_PRESENT';
      warnings.push(`Non-conforming evidence status for ${field} — treated as not present`);
    }
    view[field] = {
      status,
      pageIndex: numOrNull(e.page_index),
      region: regionOrNull(e.region),
      verbatim: strOrNull(e.verbatim),
    };
  }
  return { view, warnings };
}

// A station_readings entry's fields arrive as NESTED Cell objects ({value, verbatim, status, ...}) — same
// shape family as cell_evidence — NOT raw primitives. Unwrap to .value, falling back to .verbatim, so the
// readings sub-table renders the actual reading instead of dashes/"[object Object]". A raw primitive
// (older backend) passes straight through untouched.
function cellValue(raw: unknown): unknown {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const c = raw as Record<string, unknown>;
    if ('value' in c) return c.value ?? (('verbatim' in c) ? c.verbatim : null);
    if ('verbatim' in c) return c.verbatim;
  }
  return raw;
}

function composeStationReading(value: unknown): StationReadingView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  return {
    station: strOrNull(cellValue(d.station)),
    depthFt: numOrNull(cellValue(d.depth_ft)),
    bocFt: numOrNull(cellValue(d.boc_ft)),
    note: strOrNull(cellValue(d.note)),
  };
}

function composeStationReadings(value: unknown): StationReadingView[] {
  const list = Array.isArray(value) ? value : [];
  return list.map(composeStationReading).filter((r): r is StationReadingView => r !== null);
}

/** Compose ONE reviewed-bore-log row from its raw wire shape. Shared by the whole-RBL read and the
 *  per-row review response so both stay in sync. Every W3 field is optional-safe: an older row (or an
 *  older backend that hasn't landed the pinned shapes yet) simply composes with those fields null/empty. */
export function composeReviewedRow(value: unknown): ReviewedRowView {
  const row = asRecord(value, 'reviewed-row');
  const normalized = (typeof row.normalized === 'object' && row.normalized !== null)
    ? (row.normalized as Record<string, unknown>) : {};
  const raw = (typeof row.raw === 'object' && row.raw !== null)
    ? (row.raw as Record<string, unknown>) : {};
  const extraction = (typeof row.extraction === 'object' && row.extraction !== null)
    ? (row.extraction as Record<string, unknown>) : {};
  const review = (typeof row.review === 'object' && row.review !== null)
    ? (row.review as Record<string, unknown>) : {};
  const confidenceRaw = extraction.confidence;
  const confidence = confidenceRaw === 'LOW' || confidenceRaw === 'MEDIUM' ? confidenceRaw : null;
  const cells = composeCellEvidence(extraction.cell_evidence);
  return {
    rowId: str(row.row_id),
    startStation: str(normalized.start_station) || str(raw.start_station),
    endStation: str(normalized.end_station) || str(raw.end_station),
    extractionMethod: str(extraction.extraction_method),
    reviewStatus: str(review.status),
    reason: strOrNull(review.reason),
    footageFt: numOrNull(raw.footage_ft),
    depthMinFt: numOrNull(raw.depth_min_ft),
    bocMinFt: numOrNull(raw.boc_min_ft),
    printRaw: strOrNull(raw.print_raw),
    sheetRefs: numList(raw.sheet_refs),
    sourceFile: strOrNull(raw.source_file),
    date: strOrNull(raw.date),
    crew: strOrNull(raw.crew),
    boreId: strOrNull(raw.bore_id),
    footageDerivation: strOrNull(raw.footage_derivation),
    depthFt: numOrNull(raw.depth_ft),
    bocFt: numOrNull(raw.boc_ft),
    notes: strOrNull(raw.notes),
    stationReadings: composeStationReadings(raw.station_readings),
    sourceEvidence: composeSourceEvidence(extraction.source_evidence),
    cellEvidence: cells.view,
    confidence,
    // Server-reported warnings first, then any decoder-enforced non-conforming-evidence warnings.
    warnings: [...strList(extraction.warnings), ...cells.warnings],
  };
}

export function composeReviewedBoreLog(doc: unknown): ReviewedBoreLogView {
  const r = asRecord(doc, 'reviewed-bore-log');
  const rawRows = Array.isArray(r.rows) ? r.rows : [];
  const rows: ReviewedRowView[] = rawRows
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
    .map((row) => composeReviewedRow(row));
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

// --- W3: per-row review (edit/confirm surface). SAME route + SAME wire body as reviewReviewedRow above
// ({to_status, corrected_values, reason?} — the pre-existing route, confirmed by the landed backend wave)
// — the row editor's Confirm / Save-corrections actions use this one (client-facing {status, corrections}
// shape, translated to the wire body below); the legacy bulk-confirm / Advanced-manual-review Confirm/Reject
// actions keep using reviewReviewedRow untouched. ---

export type RowReviewDecision =
  | { readonly status: 'CONFIRMED'; readonly reason?: string }
  | { readonly status: 'CORRECTED'; readonly corrections: Readonly<Record<string, unknown>>; readonly reason?: string };

export interface RowReviewResult {
  readonly ok: boolean;
  // Composed updated row on success; null when the server doesn't support this route yet (see notAvailable).
  readonly row: ReviewedRowView | null;
  // True on a 404/405 from an older backend — the caller shows an honest "not available yet" message and
  // falls back to the legacy bulk-confirm path rather than treating this as a hard error.
  readonly notAvailable: boolean;
}

/** Confirm a row as-is, or save human corrections to it (nullable-aware — a correction value of `null`
 *  clears that field rather than being dropped). Never throws on 404/405 (an older backend without this
 *  route) — that comes back as `{ notAvailable: true }` so the caller can degrade gracefully. Any other
 *  non-OK response still throws (no mock fallback). */
export async function submitRowReview(
  jobId: string, rblId: string, rowId: string, decision: RowReviewDecision,
): Promise<RowReviewResult> {
  // Wire body matches the pre-existing route (same one reviewReviewedRow posts to): to_status +
  // corrected_values (CORRECTED only) + an optional reason. Field names inside corrected_values are the
  // backend snake_case raw keys the caller already builds (see FIELDS in ProductBoreRowEditor).
  const wireBody: Record<string, unknown> = decision.status === 'CONFIRMED'
    ? { to_status: 'CONFIRMED' }
    : { to_status: 'CORRECTED', corrected_values: decision.corrections };
  if (decision.reason) wireBody.reason = decision.reason;

  const response = await fetch(
    `${apiBase()}/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/rows/${rowId}/review`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify(wireBody),
    },
  );
  if (response.status === 404 || response.status === 405) {
    return { ok: false, row: null, notAvailable: true };
  }
  if (!response.ok) {
    throw new Error(`product POST row-review failed with HTTP ${response.status}${await serverDetail(response)}`);
  }
  const doc: unknown = await response.json();
  return { ok: true, row: composeReviewedRow(doc), notAvailable: false };
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
    // Omit the key entirely when there's no reason, rather than sending a bare null — some backends treat
    // "key absent" differently from "key present but null" (e.g. audit-log presence checks).
    ...(reason ? { reason } : {}),
  });
}

export async function fetchReviewQueue(jobId: string, rblId: string): Promise<ReviewQueueView> {
  return composeReviewQueue(
    await getProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/review-queue`));
}

function is409(err: unknown): boolean {
  return err instanceof Error && /HTTP 409/.test(err.message);
}

const REVIEWED_STATUSES = new Set(['CONFIRMED', 'CORRECTED']);

/** Idempotently ensure ONE CONFIRMED segment group exists for an RBL once ALL its rows are reviewed.
 *  Engine-readiness needs a CONFIRMED group, not just reviewed rows, and the per-row review surface (see
 *  submitRowReview) has no grouping step of its own — this closes that gap for BOTH the primary RBL and
 *  every fan-out sibling RBL, called after any successful per-row review AND inside a bulk "Confirm all
 *  remaining". Skips entirely (zero calls) when the RBL has no rows, has any not-yet-reviewed row, or
 *  already has a CONFIRMED group. Tolerates a 409 on the create call (group already exists — e.g. a prior
 *  partial/racing attempt) and proceeds straight to confirming it. Returns true iff grouping state actually
 *  changed, so the caller knows to re-read engine-readiness. */
export async function ensureGroupingConfirmed(
  jobId: string, rblId: string, rows: readonly ReviewedRowView[], groups: readonly ReviewedGroupView[],
): Promise<boolean> {
  if (rows.length === 0) return false;
  if (!rows.every((r) => REVIEWED_STATUSES.has(r.reviewStatus))) return false;
  if (groups.some((g) => g.groupingStatus === 'CONFIRMED')) return false;
  const groupId = 'g-1';
  try {
    await defineSegmentGroup(jobId, rblId, groupId, rows.map((r) => r.rowId), 'SEPARATE_BORE');
  } catch (e) {
    if (!is409(e)) throw e;
  }
  await setGroupingStatus(jobId, rblId, groupId, 'CONFIRMED');
  return true;
}

// --- W3 fan-out siblings: ONE shared pure id-probe + a read-only aggregate-readiness helper -------- //
//
// LIVE-VERIFIED (round 4) against the real backend: the primary RBL id is ALWAYS "rbl-main"/"rbl-N" (see
// rblFor in the gate) and NEVER itself carries a "-rN" suffix, so a probe that only extends the primary
// id's OWN suffix can never find anything — it was a no-op by construction. Re-POSTing extract() to
// rediscover siblings isn't safe either: the real backend rejects a redundant extract on an already
// fanned-out RBL (duplicate row_id). The ACTUAL naming is a deterministic, position-based scheme —
// "rbl-hw-p{pageIndex}-r{runIndex}" (0-based page, 1-based run), independent of the primary id — so a
// bounded probe of THAT pattern is what a fan-out job's fresh-session self-heal must use.

const MAX_HANDWRITTEN_FANOUT_PAGES = 6;
const MAX_HANDWRITTEN_FANOUT_RUNS_PER_PAGE = 8;

/** Bounded, read-only rediscovery of a handwritten multi-bore fan-out's sibling RBL ids when the backend's
 *  own created_reviewed_bore_logs isn't known this session (there is no listing endpoint). `exists(id)`
 *  decides whether a candidate id is real — the caller supplies it (typically a cheap fetchReviewQueue
 *  probe) so this function stays a pure sequencing/early-stop policy: stop a page's run loop at the first
 *  gap; stop trying further pages once a page's very first run doesn't exist either. Ordinary (non-fan-out)
 *  jobs cost exactly ONE failed check (page 0, run 1) and stop. */
export async function probeHandwrittenFanOutIds(exists: (candidateId: string) => Promise<boolean>): Promise<string[]> {
  const found: string[] = [];
  for (let page = 0; page < MAX_HANDWRITTEN_FANOUT_PAGES; page += 1) {
    let foundOnPage = false;
    for (let run = 1; run <= MAX_HANDWRITTEN_FANOUT_RUNS_PER_PAGE; run += 1) {
      // Intentionally sequential (not batched): each check's result decides whether the NEXT candidate
      // is even worth trying (early-stop policy).
      const candidateId = `rbl-hw-p${page}-r${run}`;
      if (await exists(candidateId)) { found.push(candidateId); foundOnPage = true; } else { break; }
    }
    if (!foundOnPage) break;
  }
  return found;
}

async function handwrittenFanOutIdExists(jobId: string, candidateId: string): Promise<boolean> {
  try { await fetchReviewQueue(jobId, candidateId); return true; } catch { return false; }
}

/** Read-only AGGREGATE engine-readiness for one uploaded bore-log file, accounting for handwritten
 *  multi-bore fan-out: when the primary RBL has fanned out into sibling RBLs that carry rows, readiness
 *  aggregates over those siblings (ALL must be engine-ready) and the primary — typically empty in a
 *  fan-out package — is excluded. No fanned-out siblings carrying rows -> falls back to the primary RBL's
 *  own engineReady, unchanged. Throws exactly like fetchReviewQueue on a failed PRIMARY read (same
 *  try/catch contract callers already have).
 *
 *  `probeAllowed` gates the (bounded, but still real) rediscovery probe — default `false` so a plain
 *  single-RBL job/caller costs exactly the one primary read, zero probe requests. Pass `true` only when the
 *  caller genuinely has no other way to know this file's fan-out state this session (mirrors the gate's own
 *  "extractCreatedRbls[i] is undefined" condition); a caller that already knows there's no fan-out (or
 *  doesn't have per-file session context at all, e.g. the workspace's generic job-level checks) passes
 *  `false` and skips the probe entirely — EXCEPT for one case handled here regardless: when the primary
 *  itself shows the "empty primary" fan-out SIGNATURE (not ready AND zero rows in every review-queue list —
 *  needing/passed/rejected all empty), a bounded probe still runs once. An ordinary single-RBL job's primary
 *  always carries its own rows (non-empty needing/passed/rejected), so it never matches this signature and
 *  still costs exactly one read — only a genuinely fanned-out job's (always-empty) primary pays the probe,
 *  even from a `probeAllowed=false` caller like the workspace's generic checks. */
export async function fetchAggregateEngineReadiness(
  jobId: string, primaryRblId: string, probeAllowed = false,
): Promise<boolean> {
  const primaryQueue = await fetchReviewQueue(jobId, primaryRblId);
  const primaryReady = primaryQueue.engineReady;
  const primaryIsEmptyFanOutSignature = !primaryReady
    && primaryQueue.rowsNeedingReview.length === 0
    && primaryQueue.rowsReviewPassed.length === 0
    && primaryQueue.rowsRejected.length === 0;
  if (!probeAllowed && !primaryIsEmptyFanOutSignature) return primaryReady;
  const siblingIds = await probeHandwrittenFanOutIds((id) => handwrittenFanOutIdExists(jobId, id));
  const siblingsWithRows: boolean[] = [];
  for (const candidateId of siblingIds) {
    try {
      const srbl = await fetchReviewedBoreLog(jobId, candidateId);
      if (srbl.rows.length > 0) siblingsWithRows.push((await fetchReviewQueue(jobId, candidateId)).engineReady);
    } catch { /* skip — id existed a moment ago but a full read failed; treat as not-counted */ }
  }
  return siblingsWithRows.length > 0 ? siblingsWithRows.every(Boolean) : primaryReady;
}

// One reviewed-bore-log the extraction call created — fan-out for a handwritten multi-bore package (one
// uploaded file, several detected bores). `sourceUploadId`/`rowId`/`pageIndex`/`runIndex` are each optional
// (an older backend may report the id alone); array is in creation order.
export interface CreatedReviewedBoreLog {
  readonly reviewedBoreLogId: string;
  readonly sourceUploadId: string | null;
  readonly rowId: string | null;
  readonly pageIndex: number | null;
  readonly runIndex: number | null;
}

// `undefined` ONLY when the wire key itself is absent (an older backend that hasn't landed this field) —
// the caller's bounded id-probe fallback fires ONLY on that `undefined`. A present-but-empty array (or one
// containing only the just-extracted RBL) is the backend AUTHORITATIVELY reporting "no siblings": that
// composes to `[]`, not `undefined`, so the caller renders no sibling cards and issues zero probe requests.
function composeCreatedReviewedBoreLogs(value: unknown): CreatedReviewedBoreLog[] | undefined {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
    .map((x) => ({
      reviewedBoreLogId: str(x.reviewed_bore_log_id),
      sourceUploadId: strOrNull(x.source_upload_id),
      rowId: strOrNull(x.row_id),
      pageIndex: numOrNull(x.page_index),
      runIndex: numOrNull(x.run_index),
    }))
    .filter((x) => x.reviewedBoreLogId !== '');
}

export interface ExtractRowsResult {
  readonly extractedCount: number;
  readonly extractedRowIds: readonly string[];
  // See composeCreatedReviewedBoreLogs: undefined = field absent (older backend, probe fallback applies);
  // an array (possibly empty) = authoritative fan-out siblings, no probe.
  readonly createdReviewedBoreLogs: readonly CreatedReviewedBoreLog[] | undefined;
}

/** Deterministic, read-only TABLE extraction of the reviewed-bore-log's SOURCE upload (.xlsx/.csv) into
 *  UNTRUSTED extracted rows (extraction_method TABLE_IMPORT, status UNREVIEWED). NO OCR, NO fabricated
 *  confidence, NO geometry — a human still reviews each row before placement. Throws on failure (no mock). */
export async function extractBoreLogRows(jobId: string, rblId: string): Promise<ExtractRowsResult> {
  const d = asRecord(
    await postProductJson(`/v2/product/jobs/${jobId}/reviewed-bore-logs/${rblId}/extract`, {}),
    'extract-rows');
  return {
    extractedCount: int(d.extracted_count),
    extractedRowIds: strList(d.extracted_row_ids),
    createdReviewedBoreLogs: composeCreatedReviewedBoreLogs(d.created_reviewed_bore_logs),
  };
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
// G3 — terminus evidence (DISPLAY-only observer). Read-only source-backed per-bore endpoint evidence: for
// each engine-ready reviewed bore-log, what the START/END bound to (a printed structure note) or the named
// missing-evidence blocker. NEVER implies AUTO, renders nothing, changes no placement/status. The station
// VALUE is read from source (bore-log row or printed text), never inferred from geometry.
// ====================================================================================================

/** Evidence for ONE bore endpoint (START or END). `sourceBound` is true ONLY when a printed/source proof was
 *  found; a value known only from the bore-log row is NOT source-bound and carries a named `blocker`. */
export interface TerminusEndpointView {
  readonly which: string;                  // "START" | "END"
  readonly sourceType: string;             // PRINTED_STRUCTURE_LABEL | BORE_LOG_ROW | ...
  readonly sourceBound: boolean;
  readonly stationStr: string | null;      // e.g. "13+25"
  readonly stationFt: number | null;
  readonly sheet: number | null;
  readonly pdfPage: number | null;
  readonly sourceText: string | null;      // verbatim printed note, if any
  readonly structureLabel: string | null;  // printed structure keyword(s), if any
  readonly provenance: string;
  readonly confidence: number | null;      // set only on a printed-bound endpoint (PRINTED proof, not AUTO)
  readonly blocker: string | null;         // named missing-evidence code when not source-bound
  readonly pedigree: string;               // human-readable evidence trail
}

export interface BoreTerminusEvidenceView {
  readonly boreLabel: string | null;
  readonly start: TerminusEndpointView;
  readonly end: TerminusEndpointView;
  readonly bothSourceBound: boolean;
  readonly missingBlockers: readonly string[];
}

export interface TerminusEntryView {
  readonly reviewedBoreLogId: string | null;
  readonly sourceUploadId: string | null;
  readonly evidence: BoreTerminusEvidenceView;
}

export interface TerminusEvidenceView {
  readonly status: string;                 // EVALUATED | NO_INPUTS
  readonly runnable: boolean;
  readonly planPresent: boolean;
  readonly termini: readonly TerminusEntryView[];
  readonly blockers: readonly EngineHandoffBlocker[];
}

function composeTerminusEndpoint(value: unknown): TerminusEndpointView {
  const d = (typeof value === 'object' && value !== null && !Array.isArray(value))
    ? (value as Record<string, unknown>) : {};
  return {
    which: str(d.which),
    sourceType: str(d.source_type),
    sourceBound: d.source_bound === true,
    stationStr: strOrNull(d.station_str),
    stationFt: numOrNull(d.station_ft),
    sheet: numOrNull(d.sheet),
    pdfPage: numOrNull(d.pdf_page),
    sourceText: strOrNull(d.source_text),
    structureLabel: strOrNull(d.structure_label),
    provenance: str(d.provenance),
    confidence: numOrNull(d.confidence),
    blocker: strOrNull(d.blocker),
    pedigree: str(d.pedigree),
  };
}

function composeTerminusEntry(value: unknown): TerminusEntryView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  const ev = (typeof d.evidence === 'object' && d.evidence !== null && !Array.isArray(d.evidence))
    ? (d.evidence as Record<string, unknown>) : null;
  if (!ev) return null;
  return {
    reviewedBoreLogId: strOrNull(d.reviewed_bore_log_id),
    sourceUploadId: strOrNull(d.source_upload_id),
    evidence: {
      boreLabel: strOrNull(ev.bore_label),
      start: composeTerminusEndpoint(ev.start),
      end: composeTerminusEndpoint(ev.end),
      bothSourceBound: ev.both_source_bound === true,
      missingBlockers: strList(ev.missing_blockers),
    },
  };
}

export function composeTerminusEvidence(doc: unknown): TerminusEvidenceView {
  const d = asRecord(doc, 'terminus-evidence');
  const rawBlockers = Array.isArray(d.blockers) ? d.blockers : [];
  const blockers: EngineHandoffBlocker[] = rawBlockers
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ code: str(b.code), reason: str(b.reason) }));
  const rawTermini = Array.isArray(d.termini) ? d.termini : [];
  return {
    status: str(d.status),
    runnable: d.runnable === true,
    planPresent: d.plan_present === true,
    termini: rawTermini.map(composeTerminusEntry).filter((e): e is TerminusEntryView => e !== null),
    blockers,
  };
}

/** Read-only source-backed per-bore TERMINUS EVIDENCE for DISPLAY (observer-only; never implies AUTO, places
 *  nothing). Throws on a failed live read (no mock). */
export async function fetchTerminusEvidence(jobId: string): Promise<TerminusEvidenceView> {
  return composeTerminusEvidence(await getProductJson(`/v2/product/jobs/${jobId}/terminus-evidence`));
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

// Construction-sheet classification of a PDF page (from the printed title block). A construction PLAN
// sheet carries an "N OF M" label; TYPICAL_DETAILS a "TYP-n" label; OTHER = cover/index/legend.
export type PlanSheetType = 'CONSTRUCTION_PLAN' | 'TYPICAL_DETAILS' | 'OTHER';

export interface PlanPageInfo {
  readonly pageNumber: number;            // 1-based PDF page index (NOT the construction sheet number)
  readonly bounds: PlanPageBounds;        // PDF DISPLAY-space (the space control points are stored in)
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  // Construction-sheet identity from the title block (null on cover/typical-detail pages).
  readonly constructionSheetNumber: number | null;   // the "N" in "N OF M" (e.g. 7 = sheet "7 OF 30")
  readonly sheetTotal: number | null;                 // the "M" (plan-set total, e.g. 30)
  readonly planSheetLabel: string | null;             // human label e.g. "7 OF 30" or "TYP-6"
  readonly sheetType: PlanSheetType;
  readonly isPlanSheet: boolean;                       // true only for a construction route/station plan sheet
}

export interface PlanPageMetadata {
  readonly planUploadId: string;
  readonly pageCount: number;
  readonly planSetTotal: number | null;
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
      const sheetType: PlanSheetType =
        p.sheet_type === 'CONSTRUCTION_PLAN' || p.sheet_type === 'TYPICAL_DETAILS'
          ? p.sheet_type : 'OTHER';
      return {
        pageNumber: int(p.page_number),
        bounds: { x0: int(b.x0), y0: int(b.y0), x1: int(b.x1), y1: int(b.y1) },
        width: int(p.width),
        height: int(p.height),
        zoom: int(p.zoom),
        rasterWidth: int(p.raster_width),
        rasterHeight: int(p.raster_height),
        constructionSheetNumber: numOrNull(p.construction_sheet_number),
        sheetTotal: numOrNull(p.sheet_total),
        planSheetLabel: typeof p.plan_sheet_label === 'string' ? p.plan_sheet_label : null,
        sheetType,
        isPlanSheet: p.is_plan_sheet === true,
      };
    });
  return { planUploadId: str(d.plan_upload_id), pageCount: int(d.page_count),
           planSetTotal: numOrNull(d.plan_set_total), pages };
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

// --- W3 (flag-gated): handwritten bore-log source-page preview -------------------------------------- //

/** Pure path builder (unit-checkable) for the raster of one page of an uploaded bore-log file. */
export function borelogSourcePagePath(jobId: string, uploadId: string, pageIndex: number): string {
  return `/v2/product/jobs/${jobId}/uploads/${uploadId}/borelog-source?page=${pageIndex}`;
}

/** Read-only raster of ONE page of the uploaded bore-log file (for the source-page preview panel next to
 *  the row editor, shown only behind handwrittenBorelogEnabled()). Header-bearing fetch -> Blob (a plain
 *  <img src> cannot send the identity headers). Throws on ANY non-OK response — the caller renders "Source
 *  page preview unavailable." rather than a broken <img>, never a mock/placeholder image. */
export async function fetchBorelogSourcePageBlob(
  jobId: string, uploadId: string, pageIndex: number,
): Promise<Blob> {
  return getProductBlob(borelogSourcePagePath(jobId, uploadId, pageIndex));
}

/** Read-only PNG raster of ONE uploaded PLAN_PDF page (the plan AS-IS — NO redline overlay). Header-
 *  bearing fetch -> Blob (a plain <img src> cannot send the identity headers). Throws on non-OK (no mock). */
export async function fetchPlanPageRasterBlob(
  jobId: string, planUploadId: string, pageNumber: number, zoom?: number,
): Promise<Blob> {
  // Optional on-demand higher-DPI raster (the backend clamps it to a safe range). Omitted -> default raster.
  const qs = typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0 ? `?zoom=${zoom}` : '';
  return getProductBlob(`/v2/product/jobs/${jobId}/plan-pages/${planUploadId}/${pageNumber}/raster${qs}`);
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
  // Additive (Ticket W-C): set only when this anchor was created via explicit route_adoption and the
  // backend recorded it as OBSERVER_BACKBONE_HUMAN_ADOPTED. Absent/older-backend -> null, and the caller
  // renders no chip — legacy rendering stays identical.
  readonly geometryBasis: string | null;
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
    geometryBasis: strOrNull(d.geometry_basis),
  };
}

// Ticket W-C: explicit adoption of a source-backed route proposal, carried on the EXISTING source-anchor
// create write (never a separate write). `confirmed` is always `true` on the wire — the type pins it so a
// caller can never accidentally send a false/omitted confirmation.
export interface RouteAdoptionInput {
  readonly proposalHash: string;
  readonly confirmed: true;
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
  // Optional (Ticket W-C, default absent): adopts a previously-searched source-backed route proposal for
  // THIS anchor. Omitted entirely (not sent as null) when not adopting, so the request body a non-adopting
  // caller sends is byte-for-byte what it was before this field existed.
  readonly routeAdoption?: RouteAdoptionInput;
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
    // Key omitted entirely (not `route_adoption: null`) when not adopting — the non-adoption request body
    // stays byte-for-byte identical to what it was before this field existed.
    ...(input.routeAdoption
      ? { route_adoption: { proposal_hash: input.routeAdoption.proposalHash, confirmed: true } }
      : {}),
  }));
}

// ====================================================================================================
// Ticket W-C — source-backed engineering-route PROPOSAL + explicit adoption (flag-gated:
// sourceRouteAdoptionEnabled()). A proposal is a READ (POST that returns geometry, records nothing); the
// caller adopts it, if at all, via the EXISTING createSourceAnchor write above (routeAdoption field). Never
// implies AUTO placement — the proposal is only ever drawn as a dashed PREVIEW pending the human's explicit
// "Use engineering route" choice, exactly like the marked-points preview it sits alongside.
// ====================================================================================================

export interface RouteProposalPoint {
  readonly x: number;
  readonly y: number;
}

export interface RouteProposalSourceView {
  readonly engineeringSheet: string | null;
  readonly pdfPage: number | null;
}

export interface RouteProposalConnectivityView {
  readonly whyConnected: string;
}

export interface RouteProposalView {
  readonly proposalHash: string;
  readonly proposedRenderPoints: readonly RouteProposalPoint[];  // full polyline to preview (display-space)
  readonly candidateRoutePoints: readonly RouteProposalPoint[];  // the source-backed interior points
  readonly humanControlPoints: readonly RouteProposalPoint[];    // echoes the 2 marks that were sent
  readonly source: RouteProposalSourceView;
  readonly connectivity: RouteProposalConnectivityView;
  readonly warnings: readonly string[];
}

export interface RouteRefusalView {
  readonly code: string;
  readonly message: string;
}

export type RouteProposalOutcome =
  | { readonly kind: 'PROPOSAL'; readonly proposal: RouteProposalView }
  | { readonly kind: 'REFUSAL'; readonly refusal: RouteRefusalView }
  // The endpoint isn't mounted (404 — route not live / backend flag off). Honest feature-absence, not an
  // error: the caller falls back to pure manual UX silently, no toast.
  | { readonly kind: 'UNAVAILABLE' };

function composeRouteProposalPoints(value: unknown): RouteProposalPoint[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p))
    .map((p) => ({ x: Number(p.x ?? 0), y: Number(p.y ?? 0) }));
}

export function composeRouteProposal(value: unknown): RouteProposalView {
  const d = asRecord(value, 'route-proposal');
  const source = (typeof d.source === 'object' && d.source !== null && !Array.isArray(d.source))
    ? (d.source as Record<string, unknown>) : {};
  const connectivity =
    (typeof d.connectivity === 'object' && d.connectivity !== null && !Array.isArray(d.connectivity))
      ? (d.connectivity as Record<string, unknown>) : {};
  return {
    proposalHash: str(d.proposal_hash),
    proposedRenderPoints: composeRouteProposalPoints(d.proposed_render_points),
    candidateRoutePoints: composeRouteProposalPoints(d.candidate_route_points),
    humanControlPoints: composeRouteProposalPoints(d.human_control_points),
    source: { engineeringSheet: strOrNull(source.engineering_sheet), pdfPage: numOrNull(source.pdf_page) },
    connectivity: { whyConnected: str(connectivity.why_connected) },
    // Treat any additional response fields (route_evidence, readiness, hashes, ...) as optional display
    // metadata this decoder doesn't need to know about — never required, never validated away.
    warnings: strList(d.warnings),
  };
}

export function composeRouteRefusal(value: unknown): RouteRefusalView {
  const d = asRecord(value, 'route-refusal');
  return { code: str(d.code), message: str(d.message) };
}

export interface RouteProposalRequest {
  readonly planUploadId: string;
  readonly reviewedBoreLogId: string;
  readonly rowId: string;
  readonly pageNumber: number;
  // Exactly 2 — the pinned contract's control_points shape (start + end; no bends).
  readonly controlPoints: readonly [ControlPointInput, ControlPointInput];
}

/** Search for a source-backed engineering-route proposal between two human-marked control points. Read-only
 *  (records nothing). A 404 means the route isn't mounted/live (feature-absent, not a failure) and composes
 *  to `{kind:'UNAVAILABLE'}`; any other non-OK response still throws (no mock fallback). The 200 response is
 *  always one of PROPOSAL / REFUSAL per the pinned contract. */
export async function requestSourceRouteProposal(
  jobId: string, input: RouteProposalRequest,
): Promise<RouteProposalOutcome> {
  const response = await fetch(`${apiBase()}/v2/product/jobs/${jobId}/source-route-proposals`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({
      plan_upload_id: input.planUploadId,
      reviewed_bore_log_id: input.reviewedBoreLogId,
      row_id: input.rowId,
      page_number: input.pageNumber,
      control_points: input.controlPoints.map((p) => ({ x: p.x, y: p.y })),
    }),
  });
  if (response.status === 404) return { kind: 'UNAVAILABLE' };
  if (!response.ok) {
    throw new Error(
      `product POST source-route-proposals failed with HTTP ${response.status}${await serverDetail(response)}`);
  }
  const doc = asRecord(await response.json(), 'route-proposal-response');
  if (doc.outcome === 'PROPOSAL') return { kind: 'PROPOSAL', proposal: composeRouteProposal(doc.proposal) };
  if (doc.outcome === 'REFUSAL') return { kind: 'REFUSAL', refusal: composeRouteRefusal(doc.refusal) };
  throw new Error('product POST source-route-proposals returned an unrecognized outcome');
}

// Named create-time refusal codes for an ADOPTED anchor (route_adoption present).
const ROUTE_ADOPTION_REFUSAL_CODES = [
  'ROUTE_ADOPTION_INVALID',
  'ROUTE_ADOPTION_CONTROL_MISMATCH',
  'ROUTE_ADOPTION_STALE',
  'ROUTE_ADOPTION_NO_LONGER_DEFENSIBLE',
  'ROUTE_ADOPTION_SCOPE_MISMATCH',
] as const;

function isRouteAdoptionCode(code: string): boolean {
  return (ROUTE_ADOPTION_REFUSAL_CODES as readonly string[]).includes(code);
}

/** Recognize a named route_adoption create-time refusal (HTTP 400/409) from a thrown createSourceAnchor
 *  error, so the caller can degrade honestly (clear the stale proposal, keep the human's marks, offer
 *  re-search or manual fallback) instead of showing a generic submit error. Returns null for any other
 *  error (including a plain validation REJECTED, which never throws — see SourceAnchorResult.blockers).
 *
 *  Tolerant of every error-body shape extractRefusalCode() recognizes: PRIMARILY the structured `.code`
 *  ProductApiError attaches (covers the repo's `_to_http` string-leading-token convention AND a `detail`
 *  object AND a top-level `code` field — see extractRefusalCode). Falls back to a substring search over the
 *  thrown Error's message for a non-ProductApiError (e.g. a network failure surfaced as a plain Error, or an
 *  older code path) so a message that happens to already carry the code string is still honored. */
export function routeAdoptionRefusalCode(err: unknown): string | null {
  if (err instanceof ProductApiError && err.code && isRouteAdoptionCode(err.code)) {
    return err.code;
  }
  if (!(err instanceof Error)) return null;
  for (const code of ROUTE_ADOPTION_REFUSAL_CODES) {
    if (err.message.includes(code)) return code;
  }
  return null;
}

// --- M2 Slice 3: render a validated source anchor -> real redline bundle + job-scoped artifact reads --- //

export interface JobArtifactRef {
  readonly logId: string;
  readonly path: string;
  readonly sha256: string | null;
  readonly bytes: number;
  readonly kind: string;
}

/** One clickable interval/footage dot along a HUMAN-confirmed redline (backend-computed; provenance is
 *  always HUMAN_CONFIRMED_CONTROL_POINTS — never AUTO). Dots mark 0' (start), every 50', and the final
 *  endpoint; info fields are the bore row's own values (null when the row doesn't carry them). */
export interface StationDot {
  readonly index: number;
  readonly footageAlong: number;
  readonly station: string | null;
  readonly xyDisplay: { readonly x: number; readonly y: number };
  readonly depth: string | null;
  readonly boc: string | null;
  readonly date: string | null;
  readonly crew: string | null;
  readonly print: string | null;
  readonly notes: string | null;
  readonly boreLogId: string | null;
  readonly provenance: string;
}

export interface SourceAnchorRenderResult {
  readonly status: string;            // SUCCEEDED on a real publish
  readonly bundleId: string | null;
  readonly bundleOrigin: string;      // HUMAN_CONFIRMED_SOURCE_ANCHOR
  readonly artifactCount: number;
  readonly sourceAnchorIds: readonly string[];
  readonly artifacts: readonly JobArtifactRef[];
  // Additive: {source_anchor_id: [dot, ...]} from the published manifest ({} when the row had no footage).
  readonly stationDotsByLog: Readonly<Record<string, readonly StationDot[]>>;
}

function composeStationDot(d: Record<string, unknown>): StationDot {
  const xy = (typeof d.xy_display === 'object' && d.xy_display !== null)
    ? (d.xy_display as Record<string, unknown>) : {};
  return {
    index: int(d.index),
    footageAlong: typeof d.footage_along === 'number' ? d.footage_along : Number(d.footage_along ?? 0),
    station: strOrNull(d.station),
    xyDisplay: { x: Number(xy.x ?? 0), y: Number(xy.y ?? 0) },
    depth: strOrNull(d.depth), boc: strOrNull(d.boc), date: strOrNull(d.date), crew: strOrNull(d.crew),
    print: strOrNull(d.print), notes: strOrNull(d.notes), boreLogId: strOrNull(d.bore_log_id),
    provenance: str(d.provenance),
  };
}

function composeStationDotsByLog(value: unknown): Record<string, readonly StationDot[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, readonly StationDot[]> = {};
  for (const [logId, dots] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(dots)) continue;
    out[logId] = dots
      .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d))
      .map(composeStationDot);
  }
  return out;
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
    stationDotsByLog: composeStationDotsByLog(d.station_dots),
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

/** One recognized bore in a (possibly multi-bore) recognized package: a drawn deterministic log + its source
 *  bore-log + the committed bore span + the plan sheet(s) its redline is rendered on. Drives the step-through. */
export interface RecognizedBore {
  readonly logId: string;
  readonly reviewedBoreLogId: string | null;
  readonly boreSpan: { readonly startStation: string | null; readonly endStation: string | null; readonly label: string | null } | null;
  readonly renderSheets: readonly number[];
}

export interface RecognizedCorpusHandoffView {
  readonly status: string;                 // RUNNABLE | BLOCKED
  readonly runnable: boolean;
  readonly recognizedCorpusId: string | null;       // generic id (NOT a customer/location/project name)
  readonly recognizedPackageLabel: string | null;   // generic label, e.g. "Recognized uploaded project package"
  readonly deterministicLogId: string | null;
  readonly renderSheets: readonly number[];
  readonly renderCommit: string | null;
  readonly recognizedLogs: readonly RecognizedBore[];   // per-bore list (scales to N; featured seed capped 3-5)
  readonly blockers: readonly EngineHandoffBlocker[];
}

function composeRecognizedBore(value: unknown): RecognizedBore | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  const logId = strOrNull(d.log_id);
  if (!logId) return null;
  const span = (typeof d.bore_span === 'object' && d.bore_span !== null && !Array.isArray(d.bore_span))
    ? (d.bore_span as Record<string, unknown>) : null;
  const rawSheets = Array.isArray(d.render_sheets) ? d.render_sheets : [];
  return {
    logId,
    reviewedBoreLogId: strOrNull(d.reviewed_bore_log_id),
    boreSpan: span
      ? { startStation: strOrNull(span.start_station), endStation: strOrNull(span.end_station), label: strOrNull(span.label) }
      : null,
    renderSheets: rawSheets.filter((n): n is number => typeof n === 'number'),
  };
}

export function composeRecognizedCorpusHandoff(doc: unknown): RecognizedCorpusHandoffView {
  const d = asRecord(doc, 'recognized-corpus-handoff');
  const rawBlockers = Array.isArray(d.blockers) ? d.blockers : [];
  const blockers: EngineHandoffBlocker[] = rawBlockers
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ code: str(b.code), reason: str(b.reason) }));
  const rawSheets = Array.isArray(d.render_sheets) ? d.render_sheets : [];
  const rawLogs = Array.isArray(d.recognized_logs) ? d.recognized_logs : [];
  return {
    status: str(d.status),
    runnable: d.runnable === true,
    recognizedCorpusId: strOrNull(d.recognized_corpus_id),
    recognizedPackageLabel: strOrNull(d.recognized_package_label),
    deterministicLogId: strOrNull(d.deterministic_log_id),
    renderSheets: rawSheets.filter((n): n is number => typeof n === 'number'),
    renderCommit: strOrNull(d.render_commit),
    recognizedLogs: rawLogs.map(composeRecognizedBore).filter((b): b is RecognizedBore => b !== null),
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

/** Graded REVIEW confidence for a general uploaded-project (generic-geometry) candidate. Null on the
 *  named-dialect path (which carries no graded signal). A REVIEW candidate is NEVER AUTO -> score < 1.0. */
export interface ReviewConfidence {
  readonly band: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  readonly score: number | null;          // 0..1, capped below 1.0
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

export interface ReviewCandidateView {
  readonly candidateId: string | null;
  readonly tier: string | null;           // REVIEW | AUTO | ABSTAIN
  readonly status: string | null;         // REVIEW_CANDIDATE | REVIEW_ACCEPTED | REVIEW_REJECTED | ABSTAINED
  readonly provenance: string | null;     // ENGINE_GENERATED_REVIEW_CANDIDATE | ENGINE_GENERATED_HUMAN_ACCEPTED_REVIEW
  readonly placementStatus: string | null;
  readonly engineReason: string | null;
  readonly dialect: string | null;        // 'generic' for the name-free fallback, else the named dialect
  readonly genericFallback: boolean;       // true => placed by the generic-geometry fallback (general upload)
  readonly confidence: ReviewConfidence | null;
  readonly reviewedBoreLogId: string | null;  // seeds the human correction lane (which bore-log was placed)
  readonly boreSpan: string | null;           // e.g. '14+20->15+38' — seeds the correction start/end stations
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

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function composeConfidence(value: unknown): ReviewConfidence | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  const band = c.band === 'HIGH' || c.band === 'MEDIUM' || c.band === 'LOW' ? c.band : null;
  return { band, score: numOrNull(c.score), reasons: strList(c.reasons), warnings: strList(c.warnings) };
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
    dialect: strOrNull(d.dialect),
    genericFallback: d.generic_fallback === true,
    confidence: composeConfidence(d.confidence),
    reviewedBoreLogId: strOrNull(d.reviewed_bore_log_id),
    boreSpan: strOrNull(d.bore_span),
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

// ====================================================================================================
// Phase 9 — product workflow orchestrator. ONE call chooses the correct redline path IN ORDER (recognized
// deterministic -> uploaded REVIEW/AUTO -> abstain); a second call assembles the closeout/export package.
// The redline PNG(s) are retrieved via the job-artifact reads above. Throws on failure (no mock fallback).
// ====================================================================================================

export interface WorkflowBlocker {
  readonly source: string;                 // 'recognition' | 'engine'
  readonly code: string;
  readonly reason: string;
}

export interface ProductRedlineOutcome {
  readonly path: string;                   // RECOGNIZED_DETERMINISTIC | UPLOADED_REVIEW | UPLOADED_AUTO | ABSTAIN
  readonly runnable: boolean;
  readonly rendered: boolean;
  readonly provenance: string | null;      // DETERMINISTIC_AUTO | ENGINE_GENERATED_REVIEW_CANDIDATE | null
  readonly recognizedCorpusId: string | null;
  readonly deterministicLogId: string | null;
  readonly renderCommit: string | null;
  readonly candidateId: string | null;
  readonly requiresAcceptance: boolean;    // true only for a UPLOADED_REVIEW candidate that is NOT yet accepted
  readonly reviewStatus: string | null;    // REVIEW_CANDIDATE | REVIEW_ACCEPTED | REVIEW_REJECTED | null
  readonly reviewAccepted: boolean;        // the existing REVIEW candidate is already human-accepted
  readonly reviewRejected: boolean;        // the existing REVIEW candidate was rejected
  readonly blockers: readonly WorkflowBlocker[];
}

function composeWorkflowBlockers(value: unknown): WorkflowBlocker[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map((b) => ({ source: str(b.source), code: str(b.code), reason: str(b.reason) }));
}

export function composeProductRedlineOutcome(doc: unknown): ProductRedlineOutcome {
  const d = asRecord(doc, 'product-redline-outcome');
  return {
    path: str(d.path),
    runnable: d.runnable === true,
    rendered: d.rendered === true,
    provenance: strOrNull(d.provenance),
    recognizedCorpusId: strOrNull(d.recognized_corpus_id),
    deterministicLogId: strOrNull(d.deterministic_log_id),
    renderCommit: strOrNull(d.render_commit),
    candidateId: strOrNull(d.candidate_id),
    requiresAcceptance: d.requires_acceptance === true,
    reviewStatus: strOrNull(d.review_status),
    reviewAccepted: d.review_accepted === true,
    reviewRejected: d.review_rejected === true,
    blockers: composeWorkflowBlockers(d.blockers),
  };
}

/** Run the correct redline path for the job's uploaded package, IN ORDER: a recognized deterministic
 *  package serves the EXISTING committed engine render (DETERMINISTIC_AUTO); else a supported uploaded
 *  package produces an engine REVIEW candidate (never faked AUTO); else ABSTAIN with the SPECIFIC
 *  recognition + engine reasons. A successful render advances the job to PLACED. Throws on failure. */
export async function runProductRedline(jobId: string): Promise<ProductRedlineOutcome> {
  return composeProductRedlineOutcome(
    await postProductJson(`/v2/product/jobs/${jobId}/workflow/redline`, {}));
}

export interface CloseoutPackageResult {
  readonly assembled: boolean;
  readonly blocker: string | null;         // REVIEW_NOT_ACCEPTED | REVIEW_WAS_REJECTED | REVIEW_ABSTAINED | null
  readonly reviewStatus: string | null;
  readonly closeoutStatus: string | null;  // READY_FOR_APPROVAL | BLOCKED | ...
  readonly exportStatus: string | null;    // READY | ASSEMBLED | BLOCKED | FINAL
  readonly includedSections: readonly string[];
  readonly omittedSections: readonly string[];
  readonly kmzStatus: string | null;       // BLOCKED | EXPORTABLE
  readonly kmzGeometryBasis: string | null; // UNSUPPORTED_PIXEL_ONLY | GEOSPATIAL_COORDINATES | ...
  readonly kmzBlockers: readonly string[];
}

export function composeCloseoutPackageResult(doc: unknown): CloseoutPackageResult {
  const d = asRecord(doc, 'closeout-package-result');
  const view = typeof d.export_view === 'object' && d.export_view !== null && !Array.isArray(d.export_view)
    ? (d.export_view as Record<string, unknown>)
    : {};
  return {
    assembled: d.assembled === true,
    blocker: strOrNull(d.blocker),
    reviewStatus: strOrNull(d.review_status),
    closeoutStatus: strOrNull(d.closeout_status),
    exportStatus: strOrNull(d.export_status),
    includedSections: strList(view.included_sections),
    omittedSections: strList(view.omitted_sections),
    kmzStatus: strOrNull(d.kmz_status),
    kmzGeometryBasis: strOrNull(d.kmz_geometry_basis),
    kmzBlockers: strList(d.kmz_blockers),
  };
}

/** Drive the closeout/export chain for a job whose redline is placed: gate on REVIEW acceptance, advance to
 *  CLOSEOUT_REVIEW, evaluate closeout + KMZ-export safety, and assemble the export-package descriptor. KMZ is
 *  honestly BLOCKED for a pixel-only redline manifest (never faked). Throws on failure. */
export async function assembleCloseoutPackage(jobId: string): Promise<CloseoutPackageResult> {
  return composeCloseoutPackageResult(
    await postProductJson(`/v2/product/jobs/${jobId}/workflow/closeout`, {}));
}

/** Header-bearing fetch of the job's redline KMZ -> Blob (download). Throws (409) when the redline manifest
 *  is pixel-only / not geospatially exportable — there is no faked KMZ. */
export async function downloadKmzExportBlob(jobId: string): Promise<Blob> {
  return getProductBlob(`/v2/product/jobs/${jobId}/kmz-export/download`);
}

/** Download the job's UPLOADED route as a Google-Earth-openable KMZ Blob (real WGS84 geometry + verbatim
 *  names / street labels). This is the uploaded design route, NOT redline output. Throws (409) when the job
 *  has no usable GIS_ROUTE — never a faked file. */
export async function downloadRouteKmzBlob(jobId: string): Promise<Blob> {
  return getProductBlob(`/v2/product/jobs/${jobId}/gis-route/download`);
}

/** Download the job's closeout export bundle as a .zip Blob (the redline manifest + sha256-verified
 *  FINAL_REDLINE_PNG bytes + closeout/export/KMZ status JSON + reviewed-bore-log metadata, and a valid KMZ
 *  only when genuinely geospatial). Throws (409) when the job has no validated redline bundle yet. */
export async function downloadExportBundleBlob(jobId: string): Promise<Blob> {
  return getProductBlob(`/v2/product/jobs/${jobId}/export-package/download`);
}

/** Download the job's server-rendered closeout PACKET PDF as a Blob (a real PDF: FieldRoute header,
 *  job/closeout summary, deliverable QUANTITIES, the sha256-verified redline PNG evidence embedded, artifact
 *  metadata, reviewed-bore-log + export-package section summary, honest KMZ status, and billing dollars only
 *  when server-computed from configured cost rules — else honestly omitted). Throws (409) when the job has
 *  no validated redline bundle yet (not ready). */
export async function downloadCloseoutPdfBlob(jobId: string): Promise<Blob> {
  return getProductBlob(`/v2/product/jobs/${jobId}/export-package/pdf`);
}

// ====================================================================================================
// Phase 11 — workspace reads: uploaded GIS route geometry (real WGS84, honest empty states) + light
// closeout/export status for the Job Summary. All throw on a failed live read (no mock fallback); the
// workspace treats a 404 as an honest "not yet" state (Promise.allSettled).
// ====================================================================================================

export interface GisRouteFeature {
  readonly type: string;                       // LineString | Point | Polygon
  readonly name: string | null;                // placemark <name>, verbatim from the file (never invented)
  readonly sourceLabel: string | null;         // street label the FILE printed (verbatim) or null — never invented/geocoded
  readonly coordinates: readonly (readonly number[])[];   // [[lon, lat], ...] (WGS84, altitude dropped)
}

export interface GisRouteView {
  readonly present: boolean;                    // is a GIS_ROUTE upload present + parseable?
  readonly reason: string | null;              // NO_GIS_ROUTE_UPLOADED | GIS_ROUTE_NOT_PARSEABLE | NO_COORDINATES_FOUND | ...
  readonly features: readonly GisRouteFeature[];
  readonly bbox: readonly number[] | null;     // [minLon, minLat, maxLon, maxLat]
  readonly featureCount: number;
  readonly uploadFilename: string | null;
}

function composeGisRouteFeature(value: unknown): GisRouteFeature | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const f = value as Record<string, unknown>;
  const rawCoords = Array.isArray(f.coordinates) ? f.coordinates : [];
  const coordinates = rawCoords
    .filter((p): p is unknown[] => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  return { type: str(f.type), name: strOrNull(f.name), sourceLabel: strOrNull(f.source_label), coordinates };
}

export function composeGisRoute(doc: unknown): GisRouteView {
  const d = asRecord(doc, 'gis-route');
  const rawFeatures = Array.isArray(d.features) ? d.features : [];
  const features = rawFeatures.map(composeGisRouteFeature).filter((f): f is GisRouteFeature => f !== null);
  const rawBbox = Array.isArray(d.bbox) ? d.bbox.map(Number) : null;
  const bbox = rawBbox && rawBbox.length === 4 && rawBbox.every((n) => Number.isFinite(n)) ? rawBbox : null;
  const upload = (typeof d.upload === 'object' && d.upload !== null && !Array.isArray(d.upload))
    ? (d.upload as Record<string, unknown>) : {};
  return {
    present: d.present === true,
    reason: strOrNull(d.reason),
    features,
    bbox,
    featureCount: int(d.feature_count),
    uploadFilename: strOrNull(upload.filename),
  };
}

/** Read-only: the job's uploaded GIS_ROUTE (.kmz/.kml) parsed to real WGS84 geometry for the workspace map.
 *  Throws on a failed live read; an honest no-upload/no-coords state comes back as `present:false` (200). */
export async function fetchGisRoute(jobId: string): Promise<GisRouteView> {
  return composeGisRoute(await getProductJson(`/v2/product/jobs/${jobId}/gis-route`));
}

export interface CloseoutStatusView {
  readonly status: string | null;
  readonly isBlocked: boolean;
  readonly isApprovable: boolean;
  readonly hardBlockerCodes: readonly string[];
  readonly warningCodes: readonly string[];
}

/** Read-only closeout status + summary (404 if not evaluated yet — caller treats as "not yet"). */
export async function fetchCloseoutStatus(jobId: string): Promise<CloseoutStatusView> {
  const doc = await getProductJson(`/v2/product/jobs/${jobId}/closeout`);
  const d = asRecord(doc, 'closeout');
  const s = (typeof d.summary === 'object' && d.summary !== null && !Array.isArray(d.summary))
    ? (d.summary as Record<string, unknown>) : {};
  return {
    status: strOrNull(s.status) ?? strOrNull(d.status),
    isBlocked: s.is_blocked === true,
    isApprovable: s.is_approvable === true,
    hardBlockerCodes: strList(s.hard_blocker_codes),
    warningCodes: strList(s.warning_codes),
  };
}

export interface ExportStatusView {
  readonly status: string | null;
  readonly includedSections: readonly string[];
  readonly omittedSections: readonly string[];
}

/** Read-only export-package status + section view (404 if not assembled yet — caller treats as "not yet"). */
export async function fetchExportStatus(jobId: string): Promise<ExportStatusView> {
  const doc = await getProductJson(`/v2/product/jobs/${jobId}/export-package`);
  const d = asRecord(doc, 'export-package');
  const v = (typeof d.view === 'object' && d.view !== null && !Array.isArray(d.view))
    ? (d.view as Record<string, unknown>) : {};
  return {
    status: strOrNull(v.status) ?? strOrNull(d.status),
    includedSections: strList(v.included_sections),
    omittedSections: strList(v.omitted_sections),
  };
}

// ====================================================================================================
// Operator-entered pricing (per-job) — the operator's OWN provisional rates (provenance
// OPERATOR_ENTERED_UNVERIFIED + disclaimer), DISTINCT from the server-authoritative billing model. Rates
// start blank and require operator input; footage is the SERVER quantity (read-only); totals are computed
// server-side. No fabricated/default dollars.
// ====================================================================================================

export interface OperatorPricingExceptionView {
  readonly label: string;
  readonly amount: string | null;
  readonly note: string | null;
}

export interface OperatorPricingView {
  readonly provenance: string;
  readonly disclaimer: string;
  readonly footageAvailable: boolean;
  readonly footage: string | null;
  readonly footageIncomplete: boolean;
  readonly costPerFoot: string | null;
  readonly exceptions: readonly OperatorPricingExceptionView[];
  readonly baseTotal: string | null;
  readonly exceptionTotal: string | null;
  readonly finalTotal: string | null;
  readonly totalsNote: string | null;
  readonly currency: string;
  readonly updatedAt: string | null;
}

function composeOperatorPricing(doc: unknown): OperatorPricingView {
  const d = asRecord(doc, 'operator-pricing');
  const rawEx = Array.isArray(d.exceptions) ? d.exceptions : [];
  const exceptions: OperatorPricingExceptionView[] = rawEx
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null && !Array.isArray(e))
    .map((e) => ({ label: str(e.label), amount: strOrNull(e.amount), note: strOrNull(e.note) }));
  return {
    provenance: str(d.provenance),
    disclaimer: str(d.disclaimer),
    footageAvailable: d.footage_available === true,
    footage: strOrNull(d.footage),
    footageIncomplete: d.footage_incomplete === true,
    costPerFoot: strOrNull(d.cost_per_foot),
    exceptions,
    baseTotal: strOrNull(d.base_total),
    exceptionTotal: strOrNull(d.exception_total),
    finalTotal: strOrNull(d.final_total),
    totalsNote: strOrNull(d.totals_note),
    currency: str(d.currency) || 'USD',
    updatedAt: strOrNull(d.updated_at),
  };
}

export interface OperatorPricingInput {
  readonly costPerFoot: string | null;
  readonly exceptions: readonly { label: string; amount: string | null; note: string | null }[];
}

/** Read the job's operator-entered pricing + server footage + computed totals. Throws on a failed live read. */
export async function fetchOperatorPricing(jobId: string): Promise<OperatorPricingView> {
  return composeOperatorPricing(await getProductJson(`/v2/product/jobs/${jobId}/operator-pricing`));
}

/** Save the operator's cost-per-foot + exception rows (server validates + recomputes). Throws on non-OK. */
export async function saveOperatorPricing(jobId: string, input: OperatorPricingInput): Promise<OperatorPricingView> {
  const body = {
    cost_per_foot: input.costPerFoot,
    exceptions: input.exceptions.map((e) => ({ label: e.label, amount: e.amount, note: e.note })),
  };
  return composeOperatorPricing(await postProductJson(`/v2/product/jobs/${jobId}/operator-pricing`, body));
}
