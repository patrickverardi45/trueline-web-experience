'use client';

import Link from 'next/link';
import { AlertTriangle, FileText, Map as MapIcon } from 'lucide-react';

import { dateTime, ft, pct, pctLabel } from '@/lib/format';
import { METHOD_LABEL, RUN_STATUS } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { EvidenceChecklist } from '@/components/ui/EvidenceChecklist';
import { ProgressMeter } from '@/components/ui/ProgressMeter';
import { StatusPill } from '@/components/ui/StatusPill';
import type { EvidenceRunBundle } from './types';

function readinessColor(score: number): string {
  if (score >= 90) return 'var(--color-status-complete)';
  if (score >= 60) return 'var(--color-status-review)';
  return 'var(--color-status-blocked)';
}

export function RunRail({ bundle }: { bundle: EvidenceRunBundle }) {
  const { run, readiness, crew } = bundle;
  const meta = RUN_STATUS[run.status];

  return (
    <Card className="space-y-5 xl:sticky xl:top-6">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-ink">{run.name}</h3>
          <StatusPill meta={meta} size="sm" />
        </div>
        <p className="mt-1 text-xs text-ink-3">
          {METHOD_LABEL[run.method]} · {crew?.name ?? 'Unassigned'} · last activity{' '}
          {dateTime(run.lastActivityAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Start</div>
          <div className="font-mono text-xs font-semibold text-ink">{run.fromStationCode}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">End</div>
          <div className="font-mono text-xs font-semibold text-ink">{run.toStationCode}</div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wide text-ink-3">Footage</span>
          <span className="font-semibold text-ink">
            {ft(run.placedFt)} of {ft(run.lengthFt)} · {pctLabel(run.placedFt, run.lengthFt)}
          </span>
        </div>
        <ProgressMeter value={pct(run.placedFt, run.lengthFt)} color={meta.hex} />
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Evidence</div>
        <EvidenceChecklist summary={run.evidence} />
      </div>

      {readiness ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-ink-3">
              Closeout readiness
            </span>
            <span className="font-semibold" style={{ color: readinessColor(readiness.score) }}>
              {readiness.score}%
            </span>
          </div>
          <ProgressMeter value={readiness.score / 100} color={readinessColor(readiness.score)} />
          {readiness.missing.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {readiness.missing.map((m, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-ink-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
                  {m.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-medium text-emerald-600">
              All evidence in — ready for the packet.
            </p>
          )}
          {readiness.blockedBy.length > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <AlertTriangle className="size-3.5" /> Blocked by {readiness.blockedBy.length} open
              issue{readiness.blockedBy.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 border-t border-line pt-4">
        <Link
          href={`/map?run=${run.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-2 text-xs font-semibold text-ink hover:bg-canvas">
          <MapIcon className="size-3.5" /> Hero Map
        </Link>
        <Link
          href="/plans"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-2 text-xs font-semibold text-ink hover:bg-canvas">
          <FileText className="size-3.5" /> Plan sheets
        </Link>
      </div>
    </Card>
  );
}
