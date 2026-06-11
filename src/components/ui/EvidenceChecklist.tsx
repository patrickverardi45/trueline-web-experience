import { AlertTriangle, Check, MapPin, Minus } from 'lucide-react';

import type { EvidenceSummary } from '@/contracts';

function Row({
  label,
  state,
  detail,
}: {
  label: string;
  state: 'done' | 'missing' | 'count';
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-ink-2">{label}</span>
      {state === 'done' ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <Check className="size-3.5" /> Captured
        </span>
      ) : state === 'missing' ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
          <Minus className="size-3.5" /> Pending
        </span>
      ) : (
        <span className="text-xs font-semibold text-ink-2">{detail}</span>
      )}
    </div>
  );
}

export function EvidenceChecklist({ summary }: { summary: EvidenceSummary }) {
  return (
    <div className="divide-y divide-line">
      <Row label="Start evidence" state={summary.hasStart ? 'done' : 'missing'} />
      <Row label="End evidence" state={summary.hasEnd ? 'done' : 'missing'} />
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
          <AlertTriangle className="size-3.5 text-red-500" /> Problem areas
        </span>
        <span className="text-xs font-semibold text-ink-2">{summary.problemCount}</span>
      </div>
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
          <MapPin className="size-3.5 text-accent" /> Station drops
        </span>
        <span className="text-xs font-semibold text-ink-2">{summary.stationDropCount}</span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="text-sm font-medium text-ink">Evidence completeness</span>
        <span className="text-xs font-semibold text-ink">
          {summary.capturedCount}/{summary.requiredCount}
        </span>
      </div>
    </div>
  );
}
