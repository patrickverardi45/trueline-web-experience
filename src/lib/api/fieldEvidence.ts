// Live v2 PRODUCT-API adapter for FIELD EVIDENCE packages — the read-only office view of segment evidence
// the field crew captured and submitted (start/end station photo refs, problem areas with their required
// photos, digital bore-log readings on the offset_ft axis).
//
// DOCTRINE: field evidence SUPPORTS office review; it never creates a redline, never places, never promotes
// anything to AUTO/final. This adapter is strictly READ-ONLY (GET), and it NEVER falls back to mock data — a
// failed live read THROWS so the UI surfaces an honest state. The backend mounts these routes only behind
// TL2_FIELD_EVIDENCE_API_OPTIN; a 404 is the caller's honest "not enabled / nothing here" signal.
//
// X-TL-Tenant / X-TL-Session are the backend's DEV STAND-IN identity headers (NOT real auth). Self-contained
// on purpose (no runtime imports) so the pure compose helpers are unit-checkable under plain Node — the same
// convention reviewReadiness.ts / liveV2Product.ts follow.

// Dev stand-in session id — this lane reads evidence for review; it writes nothing.
const SESSION = 'web-readonly';

// --- config (read at call time; mirrors reviewReadiness) ------------------------------------------- //

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

async function getProductJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, { method: 'GET', cache: 'no-store', headers: headers() });
  if (!response.ok) throw new Error(`product GET ${path} failed with HTTP ${response.status}`);
  return response.json();
}

// --- pure value coercion (unit-checkable) ----------------------------------------------------------- //

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v))
    : [];
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// --- typed models (the evidence package as the office review reads it) ------------------------------ //

/** One photo evidence slot. `uploadId` is the binding to a REAL job PHOTO upload — null means the slot was
 *  claimed in the field but no photo file backs it yet (it does NOT satisfy a required slot; never invented). */
export interface FieldEvidencePhoto {
  readonly evidenceId: string;
  readonly kind: string;                    // START_STATION | END_STATION | PROBLEM_AREA | OPTIONAL_CONTEXT
  readonly uploadId: string | null;
  readonly station: string | null;
  readonly offsetFt: number | null;
  readonly note: string | null;
  readonly capturedAt: string | null;
}

/** One logged problem area. Its documentation photos are PROBLEM_AREA slots referenced by evidence id. */
export interface FieldEvidenceProblem {
  readonly problemId: string;
  readonly type: string;                    // backend snake_case class (utility_conflict, …)
  readonly station: string | null;
  readonly offsetFt: number | null;
  readonly note: string | null;
  readonly photoEvidenceIds: readonly string[];
}

/** One digital bore-log reading. `offsetFt` (distance from segment start) is the plotting axis for the
 *  future digital redline/proof surface; cadence is whatever the crew recorded (~50 ft nominal, never
 *  enforced). */
export interface FieldEvidenceReading {
  readonly readingId: string;
  readonly offsetFt: number | null;
  readonly station: string | null;
  readonly depthFt: number | null;
  readonly pitchPct: number | null;
  readonly method: string | null;
  readonly recordedAt: string | null;
  readonly note: string | null;
  readonly problem: boolean;
  readonly evidenceId: string | null;
}

/** One segment's evidence package. The doctrine flags are surfaced so the UI can assert (and never render
 *  AUTO/final-placement language): this lane only ever SUPPORTS review. */
export interface FieldEvidencePackage {
  readonly segmentId: string;
  readonly status: string;                  // DRAFT | SUBMITTED_FOR_REVIEW
  readonly startStation: string | null;
  readonly endStation: string | null;
  readonly reviewedBoreLogId: string | null;
  readonly sourceSpanRef: string | null;
  readonly notes: string | null;
  readonly photos: readonly FieldEvidencePhoto[];
  readonly problems: readonly FieldEvidenceProblem[];
  readonly readings: readonly FieldEvidenceReading[];
  readonly submittedAt: string | null;
  readonly updatedAt: string | null;
  readonly reviewSupportOnly: boolean;
  readonly createsRedline: boolean;
  readonly performsAuto: boolean;
  readonly performsPlacement: boolean;
  readonly recordFormat: string;
}

// --- pure compose (unit-checkable) ------------------------------------------------------------------ //

function composePhoto(rec: Record<string, unknown>): FieldEvidencePhoto {
  return {
    evidenceId: str(rec.evidence_id),
    kind: str(rec.kind),
    uploadId: strOrNull(rec.upload_id),
    station: strOrNull(rec.station),
    offsetFt: numOrNull(rec.offset_ft),
    note: strOrNull(rec.note),
    capturedAt: strOrNull(rec.captured_at),
  };
}

function composeProblem(rec: Record<string, unknown>): FieldEvidenceProblem {
  return {
    problemId: str(rec.problem_id),
    type: str(rec.type),
    station: strOrNull(rec.station),
    offsetFt: numOrNull(rec.offset_ft),
    note: strOrNull(rec.note),
    photoEvidenceIds: strList(rec.photo_evidence_ids),
  };
}

function composeReading(rec: Record<string, unknown>): FieldEvidenceReading {
  return {
    readingId: str(rec.reading_id),
    offsetFt: numOrNull(rec.offset_ft),
    station: strOrNull(rec.station),
    depthFt: numOrNull(rec.depth_ft),
    pitchPct: numOrNull(rec.pitch_pct),
    method: strOrNull(rec.method),
    recordedAt: strOrNull(rec.recorded_at),
    note: strOrNull(rec.note),
    problem: bool(rec.problem),
    evidenceId: strOrNull(rec.evidence_id),
  };
}

/** Parse one stored evidence package into the typed office view. Defensive: unexpected values coerce to
 *  honest nulls/empties — never invented values. */
export function composeFieldEvidencePackage(doc: unknown): FieldEvidencePackage {
  const d = asRecord(doc);
  return {
    segmentId: str(d.segment_id),
    status: str(d.status),
    startStation: strOrNull(d.start_station),
    endStation: strOrNull(d.end_station),
    reviewedBoreLogId: strOrNull(d.reviewed_bore_log_id),
    sourceSpanRef: strOrNull(d.source_span_ref),
    notes: strOrNull(d.notes),
    photos: recordList(d.photos).map(composePhoto),
    problems: recordList(d.problems).map(composeProblem),
    readings: recordList(d.readings).map(composeReading),
    submittedAt: strOrNull(d.submitted_at),
    updatedAt: strOrNull(d.updated_at),
    reviewSupportOnly: bool(d.review_support_only),
    createsRedline: bool(d.creates_redline),
    performsAuto: bool(d.performs_auto),
    performsPlacement: bool(d.performs_placement),
    recordFormat: str(d.record_format),
  };
}

/** Parse the list response ({ field_evidence: [...] }) into typed packages. */
export function composeFieldEvidenceList(doc: unknown): FieldEvidencePackage[] {
  return recordList(asRecord(doc).field_evidence).map(composeFieldEvidencePackage);
}

// --- live reads (throw on failure; never mock) ------------------------------------------------------ //

/** List the job's field-evidence packages. An empty list is the honest "nothing submitted yet". Throws on a
 *  failed live read — an HTTP 404 means the field-evidence lane is not enabled on this backend (or the job is
 *  missing); the caller renders that as a calm not-enabled state, never as mock data. */
export async function fetchFieldEvidenceList(jobId: string): Promise<FieldEvidencePackage[]> {
  return composeFieldEvidenceList(await getProductJson(`/v2/product/jobs/${jobId}/field-evidence`));
}

/** Read one segment's evidence package (404 when never saved). */
export async function fetchFieldEvidencePackage(jobId: string, segmentId: string): Promise<FieldEvidencePackage> {
  return composeFieldEvidencePackage(
    await getProductJson(`/v2/product/jobs/${jobId}/field-evidence/${encodeURIComponent(segmentId)}`),
  );
}
