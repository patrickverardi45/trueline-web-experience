// Phase 11 — the internal workspace's section workflow, shared by the main Sidebar nav and the workspace
// body so the keys / labels / order never drift. Typed-only (/intake?workspace=1); NOT a public route and
// shown in the sidebar only inside the projects workspace. State lives in the URL (?workspace=1&job=<id>&section=<key>) so
// the sidebar (in the layout) and the body (in the page) stay in sync without shared React state.

// The single job page renders ALL these sections in order (each as <section id="sec-<key>">); the sidebar
// links are same-page anchors (#sec-<key>) with scroll-spy, NOT separate routes. 'summary' anchors the job
// header at the top. Customer-readable labels (no dev framing).
export type WorkspaceSectionKey =
  | 'summary' | 'uploads' | 'map' | 'borelogs' | 'redlines' | 'review' | 'closeout' | 'exports';

export const WORKSPACE_SECTIONS: readonly { key: WorkspaceSectionKey; label: string }[] = [
  { key: 'summary', label: 'Overview' },
  { key: 'uploads', label: 'Project files' },
  { key: 'map', label: 'Map / route' },
  { key: 'borelogs', label: 'Bore logs' },
  { key: 'redlines', label: 'Redline' },
  { key: 'review', label: 'Review & correct' },
  { key: 'closeout', label: 'Closeout review' },
  { key: 'exports', label: 'Export & print' },
] as const;

/** Same-page anchor id for a section (the page renders <section id="ws-<key>">). */
export function sectionAnchorId(key: WorkspaceSectionKey): string {
  return `ws-${key}`;
}

const KEYS = new Set<string>(WORKSPACE_SECTIONS.map((s) => s.key));

/** Coerce a raw ?section= value to a valid section key (defaults to 'summary'). */
export function coerceSection(v: string | null): WorkspaceSectionKey {
  return v !== null && KEYS.has(v) ? (v as WorkspaceSectionKey) : 'summary';
}

/** Canonical workspace URL for a given job + section (job omitted until one is selected). */
export function workspaceHref(jobId: string | null, section: WorkspaceSectionKey): string {
  const params = new URLSearchParams({ workspace: '1' });
  if (jobId) params.set('job', jobId);
  params.set('section', section);
  return `/intake?${params.toString()}`;
}
