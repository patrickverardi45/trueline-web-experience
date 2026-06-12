// Web-local adapter for the static v2 DESIGN-STROKE artifact manifest.
//
// Slice 2 (availability only): this surfaces the engine's canonical artifact
// filenames so the UI can show WHICH proof artifacts exist, WITHOUT serving any
// image. It is deliberately strict and read-only:
//   * no geometry ever crosses (segments / stroke_points are rejected);
//   * every ref must be a bare engine filename, never a path or URL — nothing
//     here can point the UI at a servable asset;
//   * `served` must be false in this slice (no image pipeline exists yet);
//   * design grades are a closed class; PASS_ACCEPTED only when the engine said so.
// Engine vocabulary stays outside the web/mobile parity-checked contracts.

export type EngineDesignGrade = 'PASS_ACCEPTED' | 'UNGRADED';

export interface EngineArtifactRef {
  /** The engine's canonical artifact filename (NOT a path or URL). */
  readonly fileName: string;
  /** This slice serves no images; always false here. */
  readonly served: false;
}

export interface EngineArtifactCard {
  readonly sourceBoreId: string;
  readonly laneStatus: string;
  readonly designGrade: EngineDesignGrade;
  readonly sheets: readonly number[];
  readonly artifacts: readonly EngineArtifactRef[];
}

export interface EngineArtifactManifest {
  readonly exportSchemaVersion: string;
  readonly cardContract: string;
  readonly lane: string;
  /** Whole-manifest serving flag; false in this slice. */
  readonly served: false;
  readonly cards: readonly EngineArtifactCard[];
}

const EXPORT_SCHEMA = 'truelinev2-web-design-stroke-artifacts-1';
const CARD_CONTRACT = 'truelinev2-design-stroke-card-1';
const DESIGN_GRADES = new Set<EngineDesignGrade>(['PASS_ACCEPTED', 'UNGRADED']);
// A bare engine artifact filename. No directory separators, no scheme — so a
// manifest can never smuggle a path/URL the UI might try to load.
const ARTIFACT_FILENAME = /^[a-z0-9_]+_redline_stroke\.png$/;
const FORBIDDEN_GEOMETRY = new Set(['segments', 'stroke_points']);

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid v2 artifact manifest: ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNoGeometry(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoGeometry(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_GEOMETRY.has(key)) {
      throw new Error(`Invalid v2 artifact manifest: geometry key ${key} at ${path}`);
    }
    assertNoGeometry(child, `${path}.${key}`);
  }
}

function designGrade(value: unknown): EngineDesignGrade {
  if (typeof value !== 'string' || !DESIGN_GRADES.has(value as EngineDesignGrade)) {
    throw new Error(`Invalid v2 artifact manifest: unknown design grade ${String(value)}`);
  }
  return value as EngineDesignGrade;
}

function sheets(value: unknown, field: string): number[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'number' || !Number.isInteger(item))
  ) {
    throw new Error(`Invalid v2 artifact manifest: ${field} must be an integer array`);
  }
  return [...(value as number[])];
}

function artifactRef(value: unknown, field: string): EngineArtifactRef {
  if (typeof value !== 'string' || !ARTIFACT_FILENAME.test(value)) {
    throw new Error(
      `Invalid v2 artifact manifest: ${field} must be a bare engine artifact filename`,
    );
  }
  return { fileName: value, served: false };
}

function adaptCard(value: unknown, index: number): EngineArtifactCard {
  const card = record(value, `artifacts[${index}]`);
  const refs = card.artifact_refs;
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new Error(`Invalid v2 artifact manifest: artifacts[${index}].artifact_refs is empty`);
  }
  const boreId = card.source_bore_id;
  if (typeof boreId !== 'string' || boreId.length === 0) {
    throw new Error(`Invalid v2 artifact manifest: artifacts[${index}].source_bore_id`);
  }
  const laneStatus = card.lane_status;
  if (typeof laneStatus !== 'string' || laneStatus.length === 0) {
    throw new Error(`Invalid v2 artifact manifest: artifacts[${index}].lane_status`);
  }
  return {
    sourceBoreId: boreId,
    laneStatus,
    designGrade: designGrade(card.design_grade),
    sheets: sheets(card.sheets, `artifacts[${index}].sheets`),
    artifacts: refs.map((ref, refIndex) =>
      artifactRef(ref, `artifacts[${index}].artifact_refs[${refIndex}]`),
    ),
  };
}

export function adaptV2DesignStrokeArtifacts(value: unknown): EngineArtifactManifest {
  assertNoGeometry(value);
  const root = record(value, 'root');
  if (root.export_schema_version !== EXPORT_SCHEMA) {
    throw new Error('Invalid v2 artifact manifest: export schema version drift');
  }
  const source = record(root.source, 'source');
  if (source.card_contract !== CARD_CONTRACT) {
    throw new Error('Invalid v2 artifact manifest: card contract drift');
  }
  if (source.served !== false) {
    throw new Error('Invalid v2 artifact manifest: this slice serves no artifacts');
  }
  const lane = source.lane;
  if (typeof lane !== 'string' || lane.length === 0) {
    throw new Error('Invalid v2 artifact manifest: source.lane');
  }
  if (!Array.isArray(root.artifacts)) {
    throw new Error('Invalid v2 artifact manifest: artifacts must be an array');
  }
  return {
    exportSchemaVersion: EXPORT_SCHEMA,
    cardContract: CARD_CONTRACT,
    lane,
    served: false,
    cards: root.artifacts.map(adaptCard),
  };
}
