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
