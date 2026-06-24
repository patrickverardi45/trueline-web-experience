// Phase 11 — the internal workspace's section workflow, shared by the main Sidebar nav and the workspace
// body so the keys / labels / order never drift. Typed-only (/intake?workspace=1); NOT a public route and
// NOT shown in the public/guided demo nav. State lives in the URL (?workspace=1&job=<id>&section=<key>) so
// the sidebar (in the layout) and the body (in the page) stay in sync without shared React state.

export type WorkspaceSectionKey =
  | 'summary' | 'uploads' | 'map' | 'borelogs' | 'redlines' | 'review' | 'closeout' | 'exports' | 'billing';

export const WORKSPACE_SECTIONS: readonly { key: WorkspaceSectionKey; label: string }[] = [
  { key: 'summary', label: 'Job Summary' },
  { key: 'uploads', label: 'Uploads' },
  { key: 'map', label: 'Map / Route' },
  { key: 'borelogs', label: 'Bore Logs' },
  { key: 'redlines', label: 'Redlines' },
  { key: 'review', label: 'Review' },
  { key: 'closeout', label: 'Closeout' },
  { key: 'exports', label: 'Exports' },
  { key: 'billing', label: 'Billing' },
] as const;

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
