// Web-local adapter for the engine's durable v2 redline-manifest bundle (Phase 2K).
//
// Read-only consumer of the published `redline_manifest.json` contract (the durable bundle store's
// `store_index.json -> latest_valid -> bundles/<id>/redline_manifest.json`). It is the web mirror of
// the engine's Phase-2J StaticBundleConsumer and enforces the SAME website read contract:
//   * consume a COMPLETED, VALIDATED bundle only; `mock_example` MUST be false (reject a mock bundle);
//   * resolve artifacts by manifest PATH + sha256 — never infer status from PNG filenames;
//   * expose only `kind === FINAL_REDLINE_PNG`; covered/blocked logs carry NO artifacts (rejected);
//   * never read parent_source_model / placement_status or any stale source/model field (rejected);
//   * never let geometry cross (segments / stroke_points rejected);
//   * resolve via the store's `latest_valid` pointer and cross-check the manifest against it.
//
// Engine vocabulary (DRAWN_REDLINE / FINAL_REDLINE_PNG / NEW_TARGETS …) stays HERE at the adapter
// edge — never in the web/mobile parity-checked contracts. Served PNGs live under the gitignored
// `public/redline-bundle/<bundleId>/...` tree (copied by `npm run export:redline-bundle`); when not
// exported, the view is availability-only (filenames, no images).

export type RedlineStatus =
  | 'DRAWN_REDLINE'
  | 'COVERED_BY_EXISTING_REDLINE'
  | 'OWNER_LOCKED_ABSTAIN'
  | 'SOURCE_GAP_BLOCKED'
  | 'MISSING_SOURCE_SHEET_BLOCKED';

export type RedlineProvenance =
  | 'DETERMINISTIC_AUTO'
  | 'OWNER_CONFIRMED_HUMAN_ADJUSTABLE'
  | 'COVERED_BY_EXISTING_REDLINE'
  | 'BLOCKED_OWNER_LOCKED'
  | 'BLOCKED_SOURCE_GAP'
  | 'BLOCKED_MISSING_SOURCE';

export type RedlineDrawnLane = 'ALREADY_DRAWN' | 'NEW_TARGETS' | null;

export interface RedlineArtifactRef {
  /** The engine's canonical artifact filename (basename of the manifest path). */
  readonly fileName: string;
  /** The bundle-relative manifest path (artifacts/<log>/<file>.png) — the resolve key. */
  readonly manifestPath: string;
  readonly sha256: string;
  readonly bytes: number;
  /** Whether a servable image URL exists (PNGs exported into public/). */
  readonly served: boolean;
  /** Site-absolute URL when served; null in availability-only mode. */
  readonly url: string | null;
}

export interface RedlineSpan {
  readonly startStation: string;
  readonly endStation: string;
  readonly label: string;
}

export interface RedlineLogEntry {
  readonly logId: string;
  readonly parentId: string;
  readonly status: RedlineStatus;
  readonly provenance: RedlineProvenance;
  readonly drawn: boolean;
  readonly covered: boolean;
  readonly blocked: boolean;
  readonly drawnLane: RedlineDrawnLane;
  readonly sourceSheets: readonly number[];
  readonly span: RedlineSpan;
  /** FINAL_REDLINE_PNG only; always empty for covered/blocked logs. */
  readonly artifacts: readonly RedlineArtifactRef[];
  readonly coveredBy?: string;
  readonly blockerName?: string;
  readonly unlockRequirement?: string;
  readonly warnings: readonly string[];
}

export interface RedlineManifestView {
  readonly bundleId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly renderCommit: string;
  readonly engineHead: string;
  readonly schemaVersion: string;
  readonly frontier: string;
  readonly totals: {
    readonly total: number;
    readonly drawn: number;
    readonly covered: number;
    readonly blocked: number;
  };
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly provenanceCounts: Readonly<Record<string, number>>;
  /** True when servable image URLs were produced (PNGs exported); false = availability-only. */
  readonly served: boolean;
  readonly consumptionRules: readonly string[];
  readonly logs: readonly RedlineLogEntry[];
  /** Convenience: drawn logs only (the ones that carry FINAL_REDLINE_PNG artifacts). */
  readonly drawnLogs: readonly RedlineLogEntry[];
  readonly artifactCount: number;
  readonly artifactBytes: number;
}

const SCHEMA_VERSION = '1.0.0';
const STORE_FORMAT = 'trueline-redline-bundle-store-1';
const FINAL_KIND = 'FINAL_REDLINE_PNG';
// Stale source/model fields a consumer must never read or serve.
const FORBIDDEN_FIELDS = new Set(['parent_source_model', 'placement_status']);
// Geometry must never cross the web boundary.
const FORBIDDEN_GEOMETRY = new Set(['segments', 'stroke_points']);
// Safe, layout-bound artifact path; rejects traversal, URLs, backslashes, absolute paths.
const ARTIFACT_PATH = /^artifacts\/[a-z0-9_]+\/[a-z0-9_]+\.png$/;
// Content-keyed bundle id (e.g. demo-project-c19b565-deadbeefcafe); bounds the served URL prefix.
const BUNDLE_ID = /^[a-z0-9][a-z0-9._-]*$/;

const STATUSES = new Set<RedlineStatus>([
  'DRAWN_REDLINE',
  'COVERED_BY_EXISTING_REDLINE',
  'OWNER_LOCKED_ABSTAIN',
  'SOURCE_GAP_BLOCKED',
  'MISSING_SOURCE_SHEET_BLOCKED',
]);
const PROVENANCES = new Set<RedlineProvenance>([
  'DETERMINISTIC_AUTO',
  'OWNER_CONFIRMED_HUMAN_ADJUSTABLE',
  'COVERED_BY_EXISTING_REDLINE',
  'BLOCKED_OWNER_LOCKED',
  'BLOCKED_SOURCE_GAP',
  'BLOCKED_MISSING_SOURCE',
]);
const DRAWN_LANES = new Set(['ALREADY_DRAWN', 'NEW_TARGETS']);

export interface V2RedlineManifestOptions {
  /** True only when the PNGs were exported into public/redline-bundle (served mode). */
  readonly served?: boolean;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid v2 redline manifest: ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid v2 redline manifest: ${field} must be a string`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid v2 redline manifest: ${field} must be a boolean`);
  }
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Invalid v2 redline manifest: ${field} must be an integer`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return string(value, field);
}

function numberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error(`Invalid v2 redline manifest: ${field} must be a number array`);
  }
  return [...(value as number[])];
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((s) => typeof s !== 'string')) {
    throw new Error(`Invalid v2 redline manifest: ${field} must be a string array`);
  }
  return [...(value as string[])];
}

function numberRecord(value: unknown, field: string): Record<string, number> {
  const source = record(value, field);
  for (const [, count] of Object.entries(source)) {
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      throw new Error(`Invalid v2 redline manifest: ${field} values must be numbers`);
    }
  }
  return { ...(source as Record<string, number>) };
}

/** Reject geometry keys AND stale source/model fields ANYWHERE in the manifest. */
function assertSafe(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafe(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_GEOMETRY.has(key)) {
      throw new Error(`Invalid v2 redline manifest: geometry key '${key}' at ${path}`);
    }
    if (FORBIDDEN_FIELDS.has(key)) {
      throw new Error(`Invalid v2 redline manifest: forbidden stale field '${key}' at ${path}`);
    }
    assertSafe(child, `${path}.${key}`);
  }
}

function adaptArtifact(
  value: unknown,
  index: number,
  logId: string,
  served: boolean,
  bundleId: string,
): RedlineArtifactRef {
  const a = record(value, `${logId}.artifacts[${index}]`);
  if (a.kind !== FINAL_KIND) {
    throw new Error(`Invalid v2 redline manifest: ${logId}.artifacts[${index}].kind must be ${FINAL_KIND}`);
  }
  const manifestPath = string(a.path, `${logId}.artifacts[${index}].path`);
  if (!ARTIFACT_PATH.test(manifestPath)) {
    throw new Error(
      `Invalid v2 redline manifest: ${logId}.artifacts[${index}].path is unsafe or off-layout (${manifestPath})`,
    );
  }
  const sha256 = string(a.sha256, `${logId}.artifacts[${index}].sha256`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`Invalid v2 redline manifest: ${logId}.artifacts[${index}].sha256 must be a 64-char hex digest`);
  }
  if (a.published !== true) {
    throw new Error(`Invalid v2 redline manifest: ${logId}.artifacts[${index}].published must be true`);
  }
  if (a.example_placeholder !== false) {
    throw new Error(`Invalid v2 redline manifest: ${logId}.artifacts[${index}].example_placeholder must be false`);
  }
  const fileName = manifestPath.slice(manifestPath.lastIndexOf('/') + 1);
  return {
    fileName,
    manifestPath,
    sha256,
    bytes: integer(a.bytes, `${logId}.artifacts[${index}].bytes`),
    served,
    url: served ? `/redline-bundle/${bundleId}/${manifestPath}` : null,
  };
}

function adaptLog(
  value: unknown,
  index: number,
  served: boolean,
  bundleId: string,
): RedlineLogEntry {
  const log = record(value, `logs[${index}]`);
  const logId = string(log.log_id, `logs[${index}].log_id`);

  const status = string(log.status, `${logId}.status`) as RedlineStatus;
  if (!STATUSES.has(status)) {
    throw new Error(`Invalid v2 redline manifest: ${logId}.status unknown (${status})`);
  }
  const provenance = string(log.provenance, `${logId}.provenance`) as RedlineProvenance;
  if (!PROVENANCES.has(provenance)) {
    throw new Error(`Invalid v2 redline manifest: ${logId}.provenance unknown (${provenance})`);
  }

  const drawn = boolean(log.drawn, `${logId}.drawn`);
  const covered = boolean(log.covered, `${logId}.covered`);
  const blocked = boolean(log.blocked, `${logId}.blocked`);
  if (Number(drawn) + Number(covered) + Number(blocked) !== 1) {
    throw new Error(`Invalid v2 redline manifest: ${logId} must be exactly one of drawn/covered/blocked`);
  }

  const drawnLane = log.drawn_lane;
  if (drawnLane !== null && !(typeof drawnLane === 'string' && DRAWN_LANES.has(drawnLane))) {
    throw new Error(`Invalid v2 redline manifest: ${logId}.drawn_lane unknown (${String(drawnLane)})`);
  }

  const rawArtifacts = Array.isArray(log.artifacts) ? log.artifacts : [];
  if (!drawn && rawArtifacts.length > 0) {
    throw new Error(`Invalid v2 redline manifest: ${logId} is covered/blocked but carries artifacts`);
  }
  const artifacts = drawn
    ? rawArtifacts.map((a, i) => adaptArtifact(a, i, logId, served, bundleId))
    : [];

  const coverage = log.coverage === null || log.coverage === undefined ? undefined : record(log.coverage, `${logId}.coverage`);
  const blocker = log.blocker === null || log.blocker === undefined ? undefined : record(log.blocker, `${logId}.blocker`);
  const span = record(log.span, `${logId}.span`);

  return {
    logId,
    parentId: string(log.parent_id, `${logId}.parent_id`),
    status,
    provenance,
    drawn,
    covered,
    blocked,
    drawnLane: (drawnLane ?? null) as RedlineDrawnLane,
    sourceSheets: numberArray(log.source_sheets, `${logId}.source_sheets`),
    span: {
      startStation: string(span.start_station, `${logId}.span.start_station`),
      endStation: string(span.end_station, `${logId}.span.end_station`),
      label: string(span.label, `${logId}.span.label`),
    },
    artifacts,
    coveredBy: coverage ? optionalString(coverage.covered_by, `${logId}.coverage.covered_by`) : undefined,
    blockerName: blocker ? optionalString(blocker.name, `${logId}.blocker.name`) : undefined,
    unlockRequirement: blocker
      ? optionalString(blocker.unlock_requirement, `${logId}.blocker.unlock_requirement`)
      : undefined,
    warnings: stringArray(log.warnings, `${logId}.warnings`),
  };
}

export function adaptV2RedlineManifest(
  storeIndex: unknown,
  manifest: unknown,
  options: V2RedlineManifestOptions = {},
): RedlineManifestView {
  const served = options.served ?? false;

  // --- store_index.json -> latest_valid -> the registered bundle entry ------------------------
  const si = record(storeIndex, 'storeIndex');
  if (si.store_format !== STORE_FORMAT) {
    throw new Error('Invalid v2 redline store: store_format drift');
  }
  const bundleId = string(si.latest_valid, 'storeIndex.latest_valid');
  if (!BUNDLE_ID.test(bundleId)) {
    throw new Error(`Invalid v2 redline store: unsafe latest_valid id (${bundleId})`);
  }
  const bundles = record(si.bundles, 'storeIndex.bundles');
  if (!(bundleId in bundles)) {
    throw new Error(`Invalid v2 redline store: latest_valid ${bundleId} not registered`);
  }
  const entry = record(bundles[bundleId], `storeIndex.bundles[${bundleId}]`);

  // --- the published manifest -----------------------------------------------------------------
  assertSafe(manifest);
  const m = record(manifest, 'manifest');
  if (m.schema_version !== SCHEMA_VERSION) {
    throw new Error('Invalid v2 redline manifest: schema_version drift');
  }
  if (m.mock_example !== false) {
    throw new Error('Invalid v2 redline manifest: mock_example must be false (refusing to serve a mock bundle)');
  }
  const engine = record(m.engine, 'manifest.engine');
  const renderCommit = string(engine.render_commit, 'manifest.engine.render_commit');
  const projectId = string(m.project_id, 'manifest.project_id');

  // Cross-check the manifest against the store's registered entry (identity + accounting).
  if (entry.render_commit !== renderCommit) {
    throw new Error('Invalid v2 redline store: latest_valid render_commit != manifest render_commit');
  }
  if (entry.project_id !== projectId) {
    throw new Error('Invalid v2 redline store: latest_valid project_id != manifest project_id');
  }

  const summary = record(m.summary, 'manifest.summary');
  const totals = {
    total: integer(summary.total_logs, 'summary.total_logs'),
    drawn: integer(summary.drawn_count, 'summary.drawn_count'),
    covered: integer(summary.covered_count, 'summary.covered_count'),
    blocked: integer(summary.blocked_count, 'summary.blocked_count'),
  };
  const entrySummary = record(entry.summary, `storeIndex.bundles[${bundleId}].summary`);
  if (
    entrySummary.total_logs !== totals.total ||
    entrySummary.drawn !== totals.drawn ||
    entrySummary.covered !== totals.covered ||
    entrySummary.blocked !== totals.blocked
  ) {
    throw new Error('Invalid v2 redline store: latest_valid summary counts != manifest summary');
  }

  if (!Array.isArray(m.logs) || m.logs.length === 0) {
    throw new Error('Invalid v2 redline manifest: logs must be a non-empty array');
  }
  const logs = m.logs.map((log, index) => adaptLog(log, index, served, bundleId));

  // Reconcile per-log truth against the declared totals (the manifest must not over/under-claim).
  const drawnLogs = logs.filter((l) => l.drawn);
  const counted = {
    total: logs.length,
    drawn: drawnLogs.length,
    covered: logs.filter((l) => l.covered).length,
    blocked: logs.filter((l) => l.blocked).length,
  };
  if (
    counted.total !== totals.total ||
    counted.drawn !== totals.drawn ||
    counted.covered !== totals.covered ||
    counted.blocked !== totals.blocked
  ) {
    throw new Error('Invalid v2 redline manifest: per-log counts do not reconcile with summary');
  }

  const allArtifacts = drawnLogs.flatMap((l) => l.artifacts);
  return {
    bundleId,
    projectId,
    projectName: string(m.project_name, 'manifest.project_name'),
    renderCommit,
    engineHead: string(engine.engine_head, 'manifest.engine.engine_head'),
    schemaVersion: SCHEMA_VERSION,
    frontier: string(summary.frontier, 'summary.frontier'),
    totals,
    statusCounts: numberRecord(m.status_counts, 'manifest.status_counts'),
    provenanceCounts: numberRecord(m.provenance_counts, 'manifest.provenance_counts'),
    served,
    consumptionRules: stringArray(m.consumption_rules, 'manifest.consumption_rules'),
    logs,
    drawnLogs,
    artifactCount: allArtifacts.length,
    artifactBytes: allArtifacts.reduce((total, a) => total + a.bytes, 0),
  };
}
