// Status display vocabulary — one place maps contract statuses to labels,
// Tailwind chip classes, and raw hex (for SVG strokes on the map).

import type { EvidenceKind, ProjectStatus, ReviewStatus, RunStatus } from '@/contracts';

export interface StatusMeta {
  label: string;
  hex: string;
  chip: string;
  dot: string;
}

export const RUN_STATUS: Record<RunStatus, StatusMeta> = {
  complete: {
    label: 'Complete',
    hex: '#1FA563',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  'in-progress': {
    label: 'In progress',
    hex: '#F4640E',
    chip: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    dot: 'bg-orange-500',
  },
  blocked: {
    label: 'Blocked',
    hex: '#DE4339',
    chip: 'bg-red-50 text-red-700 ring-red-600/20',
    dot: 'bg-red-500',
  },
  'needs-review': {
    label: 'Needs review',
    hex: '#E9A23B',
    chip: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  'missing-evidence': {
    label: 'Missing evidence',
    hex: '#8B74D8',
    chip: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    dot: 'bg-violet-500',
  },
};

export const REVIEW_STATUS: Record<ReviewStatus, StatusMeta> = {
  draft: {
    label: 'Draft',
    hex: '#6E7B89',
    chip: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
  },
  submitted: {
    label: 'Submitted',
    hex: '#2563C4',
    chip: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    dot: 'bg-blue-500',
  },
  'in-review': {
    label: 'In review',
    hex: '#E9A23B',
    chip: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  'changes-requested': {
    label: 'Changes requested',
    hex: '#DE4339',
    chip: 'bg-red-50 text-red-700 ring-red-600/20',
    dot: 'bg-red-500',
  },
  approved: {
    label: 'Approved',
    hex: '#1FA563',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
};

export const PROJECT_STATUS: Record<ProjectStatus, StatusMeta> = {
  active: {
    label: 'Active',
    hex: '#1FA563',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  'on-hold': {
    label: 'On hold',
    hex: '#E9A23B',
    chip: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  closeout: {
    label: 'Closeout',
    hex: '#2563C4',
    chip: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    dot: 'bg-blue-500',
  },
};

export const EVIDENCE_KIND: Record<EvidenceKind, { label: string; hex: string; chip: string }> = {
  start: {
    label: 'Start evidence',
    hex: '#1FA563',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  end: {
    label: 'End evidence',
    hex: '#2563C4',
    chip: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  },
  problem: {
    label: 'Problem area',
    hex: '#DE4339',
    chip: 'bg-red-50 text-red-700 ring-red-600/20',
  },
  'station-drop': {
    label: 'Station drop',
    hex: '#F4640E',
    chip: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  },
};

export const METHOD_LABEL: Record<string, string> = {
  bore: 'Bore',
  trench: 'Trench',
  aerial: 'Aerial',
  pull: 'Cable pull',
};
