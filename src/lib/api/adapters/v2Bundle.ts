// Web-local adapter for the static TrueLine v2 reviewer bundle.
// Engine vocabulary stays outside the web/mobile parity-checked contracts.

export const ENGINE_LANES = [
  'PLACED_REVIEW',
  'PICK_CARD_ROUTE_SUGGESTION',
  'HUMAN_ADJUSTABLE_LENGTH_REDLINE',
  'OUT_OF_CLASS',
  'SOURCE_REVIEW_REQUIRED',
  'UNSAFE_ABSTAIN',
] as const;

export type EngineLane = (typeof ENGINE_LANES)[number];

export type EngineConfidenceClass =
  | 'AUTO_EXACT_MATCH'
  | 'REVIEW_CAVEATED'
  | 'REVIEW_OPTIN_SOLVER';

export type EngineReviewStatus =
  | 'placement-review'
  | 'suggestion-not-placement'
  | 'adjustment-required'
  | 'solver-blocked'
  | 'source-review-required'
  | 'unsafe-abstain';

export type EngineHumanAction =
  | 'APPROVE_REJECT_EDIT'
  | 'PICK_ONE_REJECT_ALL_OR_DRAW'
  | 'DRAG_SNAP_CONFIRM_OR_DRAW'
  | 'ROUTE_TO_NAMED_SOLVER'
  | 'FIX_SOURCE_DATA'
  | 'NONE_BLOCKED';

export type EngineTruthLabel =
  | 'PLACEMENT_FOR_REVIEW'
  | 'SUGGESTION_NOT_PLACEMENT'
  | 'NOT_PLACED';

export interface EngineCandidate {
  readonly candidateId: string;
  readonly sheets: readonly number[];
  readonly startStation?: string;
  readonly endStation?: string;
  readonly stationMath: string;
  readonly footageCheck: string;
  readonly evidenceSummary: string;
  readonly whyNotAutoPlaced: string;
  readonly missingRelationshipToPromote: string;
  readonly label: 'SUGGESTION_NOT_PLACEMENT';
}

export interface EngineStationSummary {
  readonly startStation?: string;
  readonly endStation?: string;
  readonly startFt?: number;
  readonly endFt?: number;
  readonly footageFt?: number;
}

interface EngineCardFields {
  readonly sourceBoreId: string;
  readonly lane: EngineLane;
  readonly reviewStatus: EngineReviewStatus;
  readonly humanAction: EngineHumanAction;
  readonly truthLabel: EngineTruthLabel;
  readonly reasonCode: string;
  readonly blockerText?: string;
  readonly confidenceClass?: EngineConfidenceClass;
  readonly sheets: readonly number[];
  readonly station?: EngineStationSummary;
  readonly evidenceSummary?: string;
  readonly caveats: readonly string[];
  readonly candidates: readonly EngineCandidate[];
  readonly nextNamedSolver?: string;
  readonly namedMissingRelationship?: string;
  readonly suspectValues?: Readonly<Record<string, unknown>>;
  readonly sourceSchemaVersion: string;
}

export type EngineCard = EngineCardFields &
  (
    | {
        readonly runMapping: 'mapped';
        readonly runId: string;
      }
    | {
        readonly runMapping: 'unmapped';
        readonly runId: null;
      }
  );

export interface EngineRunMappingRef {
  readonly id: string;
  readonly boreLogRef?: {
    readonly refId: string;
  };
}

export interface EngineReviewBundle {
  readonly exportSchemaVersion: string;
  readonly bundleSchemaVersion: string;
  readonly payloadSchemaVersion: string;
  readonly sourceGitHead: string;
  readonly projectId: string;
  readonly runMode: 'default_baseline';
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly laneCounts: Readonly<Record<string, number>>;
  readonly cards: readonly EngineCard[];
}

const EXPORT_SCHEMA = 'truelinev2-web-reviewer-bundle-export-1';
const BUNDLE_SCHEMA = 'truelinev2-reviewer-bundle-1';
const PAYLOAD_SCHEMA = 'truelinev2-reviewer-lanes-1';
const SUGGESTION_LABEL = 'SUGGESTION_NOT_PLACEMENT';

const CONFIDENCE_CLASSES = new Set<EngineConfidenceClass>([
  'AUTO_EXACT_MATCH',
  'REVIEW_CAVEATED',
  'REVIEW_OPTIN_SOLVER',
]);

const HUMAN_ACTIONS = new Set<EngineHumanAction>([
  'APPROVE_REJECT_EDIT',
  'PICK_ONE_REJECT_ALL_OR_DRAW',
  'DRAG_SNAP_CONFIRM_OR_DRAW',
  'ROUTE_TO_NAMED_SOLVER',
  'FIX_SOURCE_DATA',
  'NONE_BLOCKED',
]);

const LANE_STATUS: Record<EngineLane, EngineReviewStatus> = {
  PLACED_REVIEW: 'placement-review',
  PICK_CARD_ROUTE_SUGGESTION: 'suggestion-not-placement',
  HUMAN_ADJUSTABLE_LENGTH_REDLINE: 'adjustment-required',
  OUT_OF_CLASS: 'solver-blocked',
  SOURCE_REVIEW_REQUIRED: 'source-review-required',
  UNSAFE_ABSTAIN: 'unsafe-abstain',
};

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid v2 reviewer bundle: ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid v2 reviewer bundle: ${field} must be a string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return string(value, field);
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid v2 reviewer bundle: ${field} must be a finite number`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid v2 reviewer bundle: ${field} must be a string array`);
  }
  return [...value];
}

function numberArray(value: unknown, field: string): number[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    throw new Error(`Invalid v2 reviewer bundle: ${field} must be a number array`);
  }
  return [...value];
}

function numberRecord(value: unknown, field: string): Record<string, number> {
  const source = record(value, field);
  const entries = Object.entries(source);
  if (entries.some(([, count]) => typeof count !== 'number' || !Number.isFinite(count))) {
    throw new Error(`Invalid v2 reviewer bundle: ${field} values must be numbers`);
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

function engineLane(value: unknown): EngineLane {
  if (typeof value !== 'string' || !ENGINE_LANES.includes(value as EngineLane)) {
    throw new Error(`Invalid v2 reviewer bundle: unknown lane ${String(value)}`);
  }
  return value as EngineLane;
}

function humanAction(value: unknown): EngineHumanAction {
  if (typeof value !== 'string' || !HUMAN_ACTIONS.has(value as EngineHumanAction)) {
    throw new Error(`Invalid v2 reviewer bundle: unknown human action ${String(value)}`);
  }
  return value as EngineHumanAction;
}

function confidenceClass(value: unknown): EngineConfidenceClass | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string' || !CONFIDENCE_CLASSES.has(value as EngineConfidenceClass)) {
    throw new Error(`Invalid v2 reviewer bundle: unknown confidence class ${String(value)}`);
  }
  return value as EngineConfidenceClass;
}

function adaptCandidate(value: unknown, index: number): EngineCandidate {
  const candidate = record(value, `candidate[${index}]`);
  const label = string(candidate.label, `candidate[${index}].label`);
  if (label !== SUGGESTION_LABEL) {
    throw new Error(`Invalid v2 reviewer bundle: candidate label drift (${label})`);
  }

  return {
    candidateId: string(candidate.candidate_id, `candidate[${index}].candidate_id`),
    sheets: numberArray(candidate.sheets, `candidate[${index}].sheets`),
    startStation: optionalString(candidate.start_sta, `candidate[${index}].start_sta`),
    endStation: optionalString(candidate.end_sta, `candidate[${index}].end_sta`),
    stationMath: string(candidate.station_math, `candidate[${index}].station_math`),
    footageCheck: string(candidate.footage_check, `candidate[${index}].footage_check`),
    evidenceSummary: string(
      candidate.evidence_summary,
      `candidate[${index}].evidence_summary`,
    ),
    whyNotAutoPlaced: string(
      candidate.why_not_auto_placed,
      `candidate[${index}].why_not_auto_placed`,
    ),
    missingRelationshipToPromote: string(
      candidate.missing_relationship_to_promote,
      `candidate[${index}].missing_relationship_to_promote`,
    ),
    label: SUGGESTION_LABEL,
  };
}

function adaptCard(
  value: unknown,
  index: number,
  runIdByBoreId: ReadonlyMap<string, string>,
): EngineCard {
  const payload = record(value, `payloads[${index}]`);
  const sourceBoreId = string(payload.bore_id, `payloads[${index}].bore_id`);
  const runId = runIdByBoreId.get(sourceBoreId);
  const lane = engineLane(payload.lane);
  const candidatesRaw = payload.candidates;
  if (!Array.isArray(candidatesRaw)) {
    throw new Error(`Invalid v2 reviewer bundle: payloads[${index}].candidates must be an array`);
  }
  const candidates = candidatesRaw.map(adaptCandidate);
  if (lane === 'PICK_CARD_ROUTE_SUGGESTION' && candidates.length === 0) {
    throw new Error(`Invalid v2 reviewer bundle: ${payload.bore_id} has no suggestions`);
  }

  const confidence = confidenceClass(payload.confidence_class);
  if (lane !== 'PLACED_REVIEW' && confidence !== undefined) {
    throw new Error(`Invalid v2 reviewer bundle: confidence exists outside PLACED_REVIEW`);
  }

  const startStation = optionalString(payload.station_start_sta, `payloads[${index}].start`);
  const endStation = optionalString(payload.station_end_sta, `payloads[${index}].end`);
  const startFt = optionalNumber(payload.station_start_ft, `payloads[${index}].start_ft`);
  const endFt = optionalNumber(payload.station_end_ft, `payloads[${index}].end_ft`);
  const footageFt = optionalNumber(payload.footage_ft, `payloads[${index}].footage_ft`);
  const station =
    startStation !== undefined ||
    endStation !== undefined ||
    startFt !== undefined ||
    endFt !== undefined ||
    footageFt !== undefined
      ? { startStation, endStation, startFt, endFt, footageFt }
      : undefined;

  const namedMissing = optionalString(
    payload.named_missing_relationship,
    `payloads[${index}].named_missing_relationship`,
  );
  const nextSolver = optionalString(
    payload.next_named_solver,
    `payloads[${index}].next_named_solver`,
  );
  const caveats = stringArray(payload.caveats, `payloads[${index}].caveats`);
  const blockerText =
    namedMissing ??
    nextSolver ??
    candidates[0]?.whyNotAutoPlaced ??
    caveats[0] ??
    undefined;

  const suspectValues =
    payload.suspect_values === null || payload.suspect_values === undefined
      ? undefined
      : record(payload.suspect_values, `payloads[${index}].suspect_values`);

  return {
    sourceBoreId,
    ...(runId
      ? { runMapping: 'mapped' as const, runId }
      : { runMapping: 'unmapped' as const, runId: null }),
    lane,
    reviewStatus: LANE_STATUS[lane],
    humanAction: humanAction(payload.human_action),
    truthLabel:
      lane === 'PLACED_REVIEW'
        ? 'PLACEMENT_FOR_REVIEW'
        : lane === 'PICK_CARD_ROUTE_SUGGESTION'
          ? SUGGESTION_LABEL
          : 'NOT_PLACED',
    reasonCode: string(payload.reason_code, `payloads[${index}].reason_code`),
    blockerText,
    confidenceClass: confidence,
    sheets: numberArray(payload.sheets, `payloads[${index}].sheets`),
    station,
    evidenceSummary: optionalString(
      payload.evidence_summary,
      `payloads[${index}].evidence_summary`,
    ),
    caveats,
    candidates,
    nextNamedSolver: nextSolver,
    namedMissingRelationship: namedMissing,
    suspectValues,
    sourceSchemaVersion: string(
      payload.schema_version,
      `payloads[${index}].schema_version`,
    ),
  };
}

function assertNoGeometry(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoGeometry(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'segments' || key === 'stroke_points' || key === 'artifact_refs') {
      throw new Error(`Invalid v2 reviewer bundle: geometry/artifact key ${key} at ${path}`);
    }
    assertNoGeometry(child, `${path}.${key}`);
  }
}

function indexRunMappings(runs: readonly EngineRunMappingRef[]): Map<string, string> {
  const runIdByBoreId = new Map<string, string>();
  for (const run of runs) {
    const boreId = run.boreLogRef?.refId;
    if (!boreId) continue;
    if (runIdByBoreId.has(boreId)) {
      throw new Error(`Invalid v2 run mapping: duplicate boreLogRef.refId ${boreId}`);
    }
    runIdByBoreId.set(boreId, run.id);
  }
  return runIdByBoreId;
}

export function adaptV2ReviewerBundle(
  value: unknown,
  runs: readonly EngineRunMappingRef[] = [],
): EngineReviewBundle {
  assertNoGeometry(value);
  const root = record(value, 'root');
  if (root.export_schema_version !== EXPORT_SCHEMA) {
    throw new Error('Invalid v2 reviewer bundle: export schema version drift');
  }

  const source = record(root.source, 'source');
  const bundle = record(root.bundle, 'bundle');
  if (bundle.bundle_schema_version !== BUNDLE_SCHEMA) {
    throw new Error('Invalid v2 reviewer bundle: bundle schema version drift');
  }
  if (bundle.payload_schema_version !== PAYLOAD_SCHEMA) {
    throw new Error('Invalid v2 reviewer bundle: payload schema version drift');
  }
  if (source.run_mode !== 'default_baseline' || bundle.run_mode !== 'default_baseline') {
    throw new Error('Invalid v2 reviewer bundle: only default_baseline is allowed');
  }

  if (!Array.isArray(bundle.payloads)) {
    throw new Error('Invalid v2 reviewer bundle: payloads must be an array');
  }
  const runIdByBoreId = indexRunMappings(runs);
  const cards = bundle.payloads.map((payload, index) =>
    adaptCard(payload, index, runIdByBoreId),
  );

  return {
    exportSchemaVersion: EXPORT_SCHEMA,
    bundleSchemaVersion: BUNDLE_SCHEMA,
    payloadSchemaVersion: PAYLOAD_SCHEMA,
    sourceGitHead: string(source.source_git_head, 'source.source_git_head'),
    projectId: string(bundle.project_id, 'bundle.project_id'),
    runMode: 'default_baseline',
    statusCounts: numberRecord(bundle.status_counts, 'bundle.status_counts'),
    laneCounts: numberRecord(bundle.lane_counts, 'bundle.lane_counts'),
    cards,
  };
}
