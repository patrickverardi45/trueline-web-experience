// Web-local adapter for the TrueLine v2 RUN-ASSEMBLY review-card transport (M9.6).
// Engine vocabulary stays outside the web/mobile parity-checked contracts. Read-only:
// the transport carries SUGGESTION-only review cards (no geometry, no AUTO, no writeback).

export type RunAssemblyContinuationClass =
  | 'RUN_CONTINUATION_CANDIDATE'
  | 'JUNCTION_DROP_BRANCH';

export interface RunAssemblyCard {
  readonly endBore: string;
  readonly startBore: string;
  readonly terminalAp: string;
  readonly spliceLoc: string | null;
  readonly endStation: string | null;
  readonly startStation: string | null;
  readonly continuationClass: RunAssemblyContinuationClass;
  readonly departureRunClass: string;
  readonly competingDepartures: number;
  readonly relation: 'END_START_SHARED_TERMINAL';
  readonly terminalIsEndOfFeed: boolean;
  readonly reviewOnly: true;
  readonly auto: false;
  readonly hasGeometry: false;
  readonly hasStrokes: false;
  readonly label: 'SUGGESTION_NOT_PLACEMENT';
  readonly humanAction: 'CONFIRM_OR_REJECT_RUN_ASSEMBLY';
  readonly detail: string;
  readonly cardSchemaVersion: string;
}

export interface RunAssemblyReview {
  readonly exportSchemaVersion: string;
  readonly cardSchemaVersion: string;
  readonly service: string;
  readonly sourceGitHead: string;
  readonly cards: readonly RunAssemblyCard[];
}

const EXPORT_SCHEMA = 'truelinev2-web-run-assembly-export-1';
const CARD_SCHEMA = 'truelinev2-run-assembly-review-1';
const SERVICE = 'RunAssemblyReviewService';
const RELATION = 'END_START_SHARED_TERMINAL';
const SUGGESTION_LABEL = 'SUGGESTION_NOT_PLACEMENT';
const HUMAN_ACTION = 'CONFIRM_OR_REJECT_RUN_ASSEMBLY';
const CONTINUATION_CANDIDATE = 'RUN_CONTINUATION_CANDIDATE';
const DROP_BRANCH = 'JUNCTION_DROP_BRANCH';
const DROP = 'drop';
const FULL_SHA = /^[0-9a-f]{40}$/;

// geometry/stroke/render keys + product-bucket keys that may NEVER appear anywhere in
// the run-assembly transport (mirrors the engine validate_export _FORBIDDEN_KEYS).
const FORBIDDEN_KEYS = new Set<string>([
  'segments',
  'stroke_points',
  'stroke_rgb',
  'walk_points',
  'boundary_xy',
  'lon',
  'lat',
  'geometry',
  'artifact_refs',
  'lane',
  'lane_counts',
  'status_counts',
  'payloads',
  'confidence_class',
]);

// strict key allowlists -- mirror the engine validate_export (which rejects ANY unknown
// top-level / source / card key). The deny-list above is belt-and-suspenders; these
// allowlists are the load-bearing fail-closed gate against drift / smuggled fields.
const ROOT_KEYS = ['cards', 'export_schema_version', 'source'];
const SOURCE_KEYS = ['card_schema_version', 'engine', 'service', 'source_git_head'];
const CARD_KEYS = [
  'auto',
  'competing_departures',
  'continuation_class',
  'departure_run_class',
  'detail',
  'end_bore',
  'end_station',
  'has_geometry',
  'has_strokes',
  'human_action',
  'label',
  'relation',
  'review_only',
  'schema_version',
  'splice_loc',
  'start_bore',
  'start_station',
  'terminal_ap',
  'terminal_is_end_of_feed',
];

function exactKeys(obj: Record<string, unknown>, expected: readonly string[], field: string): void {
  const got = Object.keys(obj).sort();
  const want = [...expected].sort();
  if (got.length !== want.length || got.some((key, index) => key !== want[index])) {
    throw new Error(`Invalid v2 run-assembly export: ${field} fields drift`);
  }
}

function assertNoForbidden(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbidden(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase().includes('.png')) {
      throw new Error(`Invalid v2 run-assembly export: PNG reference at ${path}`);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`Invalid v2 run-assembly export: forbidden key ${key} at ${path}`);
    }
    if (key.toLowerCase().includes('.png')) {
      throw new Error(`Invalid v2 run-assembly export: PNG reference key at ${path}.${key}`);
    }
    assertNoForbidden(child, `${path}.${key}`);
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid v2 run-assembly export: ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid v2 run-assembly export: ${field} must be a string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return string(value, field);
}

function exactTrue(value: unknown, field: string): true {
  if (value !== true) {
    throw new Error(`Invalid v2 run-assembly export: ${field} must be exactly true`);
  }
  return true;
}

function exactFalse(value: unknown, field: string): false {
  if (value !== false) {
    throw new Error(`Invalid v2 run-assembly export: ${field} must be exactly false`);
  }
  return false;
}

function terminalAp(value: unknown, field: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`Invalid v2 run-assembly export: ${field} must be a number or string`);
}

function continuationClass(value: unknown): RunAssemblyContinuationClass {
  if (value === CONTINUATION_CANDIDATE || value === DROP_BRANCH) return value;
  throw new Error(`Invalid v2 run-assembly export: unknown continuation_class ${String(value)}`);
}

function adaptCard(value: unknown, index: number): RunAssemblyCard {
  const card = record(value, `cards[${index}]`);
  exactKeys(card, CARD_KEYS, `cards[${index}]`);

  if (card.schema_version !== CARD_SCHEMA) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}] schema version drift`);
  }
  if (card.relation !== RELATION) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}] relation drift`);
  }
  if (card.label !== SUGGESTION_LABEL) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}] label is not SUGGESTION_NOT_PLACEMENT`);
  }
  if (card.human_action !== HUMAN_ACTION) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}] human_action drift`);
  }

  const continuation = continuationClass(card.continuation_class);
  const departure = string(card.departure_run_class, `cards[${index}].departure_run_class`);
  if (continuation === DROP_BRANCH && departure !== DROP) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}] DROP_BRANCH without a 'drop' departure`);
  }
  if (continuation === CONTINUATION_CANDIDATE && departure === DROP) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}] a 'drop' departure can never be a CANDIDATE`);
  }

  const competing = card.competing_departures;
  if (typeof competing !== 'number' || !Number.isInteger(competing) || competing < 0) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}].competing_departures must be a non-negative integer`);
  }

  const endBore = string(card.end_bore, `cards[${index}].end_bore`);
  const startBore = string(card.start_bore, `cards[${index}].start_bore`);
  if (endBore === startBore) {
    throw new Error(`Invalid v2 run-assembly export: cards[${index}] is a self-junction`);
  }

  return {
    endBore,
    startBore,
    terminalAp: terminalAp(card.terminal_ap, `cards[${index}].terminal_ap`),
    spliceLoc: optionalString(card.splice_loc, `cards[${index}].splice_loc`),
    endStation: optionalString(card.end_station, `cards[${index}].end_station`),
    startStation: optionalString(card.start_station, `cards[${index}].start_station`),
    continuationClass: continuation,
    departureRunClass: departure,
    competingDepartures: competing,
    relation: RELATION,
    terminalIsEndOfFeed: exactTrue(card.terminal_is_end_of_feed, `cards[${index}].terminal_is_end_of_feed`),
    reviewOnly: exactTrue(card.review_only, `cards[${index}].review_only`),
    auto: exactFalse(card.auto, `cards[${index}].auto`),
    hasGeometry: exactFalse(card.has_geometry, `cards[${index}].has_geometry`),
    hasStrokes: exactFalse(card.has_strokes, `cards[${index}].has_strokes`),
    label: SUGGESTION_LABEL,
    humanAction: HUMAN_ACTION,
    detail: string(card.detail, `cards[${index}].detail`),
    cardSchemaVersion: CARD_SCHEMA,
  };
}

export function adaptV2RunAssembly(value: unknown): RunAssemblyReview {
  assertNoForbidden(value);
  const root = record(value, 'root');
  exactKeys(root, ROOT_KEYS, 'top-level');
  if (root.export_schema_version !== EXPORT_SCHEMA) {
    throw new Error('Invalid v2 run-assembly export: export schema version drift');
  }

  const source = record(root.source, 'source');
  exactKeys(source, SOURCE_KEYS, 'source');
  if (source.service !== SERVICE) {
    throw new Error('Invalid v2 run-assembly export: source.service drift');
  }
  if (source.card_schema_version !== CARD_SCHEMA) {
    throw new Error('Invalid v2 run-assembly export: source.card_schema_version drift');
  }
  string(source.engine, 'source.engine');
  const sourceGitHead = string(source.source_git_head, 'source.source_git_head');
  if (!FULL_SHA.test(sourceGitHead)) {
    throw new Error('Invalid v2 run-assembly export: source_git_head must be a full Git SHA');
  }

  if (!Array.isArray(root.cards)) {
    throw new Error('Invalid v2 run-assembly export: cards must be an array');
  }
  const cards = root.cards.map(adaptCard);

  return {
    exportSchemaVersion: EXPORT_SCHEMA,
    cardSchemaVersion: CARD_SCHEMA,
    service: SERVICE,
    sourceGitHead,
    cards,
  };
}
