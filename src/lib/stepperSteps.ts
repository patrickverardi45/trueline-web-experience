// The guided 6-step new-customer workflow. ONE source of truth for the step keys / labels / order, shared by
// the workspace body (which renders only the ACTIVE step) and any step rail. State lives in the URL
// (/intake?workspace=1&job=<alias>&step=<key>) so a deep link / reload lands on the same step.
//
// The body shows only the current step (never one giant scrolling page). Each step has a lock precondition;
// future steps are shown as locked until they are relevant (e.g. Export is locked until a redline is placed).

import { jobAlias } from '@/lib/jobLabels';

export type StepKey = 'project' | 'upload' | 'map' | 'borelogs' | 'redline' | 'export';

/** done = completed · current = active · upcoming = reachable but not yet done · locked = precondition unmet. */
export type StepStatus = 'done' | 'current' | 'upcoming' | 'locked';

export interface StepDef {
  readonly key: StepKey;
  readonly label: string;
  /** One short line shown under the step title — what this step is for, in plain language. */
  readonly short: string;
}

export const STEPPER_STEPS: readonly StepDef[] = [
  { key: 'project', label: 'Project', short: 'Name your project' },
  { key: 'upload', label: 'Upload package', short: 'Add your plan, route, bore log & photos' },
  { key: 'map', label: 'Route map', short: 'See the route from your KMZ/KML' },
  { key: 'borelogs', label: 'Bore logs', short: 'Review the extracted bore stations' },
  { key: 'redline', label: 'Redline proof', short: 'Place & check the redline on the plan' },
  { key: 'export', label: 'Export', short: 'Download the closeout package' },
] as const;

const KEYS = new Set<string>(STEPPER_STEPS.map((s) => s.key));

/** Coerce a raw ?step= value to a valid step key (defaults to the first step, 'project'). */
export function coerceStep(v: string | null): StepKey {
  return v !== null && KEYS.has(v) ? (v as StepKey) : 'project';
}

/** Position of a step in the linear flow (0-based). */
export function stepIndex(key: StepKey): number {
  return STEPPER_STEPS.findIndex((s) => s.key === key);
}

/** Canonical workspace URL for a job + step. The ?job= value is the NEUTRAL alias (never the raw store slug);
 *  ProductIntake resolves it back for API calls. job omitted until one is selected. */
export function stepHref(jobId: string | null, step: StepKey): string {
  const params = new URLSearchParams({ workspace: '1' });
  if (jobId) params.set('job', jobAlias(jobId));
  params.set('step', step);
  return `/intake?${params.toString()}`;
}
