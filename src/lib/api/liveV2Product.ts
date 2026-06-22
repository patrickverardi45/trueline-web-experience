// Live v2 PRODUCT-API read adapter (used only in product mode). Reads the real, tenant-scoped
// /v2/product API for the configured seed job; reviewer reads are injected (shared path); portfolio /
// field surfaces without a product-API source return HONEST EMPTY — never mock. There is NO silent
// fallback to mock data: a failed live read throws (callers surface an honest empty/connection state).
//
// X-TL-Tenant / X-TL-Session are the backend's DEV STAND-IN identity headers (the same stand-in the
// backend itself uses), NOT real auth. This client builds no auth and treats them as non-authoritative.
//
// This module is intentionally JSON-import-free and dependency-light (reviewer reads are injected via
// createLiveV2ProductApi) so the pure read/compose logic is unit-checkable under plain Node.

import type { TrueLineApi } from './types';
import type { SyncState } from '@/contracts';
import type { RedlineManifestView } from './adapters/v2RedlineManifest';

const PRODUCT_SCHEMA_VERSION = '1.0.0';

/** True when the app is configured to read the real v2 product API (read at call time so it is both
 *  inlined by Next for `NEXT_PUBLIC_*` and live-readable under plain Node checks). */
export function productApiEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_TL2_PRODUCT_API ?? '').trim() === '1';
}

function requireConfig(value: string | undefined, name: string): string {
  const v = (value ?? '').trim();
  if (!v) throw new Error(`product mode requires ${name}`);
  return v;
}

function productApiBase(): string {
  const raw = requireConfig(process.env.NEXT_PUBLIC_TL2_API_BASE, 'NEXT_PUBLIC_TL2_API_BASE');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_TL2_API_BASE must be an HTTP(S) URL');
  }
  return raw.replace(/\/+$/, '');
}

function productTenant(): string {
  return requireConfig(process.env.NEXT_PUBLIC_TL2_TENANT, 'NEXT_PUBLIC_TL2_TENANT');
}

function productJobId(): string {
  return requireConfig(process.env.NEXT_PUBLIC_TL2_JOB_ID, 'NEXT_PUBLIC_TL2_JOB_ID');
}

/** GET a tenant-scoped product endpoint. Throws on non-OK; never falls back to mock data. */
export async function fetchProduct(path: string): Promise<unknown> {
  const response = await fetch(`${productApiBase()}${path}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      // Backend DEV STAND-IN identity headers — not real auth.
      'X-TL-Tenant': productTenant(),
      'X-TL-Session': 'web-readonly',
    },
  });
  if (!response.ok) {
    throw new Error(`product GET ${path} failed with HTTP ${response.status}`);
  }
  return response.json();
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid v2 product response: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function intOr0(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// --- redline manifest VIEW (composed from the two product reads the backend exposes today) --------- //
// The backend exposes the manifest slot descriptor (summary counts) + the manifest-backed artifact
// list, NOT the full per-log manifest body. So `logs`/`drawnLogs` are intentionally EMPTY (an honest
// limited view) — never fabricated — while totals / frontier / bundle / artifact count are real.
export function composeRedlineManifestView(
  slot: unknown,
  artifactsDoc: unknown,
  tenant: string,
): RedlineManifestView {
  const s = asRecord(slot, 'redline-manifest');
  const a = asRecord(artifactsDoc, 'artifacts');
  // The backend returns the job's output-slot envelope { ref: { summary_counts, bundle_id, ... }, set_at,
  // set_by } — the manifest descriptor (counts, bundle id) lives under `ref`. Fall back to the slot itself
  // for an already-unwrapped descriptor. This is shape tolerance only; it is NOT a mock fallback (a failed
  // live read still throws upstream in fetchProduct).
  const ref = asRecord(s.ref ?? s, 'redline-manifest.ref');
  const counts = asRecord(ref.summary_counts ?? {}, 'redline-manifest.summary_counts');
  const total = intOr0(counts.total_logs);
  const drawn = intOr0(counts.drawn);
  const covered = intOr0(counts.covered);
  const blocked = intOr0(counts.blocked);
  const artifacts = Array.isArray(a.artifacts) ? a.artifacts : [];
  const artifactBytes = artifacts.reduce((sum: number, art) => sum + intOr0(asRecord(art, 'artifact').bytes), 0);
  const bundleId = strOrNull(a.bundle_id) ?? strOrNull(ref.bundle_id) ?? '';
  return {
    bundleId,
    projectId: tenant,
    projectName: tenant,
    renderCommit: '',
    engineHead: '',
    schemaVersion: PRODUCT_SCHEMA_VERSION,
    frontier: `${drawn}/${total}`,
    totals: { total, drawn, covered, blocked },
    statusCounts: {},
    provenanceCounts: {},
    served: false,
    consumptionRules: [
      'Live v2 product read: summary counts + manifest-backed artifact count. Per-log manifest detail is not exposed by this build (honest limited view).',
    ],
    logs: [],
    drawnLogs: [],
    artifactCount: artifacts.length,
    artifactBytes,
  };
}

async function productRedlineManifest(): Promise<RedlineManifestView> {
  const jobId = productJobId();
  const [slot, artifactsDoc] = await Promise.all([
    fetchProduct(`/v2/product/jobs/${jobId}/redline-manifest`),
    fetchProduct(`/v2/product/jobs/${jobId}/artifacts`),
  ]);
  return composeRedlineManifestView(slot, artifactsDoc, productTenant());
}

// --- v2 job-status strip (real server-authoritative product status; no per-run readiness fabricated) //
export interface ProductJobStatus {
  readonly closeoutStatus: string | null;
  readonly billingStatus: string | null;
  readonly billingFinalTotal: string | null;
  readonly billingCurrency: string | null;
  readonly exportStatus: string | null;
  readonly kmzStatus: string | null;
  readonly kmzBlockers: readonly string[];
}

export function composeJobStatus(
  closeout: unknown,
  billing: unknown,
  exportPkg: unknown,
  kmz: unknown,
): ProductJobStatus {
  const c = asRecord(closeout, 'closeout');
  const b = asRecord(billing, 'billing');
  const e = asRecord(exportPkg, 'export-package');
  const k = asRecord(kmz, 'kmz-export');
  const billingView = asRecord(b.view ?? {}, 'billing.view');
  const kmzBlockers = Array.isArray(k.blockers)
    ? k.blockers
        .map((blocker) => strOrNull(asRecord(blocker, 'kmz.blocker').code))
        .filter((code): code is string => code !== null)
    : [];
  return {
    closeoutStatus: strOrNull(c.status),
    billingStatus: strOrNull(b.status),
    billingFinalTotal: strOrNull(billingView.final_total),
    billingCurrency: strOrNull(b.currency) ?? strOrNull(billingView.currency),
    exportStatus: strOrNull(e.status),
    kmzStatus: strOrNull(k.status),
    kmzBlockers,
  };
}

/** Read the four server-authoritative status surfaces for the configured job. Throws on any failure
 *  (the caller renders an honest unavailable state — never mock). */
export async function fetchProductJobStatus(): Promise<ProductJobStatus> {
  const jobId = productJobId();
  const [closeout, billing, exportPkg, kmz] = await Promise.all([
    fetchProduct(`/v2/product/jobs/${jobId}/closeout`),
    fetchProduct(`/v2/product/jobs/${jobId}/billing`),
    fetchProduct(`/v2/product/jobs/${jobId}/export-package`),
    fetchProduct(`/v2/product/jobs/${jobId}/kmz-export`),
  ]);
  return composeJobStatus(closeout, billing, exportPkg, kmz);
}

// Reviewer reads are injected so this module stays JSON-import-free (and unit-checkable under plain
// Node). Portfolio / field methods return honest empty — product mode never serves mock truth.
export function createLiveV2ProductApi(reviewerReads: TrueLineApi['reviews']): TrueLineApi {
  return {
    projects: { list: async () => [], get: async () => undefined },
    crews: { list: async () => [], get: async () => undefined },
    runs: { byProject: async () => [], get: async () => undefined },
    segments: { byRun: async () => [] },
    stations: { byRun: async () => [] },
    evidence: { byRun: async () => [], byProject: async () => [], get: async () => undefined },
    photos: { byEvidence: async () => [] },
    tickets: { byRun: async () => [], byProject: async () => [] },
    dailyLogs: { byProject: async () => [] },
    issues: { byProject: async () => [] },
    redlines: { mapPaths: async () => [], sheetPaths: async () => [] },
    reviews: {
      engineBundle: reviewerReads.engineBundle,
      engineDesignStrokeArtifacts: reviewerReads.engineDesignStrokeArtifacts,
      engineRunAssembly: reviewerReads.engineRunAssembly,
      engineRedlineManifest: productRedlineManifest,
    },
    playback: { byRun: async () => [] },
    sheets: { byProject: async () => [], get: async () => undefined, pins: async () => [] },
    closeout: { readiness: async () => undefined, packet: async () => undefined },
    sync: {
      state: async (): Promise<SyncState> => ({
        state: 'offline',
        pendingPhotos: 0,
        pendingEvidence: 0,
        pendingTickets: 0,
      }),
    },
  };
}
