// Live v2 PRODUCT-API adapter for the SOURCE-BACKED readiness / REVIEW-candidate spine
// (STAGING_REVIEW_CANDIDATE_PRODUCT_WIRING). Runs the shipped read-only readiness spine on a tenant job's
// UPLOADED files and reads back its product-safe result: the readiness status ladder, the extracted span
// rows, endpoint anchor bindings, route verifications, and — ONLY when the spine reports exactly
// READY_FOR_REVIEW_REDLINE — a REVIEW candidate before/after overlay. Every refusal carries NO candidate and
// NO artifacts.
//
// This lane is DISTINCT from the Phase-6 `/review-candidates/*` acceptance lane (see productWrites.ts): it is
// the read-only completeness gate, it performs NO AUTO, NO final placement, and NO status promotion, and it
// NEVER falls back to mock data — a failed live read/run THROWS so the UI surfaces an honest state.
//
// X-TL-Tenant / X-TL-Session are the backend's DEV STAND-IN identity headers (NOT real auth). Self-contained
// on purpose (no relative runtime imports; type-only imports) so the pure compose/path helpers are
// unit-checkable under plain Node, the same convention liveV2Product.ts / productWrites.ts follow.

// Dev stand-in session id — this lane is read-only wrt the job (it records no audit/lifecycle write).
const SESSION = 'web-readonly';

// --- config (read at call time; mirrors liveV2Product / productWrites) ----------------------------- //

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

async function postProductJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, { method: 'POST', cache: 'no-store', headers: headers() });
  if (!response.ok) throw new Error(`product POST ${path} failed with HTTP ${response.status}`);
  return response.json();
}

async function getProductBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiBase()}${path}`, { method: 'GET', cache: 'no-store', headers: headers() });
  if (!response.ok) throw new Error(`product GET ${path} failed with HTTP ${response.status}`);
  return response.blob();
}

// --- pure value coercion (unit-checkable) ---------------------------------------------------------- //

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

// --- typed models (the product-safe result the spine returns) -------------------------------------- //

/** One source-extracted span row (coordinate-free). Every field is honest-null when the source didn't carry
 *  it — never an invented value. */
export interface ReviewReadinessSpanRow {
  readonly spanId: string;
  readonly startStation: string | null;
  readonly endStation: string | null;
  readonly footage: number | null;
  readonly startStructure: string | null;
  readonly endStructure: string | null;
  readonly sourceFile: string | null;      // basename only (no absolute/temp path)
  readonly sourcePage: number | null;
  readonly sourceKind: string | null;
  readonly confidence: number | null;
  readonly citation: string | null;
}

/** One endpoint's anchor-resolution status from the read-only G-a' resolver (coordinate-free view). */
export interface ReviewReadinessAnchorEndpoint {
  readonly status: string | null;
  readonly method: string | null;
}

/** Per-span endpoint binding: did both start + end bind to a unique drawn anchor? */
export interface ReviewReadinessAnchorBinding {
  readonly spanId: string;
  readonly startStation: string | null;
  readonly endStation: string | null;
  readonly bound: boolean;
  readonly refusal: string | null;
  readonly startAnchor: ReviewReadinessAnchorEndpoint;
  readonly endAnchor: ReviewReadinessAnchorEndpoint;
}

/** Per-span route verification between the two bound endpoints (read-only G-b / G-b''' observers). */
export interface ReviewReadinessRouteVerification {
  readonly spanId: string;
  readonly routeReady: boolean;
  readonly evaluated: boolean;
  readonly refusal: string | null;
  readonly routeObserverStatus: string | null;
  readonly routeIsolationStatus: string | null;
  readonly routeRunStatus: string | null;
  readonly mainRunStatus: string | null;
  readonly gapBridgeStatus: string | null;
}

/** A served REVIEW-candidate artifact (before = plan as-is, after = plan + RED REVIEW stroke). `url` is the
 *  tenant-scoped serve path; it is fetched as a Blob WITH identity headers (a plain <img src> cannot send
 *  them), never a placeholder. */
export interface ReviewReadinessArtifact {
  readonly role: string;                    // 'before' | 'after'
  readonly filename: string;
  readonly url: string;                     // /v2/product/jobs/{job}/review-readiness/artifacts/{name}
}

/** The single READY REVIEW candidate (null on any refusal). Carries the honesty invariants explicitly:
 *  isAuto / isFinalPlacement / isPromotion are ALWAYS false for this lane. */
export interface ReviewReadinessCandidate {
  readonly spanId: string | null;
  readonly startStation: string | null;
  readonly endStation: string | null;
  readonly sourceFile: string | null;
  readonly sourceCitation: string | null;
  readonly sourceKind: string | null;
  readonly confidence: number | null;
  readonly candidateStatus: string | null;
  readonly artifactBefore: string | null;   // served URL (or null)
  readonly artifactAfter: string | null;    // served URL (or null)
  readonly evidenceChain: readonly string[];
  readonly isAuto: boolean;
  readonly isFinalPlacement: boolean;
  readonly isPromotion: boolean;
}

/** The full product-safe readiness result (same shape for the run POST + the read GET). */
export interface ReviewReadinessResult {
  readonly readinessStatus: string;
  readonly stage: string | null;
  readonly ready: boolean;
  readonly recommendedNextInput: string | null;
  readonly reviewCandidateStatus: string | null;
  readonly generatedVisual: boolean;
  readonly refusalReason: string | null;
  readonly notice: string | null;
  // Lane invariants — ALWAYS false; surfaced so the UI can assert (never render AUTO/final language).
  readonly drawsAnything: boolean;
  readonly performsAuto: boolean;
  readonly performsPlacement: boolean;
  readonly promotesStatus: boolean;
  readonly spanRows: readonly ReviewReadinessSpanRow[];
  readonly anchorBindings: readonly ReviewReadinessAnchorBinding[];
  readonly routeVerifications: readonly ReviewReadinessRouteVerification[];
  readonly artifacts: readonly ReviewReadinessArtifact[];
  readonly candidate: ReviewReadinessCandidate | null;
  readonly renderError: boolean;
}

// --- pure compose (unit-checkable) ----------------------------------------------------------------- //

function composeSpanRow(rec: Record<string, unknown>): ReviewReadinessSpanRow {
  return {
    spanId: str(rec.span_id),
    startStation: strOrNull(rec.start_station),
    endStation: strOrNull(rec.end_station),
    footage: numOrNull(rec.footage),
    startStructure: strOrNull(rec.start_structure),
    endStructure: strOrNull(rec.end_structure),
    sourceFile: strOrNull(rec.source_file),
    sourcePage: numOrNull(rec.source_page),
    sourceKind: strOrNull(rec.source_kind),
    confidence: numOrNull(rec.confidence),
    citation: strOrNull(rec.citation),
  };
}

function composeAnchorEndpoint(value: unknown): ReviewReadinessAnchorEndpoint {
  const a = asRecord(value);
  return { status: strOrNull(a.status), method: strOrNull(a.method) };
}

function composeAnchorBinding(rec: Record<string, unknown>): ReviewReadinessAnchorBinding {
  return {
    spanId: str(rec.span_id),
    startStation: strOrNull(rec.start_station),
    endStation: strOrNull(rec.end_station),
    bound: bool(rec.bound),
    refusal: strOrNull(rec.refusal),
    startAnchor: composeAnchorEndpoint(rec.start_anchor),
    endAnchor: composeAnchorEndpoint(rec.end_anchor),
  };
}

function composeRouteVerification(rec: Record<string, unknown>): ReviewReadinessRouteVerification {
  return {
    spanId: str(rec.span_id),
    routeReady: bool(rec.route_ready),
    evaluated: bool(rec.evaluated),
    refusal: strOrNull(rec.refusal),
    routeObserverStatus: strOrNull(rec.route_observer_status),
    routeIsolationStatus: strOrNull(rec.route_isolation_status),
    routeRunStatus: strOrNull(rec.route_run_status),
    mainRunStatus: strOrNull(rec.main_run_status),
    gapBridgeStatus: strOrNull(rec.gap_bridge_status),
  };
}

function composeArtifact(rec: Record<string, unknown>): ReviewReadinessArtifact | null {
  const url = strOrNull(rec.url);
  if (!url) return null;
  return { role: str(rec.role), filename: str(rec.filename), url };
}

function composeCandidate(value: unknown): ReviewReadinessCandidate | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  return {
    spanId: strOrNull(c.span_id),
    startStation: strOrNull(c.start_station),
    endStation: strOrNull(c.end_station),
    sourceFile: strOrNull(c.source_file),
    sourceCitation: strOrNull(c.source_citation),
    sourceKind: strOrNull(c.source_kind),
    confidence: numOrNull(c.confidence),
    candidateStatus: strOrNull(c.candidate_status),
    artifactBefore: strOrNull(c.artifact_before),
    artifactAfter: strOrNull(c.artifact_after),
    evidenceChain: strList(c.evidence_chain),
    isAuto: bool(c.is_auto),
    isFinalPlacement: bool(c.is_final_placement),
    isPromotion: bool(c.is_promotion),
  };
}

/** Parse the spine's product-safe result into the typed view. Defensive + honest-empty: an unexpected/empty
 *  doc yields an empty NO_SPINE_INPUT-shaped view rather than throwing (a failed LIVE read still throws
 *  upstream in getProductJson/postProductJson — this only guards a malformed 200 body). */
export function composeReviewReadiness(doc: unknown): ReviewReadinessResult {
  const d = asRecord(doc);
  return {
    readinessStatus: str(d.readiness_status),
    stage: strOrNull(d.stage),
    ready: bool(d.ready),
    recommendedNextInput: strOrNull(d.recommended_next_input),
    reviewCandidateStatus: strOrNull(d.review_candidate_status),
    generatedVisual: bool(d.generated_visual),
    refusalReason: strOrNull(d.refusal_reason),
    notice: strOrNull(d.notice),
    drawsAnything: bool(d.draws_anything),
    performsAuto: bool(d.performs_auto),
    performsPlacement: bool(d.performs_placement),
    promotesStatus: bool(d.promotes_status),
    spanRows: recordList(d.span_rows).map(composeSpanRow),
    anchorBindings: recordList(d.anchor_bindings).map(composeAnchorBinding),
    routeVerifications: recordList(d.route_verifications).map(composeRouteVerification),
    artifacts: recordList(d.artifacts).map(composeArtifact).filter((a): a is ReviewReadinessArtifact => a !== null),
    candidate: composeCandidate(d.candidate),
    renderError: bool(asRecord(d.detail).render_error),
  };
}

// --- live run/read/artifact (throw on failure; never mock) ----------------------------------------- //

/** Build the review-readiness base path for a job. */
function readinessPath(jobId: string): string {
  return `/v2/product/jobs/${jobId}/review-readiness`;
}

/** Run the source-backed readiness / REVIEW-candidate spine on the job's uploads and return the persisted,
 *  product-safe result (a REVIEW candidate overlay is present ONLY when the spine reports exactly
 *  READY_FOR_REVIEW_REDLINE). Read-only wrt the job: no AUTO, no placement, no status promotion. Throws on a
 *  failed live run (e.g. 404 when the endpoint is not enabled / the job is missing); never falls back to mock. */
export async function runReviewReadiness(jobId: string, planSheet = 1): Promise<ReviewReadinessResult> {
  const sheet = Number.isInteger(planSheet) && planSheet >= 1 ? planSheet : 1;
  return composeReviewReadiness(await postProductJson(`${readinessPath(jobId)}/run?plan_sheet=${sheet}`));
}

/** Read the job's last persisted readiness / REVIEW-candidate result (the same shape run returns). Throws on a
 *  failed live read; a 404 ("readiness has not been run for this job" — or the endpoint not enabled) is thrown
 *  as an HTTP 404 error the caller distinguishes as an honest "not run yet" state (never mock). */
export async function fetchReviewReadiness(jobId: string): Promise<ReviewReadinessResult> {
  return composeReviewReadiness(await getProductJson(readinessPath(jobId)));
}

/** Header-bearing fetch of ONE persisted REVIEW-candidate PNG by its served path (the `url` field of a
 *  ReviewReadinessArtifact / candidate.artifactBefore|After) -> Blob (a plain <img src> cannot send identity
 *  headers). Throws on a non-OK response; never returns a placeholder/mock image. */
export async function fetchReviewReadinessArtifactBlob(servedPath: string): Promise<Blob> {
  return getProductBlob(servedPath);
}
