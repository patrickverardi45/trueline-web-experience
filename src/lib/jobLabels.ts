// Customer-facing labels + neutral technical aliases for the seeded internal project ids.
//
// The store/route ids (e.g. "demo-general-upload") stay AS-IS — renaming them is risky (store directories,
// the recognized-corpus registry, the seed scripts, the engine fingerprint mapping). Instead we MASK them at
// the UI layer so no raw "demo-*" slug is EVER displayed (titles, Diagnostics, Technical details) OR placed
// in a URL. User-created projects pass through unchanged (their id is the name the user typed).

const JOB_TITLE: Record<string, string> = {
  'demo-general-upload': 'Uploaded project — clean placement',
  'demo-general-upload-ambiguous': 'Uploaded project — ambiguous correction',
  'recognized-log9': 'Recognized project — automatic redline',
  'completed-redline-showcase': 'Finished redline showcase',
  'demo-review-acceptance': 'Uploaded project — REVIEW acceptance',
  'demo-cross-sheet-review': 'Uploaded project — cross-sheet REVIEW',
};

// Neutral technical reference shown wherever a slug would otherwise appear (Diagnostics, URLs). No "demo".
const JOB_ALIAS: Record<string, string> = {
  'demo-general-upload': 'project-clean-placement',
  'demo-general-upload-ambiguous': 'project-ambiguous-correction',
  'recognized-log9': 'project-recognized-automatic',
  'completed-redline-showcase': 'project-finished-redlines',
  'demo-review-acceptance': 'project-review-acceptance',
  'demo-cross-sheet-review': 'project-cross-sheet-review',
};

const ALIAS_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(JOB_ALIAS).map(([id, alias]) => [alias, id]),
);

/** Readable product title for a project (falls back to the id for user-created projects). */
export function jobTitle(jobId: string): string {
  return JOB_TITLE[jobId] ?? jobId;
}

/** Neutral technical reference shown in Diagnostics / Technical details / URLs — never a raw "demo-*" slug. */
export function jobAlias(jobId: string): string {
  return JOB_ALIAS[jobId] ?? jobId;
}

/** Resolve a URL ?job= value (which may be a neutral alias) back to the real store id for API calls. */
export function resolveJobId(jobParam: string): string {
  return ALIAS_TO_ID[jobParam] ?? jobParam;
}

/** If jobId is a known internal store slug that has a neutral alias, return the alias; else null. Used by
 *  middleware to redirect a raw-slug URL to its alias BEFORE the page renders, so even the server-rendered
 *  hydration payload never carries the raw "demo-*" slug. */
export function rawToAlias(jobId: string): string | null {
  return JOB_ALIAS[jobId] ?? null;
}
