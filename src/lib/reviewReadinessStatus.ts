// Pure status / next-input formatting for the source-backed readiness / REVIEW-candidate spine. No deps, no
// runtime imports (unit-checkable under plain Node). This module maps the backend's readiness vocabulary to
// plain-English product copy + a display tone; the UI component maps the tone to styling.
//
// The classifier emits 9 statuses and the bridge adds 2 (NO_SPINE_INPUT / SOURCE_UNRESOLVED), for 11 total.
// Every one is covered here, plus a safe fallback, so the panel never breaks on an unmapped status.

export type ReviewReadinessTone = 'ready' | 'blocked' | 'progress' | 'control' | 'neutral';

export interface ReadinessStatusPresentation {
  readonly label: string;
  readonly tone: ReviewReadinessTone;
  readonly plainEnglish: string;
}

const STATUS_PRESENTATION: Record<string, ReadinessStatusPresentation> = {
  READY_FOR_REVIEW_REDLINE: {
    label: 'Ready for a REVIEW candidate',
    tone: 'ready',
    plainEnglish:
      'A source-confirmed span was found, both endpoints anchored, and the route between them verified — ' +
      'the package is complete enough to generate a REVIEW candidate.',
  },
  SPAN_SOURCE_FOUND: {
    label: 'Span found — verifying',
    tone: 'progress',
    plainEnglish:
      'A source-confirmed span was found; endpoint anchoring and/or route verification are not yet fully ' +
      'evaluated.',
  },
  NO_SOURCE_CONFIRMED_SPAN: {
    label: 'No confirmed span',
    tone: 'blocked',
    plainEnglish:
      'A span source was inspected, but no span could be source-confirmed — no two stations are tied together ' +
      'as one bore with a start and an end.',
  },
  MISSING_BORE_SPAN_SOURCE: {
    label: 'Missing bore-span source',
    tone: 'blocked',
    plainEnglish:
      'No bore-span source file (bore log / bore schedule) is present, and the plan alone confirms no span — ' +
      'plan-only is not enough.',
  },
  ANCHOR_BLOCKED: {
    label: 'Endpoints not anchored',
    tone: 'blocked',
    plainEnglish:
      'A source-confirmed span was found, but a start / end station does not bind to a unique drawn anchor on ' +
      'the plan.',
  },
  ROUTE_BLOCKED: {
    label: 'Route not verifiable',
    tone: 'blocked',
    plainEnglish:
      'The span was found and both endpoints anchored, but the route between them is not verifiable.',
  },
  PACKAGE_RECOGNIZED_CONTROL: {
    label: 'Recognized control package',
    tone: 'control',
    plainEnglish:
      'This package is handled by the deterministic control lane (a named dialect or the recognized-corpus ' +
      'registry), not the source-backed REVIEW pipeline. This is a control result, not a failure.',
  },
  PACKAGE_UNUSABLE_OCR_REQUIRED: {
    label: 'OCR required',
    tone: 'blocked',
    plainEnglish:
      'The plan has no extractable text layer — OCR / raster ingestion is required before source-span ' +
      'extraction can run.',
  },
  KEEP_BLOCKED: {
    label: 'Kept blocked (owner decision)',
    tone: 'blocked',
    plainEnglish:
      'This package was reclassified as blocked by an owner / adversarial decision — it is not solvable from ' +
      'its current source.',
  },
  NO_SPINE_INPUT: {
    label: 'Nothing to evaluate yet',
    tone: 'neutral',
    plainEnglish:
      'No plan / bore-log / route upload with a stored payload is present to evaluate. Add the required files ' +
      'and run the check again.',
  },
  SOURCE_UNRESOLVED: {
    label: 'Package unresolved',
    tone: 'blocked',
    plainEnglish:
      'The uploaded package could not be resolved for readiness — verify the uploaded plan / bore log are ' +
      'readable.',
  },
};

const FALLBACK_PRESENTATION: ReadinessStatusPresentation = {
  label: 'Unrecognized status',
  tone: 'neutral',
  plainEnglish: 'The readiness check returned a status this app does not recognize.',
};

/** Present a readiness status as product copy + a tone. Any unmapped status returns the safe fallback (the raw
 *  code stays available to the caller for diagnostics). */
export function presentReadinessStatus(status: string): ReadinessStatusPresentation {
  return STATUS_PRESENTATION[status] ?? FALLBACK_PRESENTATION;
}

/** The set of statuses this app explicitly recognizes (for tests / diagnostics). */
export const KNOWN_READINESS_STATUSES: readonly string[] = Object.keys(STATUS_PRESENTATION);

// --- the actionable next step (the classifier's recommended_next_input code) in plain English -------- //

const NEXT_INPUT_COPY: Record<string, string> = {
  BORE_LOG_OR_BORE_SCHEDULE_NAMING_ONE_SPAN:
    'Add a bore log or bore schedule that names one span — a sheet, a start station, and an end station.',
  OCR_OR_RASTER_INGESTION:
    'Provide an OCR / raster-ingested plan with an extractable text layer.',
  OFF_ROUTE_LABEL_BINDER_OR_ROUTE_ATTACHED_ANCHORS:
    'Provide route-attached anchors, or an off-route label binder, so the endpoints bind to the drawn route.',
  ROUTE_CONTINUITY_GATE:
    'Resolve route continuity between the two anchored endpoints.',
  RUN_ANCHOR_AND_ROUTE_GATES:
    'Run the endpoint-anchor and route-verification gates.',
  NEW_PACKAGE_OR_OWNER_GATE_APPROVAL:
    'Provide a new package, or obtain owner gate approval.',
};

/** Present the recommended next-input code as a plain-English step. Null passes through as null; an unmapped
 *  code is humanized (never dropped). */
export function presentNextInput(code: string | null): string | null {
  if (!code) return null;
  return NEXT_INPUT_COPY[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

/** The fixed, non-negotiable label for a REVIEW candidate overlay. It is NEVER AUTO or final placement. */
export const REVIEW_CANDIDATE_LABEL = 'REVIEW candidate — not AUTO, not final placement';

// --- source-backed candidate PRIMACY (presentation-only; no lane coupling) --------------------------- //
// The strict /workflow/redline engine lane and the readiness lane read the bore log with DIFFERENT
// parsers, so they can honestly disagree: the readiness spine can hold a source-backed REVIEW candidate
// while full engine placement abstains. When that happens the candidate is the step's primary review
// surface and the strict abstain DEFERS to it — the abstain itself stays honest and fully visible.

/** True exactly when the readiness spine reports READY with a candidate + served artifacts — the
 *  source-backed REVIEW candidate is then the primary review surface. Pure; presentation only. */
export function hasSourceBackedReviewCandidate(result: {
  readonly readinessStatus: string;
  readonly candidate: unknown;
  readonly artifacts: readonly unknown[];
}): boolean {
  return (
    result.readinessStatus === 'READY_FOR_REVIEW_REDLINE' &&
    result.candidate !== null &&
    result.candidate !== undefined &&
    result.artifacts.length > 0
  );
}

/** Panel heading when the candidate is the primary review surface. */
export const SOURCE_BACKED_CANDIDATE_HEADING = 'Review source-backed candidate';

/** Review-only framing for the primary candidate — never acceptance, closeout, or anything final. */
export const SOURCE_BACKED_CANDIDATE_SUPPORT_LINE =
  'This candidate is supported by the uploaded source span. It is for office review only — not AUTO and ' +
  'not final placement.';

/** Pre-click hint in the strict-engine section while a source-backed candidate already exists below. */
export const SOURCE_BACKED_CANDIDATE_HINT =
  'A source-backed review candidate is already available below.';

/** Strict-engine ABSTAIN verdict, reframed ONLY when a source-backed candidate exists below. */
export const ABSTAIN_DEFER_TITLE = 'Full engine placement isn’t available for this package';
export const ABSTAIN_DEFER_BLURB =
  'Full engine placement needs a complete, engine-readable bore log — it doesn’t guess. A source-backed ' +
  'review candidate is available below; review it there.';
export const ABSTAIN_DEFER_CTA = 'Review source-backed candidate ↓';
