// Pure presentation for field-evidence packages: plain-English status/labels for the office review panel.
// No deps, no runtime imports (unit-checkable under plain Node) — the same convention as
// reviewReadinessStatus.ts. Raw backend codes never reach the primary UI through this module.

import type { FieldEvidencePackage, FieldEvidenceProblem } from '@/lib/api/fieldEvidence';

export type FieldEvidenceTone = 'ready' | 'progress' | 'blocked' | 'neutral';

export interface FieldEvidencePresentation {
  readonly label: string;
  readonly tone: FieldEvidenceTone;
  readonly plainEnglish: string;
}

/** The fixed, non-negotiable framing line for this lane. */
export const FIELD_EVIDENCE_SUPPORT_LINE =
  'Field evidence supports office review. It does not create final placement.';

// --- required-evidence derivation (display-side mirror of the backend's submit gate) ----------------- //

/** A required photo slot counts ONLY when it is bound to a real uploaded photo file (uploadId present) —
 *  a claimed-but-unbound slot is honestly missing, exactly as the backend's submit gate treats it. */
function hasBoundPhoto(pkg: FieldEvidencePackage, kind: string): boolean {
  return pkg.photos.some((p) => p.kind === kind && p.uploadId !== null);
}

function problemHasBoundPhoto(pkg: FieldEvidencePackage, problem: FieldEvidenceProblem): boolean {
  return problem.photoEvidenceIds.some((id) =>
    pkg.photos.some((p) => p.evidenceId === id && p.kind === 'PROBLEM_AREA' && p.uploadId !== null),
  );
}

/** Plain-English list of everything still missing before this package can be submitted (empty when
 *  complete). Order mirrors the backend gate: start photo, end photo, then problems in list order. */
export function missingEvidenceSummary(pkg: FieldEvidencePackage): string[] {
  const missing: string[] = [];
  if (!hasBoundPhoto(pkg, 'START_STATION')) missing.push('Start station photo not attached yet.');
  if (!hasBoundPhoto(pkg, 'END_STATION')) missing.push('End station photo not attached yet.');
  for (const problem of pkg.problems) {
    if (!problemHasBoundPhoto(pkg, problem)) {
      missing.push(`Problem area (${problemTypeLabel(problem.type).toLowerCase()}) still needs its photo.`);
    }
  }
  return missing;
}

/** Present a package's review state: Submitted for review / Missing required evidence / Draft. */
export function presentFieldEvidenceStatus(pkg: FieldEvidencePackage): FieldEvidencePresentation {
  if (pkg.status === 'SUBMITTED_FOR_REVIEW') {
    return {
      label: 'Submitted for review',
      tone: 'ready',
      plainEnglish: 'The crew submitted this evidence package — it is ready for the office to review.',
    };
  }
  if (pkg.status === 'DRAFT') {
    const missing = missingEvidenceSummary(pkg);
    if (missing.length > 0) {
      return {
        label: 'Missing required evidence',
        tone: 'blocked',
        plainEnglish: 'The crew is still capturing required evidence — this draft cannot be submitted yet.',
      };
    }
    return {
      label: 'Draft — not yet submitted',
      tone: 'progress',
      plainEnglish: 'Required evidence is attached; the crew has not submitted this package yet.',
    };
  }
  return {
    label: 'Evidence recorded',
    tone: 'neutral',
    plainEnglish: 'This evidence package is stored; its state is not one this app recognizes.',
  };
}

// --- vocabulary labels (backend snake_case → plain English; never raw in primary UI) ------------------ //

const PROBLEM_TYPE_LABEL: Record<string, string> = {
  obstruction: 'Obstruction',
  utility_conflict: 'Utility conflict',
  damage: 'Damage',
  station_mismatch: 'Station mismatch',
  route_deviation: 'Route deviation',
  unclear_endpoint: 'Unclear endpoint',
  blocked_access: 'Blocked access',
  other: 'Other problem',
};

/** Human label for a problem class; an unmapped class is humanized (never shown raw). */
export function problemTypeLabel(type: string): string {
  if (PROBLEM_TYPE_LABEL[type]) return PROBLEM_TYPE_LABEL[type];
  const humanized = type.replace(/_/g, ' ').trim();
  return humanized ? humanized.charAt(0).toUpperCase() + humanized.slice(1) : 'Problem';
}

const READING_METHOD_LABEL: Record<string, string> = {
  walkover_locator: 'Walkover locator',
  wireline: 'Wireline',
  manual: 'Manual',
  other: 'Other',
};

/** Human label for a locating method; an unmapped method is humanized (never shown raw). */
export function readingMethodLabel(method: string | null): string | null {
  if (method === null) return null;
  if (READING_METHOD_LABEL[method]) return READING_METHOD_LABEL[method];
  const humanized = method.replace(/_/g, ' ').trim();
  return humanized ? humanized.charAt(0).toUpperCase() + humanized.slice(1) : null;
}

const PHOTO_KIND_LABEL: Record<string, string> = {
  START_STATION: 'Start station photo',
  END_STATION: 'End station photo',
  PROBLEM_AREA: 'Problem photo',
  OPTIONAL_CONTEXT: 'Context photo',
};

/** Human label for a photo slot; an unmapped kind degrades to a calm generic (never the raw token). */
export function photoKindLabel(kind: string): string {
  return PHOTO_KIND_LABEL[kind] ?? 'Photo';
}
