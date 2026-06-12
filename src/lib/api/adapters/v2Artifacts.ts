// Web-local adapter for the static v2 DESIGN-STROKE artifact manifest.
//
// Two modes, discriminated by the manifest's `served` flag:
//   * AVAILABILITY (served:false, Slice 2a): surfaces the engine's canonical
//     artifact FILENAMES so the UI can show WHICH proof artifacts exist, with no
//     image and no URL.
//   * SERVED (served:true, Slice 2b): each ref additionally carries a site-
//     absolute `/engine-artifacts/<source_sha>/<file>` URL that the UI loads on
//     demand. The PNGs are copied into the web app's `public/` tree at export
//     time and gitignored — never committed.
//
// It is deliberately strict and read-only:
//   * no geometry ever crosses (segments / stroke_points are rejected);
//   * every ref must be a bare engine filename, never a path or URL;
//   * every served URL must match `/engine-artifacts/<sha>/<file>` EXACTLY, with
//     the sha bound to the manifest source and the leaf bound to the ref — so a
//     manifest can never point the UI off-tree or off-site;
//   * design grades are a closed class; PASS_ACCEPTED only when the engine said so.
// Engine vocabulary stays outside the web/mobile parity-checked contracts.

export type EngineDesignGrade = 'PASS_ACCEPTED' | 'UNGRADED';

export interface EngineArtifactRef {
  /** The engine's canonical artifact filename (NOT a path or URL). */
  readonly fileName: string;
  /** Whether a servable image URL exists for this ref. */
  readonly served: boolean;
  /** Site-absolute URL when served; null in availability-only mode. */
  readonly url: string | null;
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
  /** Whole-manifest serving flag. */
  readonly served: boolean;
  readonly cards: readonly EngineArtifactCard[];
}

const EXPORT_SCHEMA = 'truelinev2-web-design-stroke-artifacts-1';
const CARD_CONTRACT = 'truelinev2-design-stroke-card-1';
const DESIGN_GRADES = new Set<EngineDesignGrade>(['PASS_ACCEPTED', 'UNGRADED']);
// A bare engine artifact filename. No directory separators, no scheme — so a
// manifest can never smuggle a path/URL the UI might try to load.
const ARTIFACT_FILENAME = /^[a-z0-9_]+_redline_stroke\.png$/;
const SOURCE_SHA = /^[0-9a-f]{40}$/;
// A served URL: site-absolute, SHA-namespaced, bare engine filename leaf. The
// capture groups let us bind the sha to the manifest source and the leaf to the
// ref. Nothing with a scheme, `..`, or backslash can match.
const SERVED_URL = /^\/engine-artifacts\/([0-9a-f]{40})\/([a-z0-9_]+_redline_stroke\.png)$/;
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

function fileName(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ARTIFACT_FILENAME.test(value)) {
    throw new Error(
      `Invalid v2 artifact manifest: ${field} must be a bare engine artifact filename`,
    );
  }
  return value;
}

/** Availability mode: a known filename, no servable URL. */
function availabilityRef(value: unknown, field: string): EngineArtifactRef {
  return { fileName: fileName(value, field), served: false, url: null };
}

/** Served mode: a filename plus its sha-bound, ref-bound, in-tree URL. */
function servedRef(
  refValue: unknown,
  urlValue: unknown,
  sha: string,
  field: string,
): EngineArtifactRef {
  const name = fileName(refValue, field);
  if (typeof urlValue !== 'string') {
    throw new Error(`Invalid v2 artifact manifest: ${field} url must be a string`);
  }
  const match = SERVED_URL.exec(urlValue);
  if (!match) {
    throw new Error(
      `Invalid v2 artifact manifest: ${field} url must be /engine-artifacts/<sha>/<file>`,
    );
  }
  if (match[1] !== sha || match[2] !== name) {
    throw new Error(
      `Invalid v2 artifact manifest: ${field} url must match the source sha and ref`,
    );
  }
  return { fileName: name, served: true, url: urlValue };
}

function adaptCard(
  value: unknown,
  index: number,
  served: boolean,
  sha: string,
): EngineArtifactCard {
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

  let artifacts: EngineArtifactRef[];
  if (served) {
    const urls = card.artifact_urls;
    if (!Array.isArray(urls) || urls.length !== refs.length) {
      throw new Error(
        `Invalid v2 artifact manifest: artifacts[${index}].artifact_urls must pair 1:1 with refs`,
      );
    }
    artifacts = refs.map((ref, refIndex) =>
      servedRef(ref, urls[refIndex], sha, `artifacts[${index}].artifact_refs[${refIndex}]`),
    );
  } else {
    artifacts = refs.map((ref, refIndex) =>
      availabilityRef(ref, `artifacts[${index}].artifact_refs[${refIndex}]`),
    );
  }

  return {
    sourceBoreId: boreId,
    laneStatus,
    designGrade: designGrade(card.design_grade),
    sheets: sheets(card.sheets, `artifacts[${index}].sheets`),
    artifacts,
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
  if (typeof source.served !== 'boolean') {
    throw new Error('Invalid v2 artifact manifest: source.served must be a boolean');
  }
  const sha = source.source_git_head;
  if (typeof sha !== 'string' || !SOURCE_SHA.test(sha)) {
    throw new Error('Invalid v2 artifact manifest: source.source_git_head must be a full Git SHA');
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
    served: source.served,
    cards: root.artifacts.map((card, index) => adaptCard(card, index, source.served as boolean, sha)),
  };
}
