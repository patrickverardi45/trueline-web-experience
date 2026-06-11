import Link from 'next/link';

import type { CloseoutReadiness, Crew, Issue, Run } from '@/contracts';
import { ft } from '@/lib/format';
import { RUN_STATUS } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { ProgressMeter } from '@/components/ui/ProgressMeter';
import { StatusPill } from '@/components/ui/StatusPill';

interface Props {
  readiness: CloseoutReadiness;
  runs: Run[];
  issues: Issue[];
  crews: Crew[];
}

/** Readiness meter color: green >= 90, amber >= 60, red below. */
function scoreColor(score: number): string {
  if (score >= 90) return '#1FA563';
  if (score >= 60) return '#E9A23B';
  return '#DE4339';
}

export function ReadinessTable({ readiness, runs, issues, crews }: Props) {
  const crewName = (crewId?: string) => crews.find((c) => c.id === crewId)?.name ?? '—';

  return (
    <Card flush>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="px-5 py-3 font-medium">Run</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Readiness</th>
            <th className="px-3 py-3 font-medium">Missing</th>
            <th className="px-3 py-3 font-medium">Blocked by</th>
            <th className="px-5 py-3 font-medium">Crew</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {readiness.runs.map((rr) => {
            const run = runs.find((r) => r.id === rr.runId);
            if (!run) return null;
            const meta = RUN_STATUS[run.status];
            return (
              <tr key={rr.runId} className="group relative hover:bg-canvas/60">
                <td className="px-5 py-3">
                  <Link href={`/map?run=${run.id}`} className="after:absolute after:inset-0">
                    <span className="font-semibold text-ink">{run.name}</span>
                  </Link>
                  <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                    {run.fromStationCode} → {run.toStationCode} · {ft(run.lengthFt)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusPill meta={meta} size="sm" />
                </td>
                <td className="px-3 py-3">
                  <div className="w-28">
                    <ProgressMeter value={rr.score / 100} color={scoreColor(rr.score)} />
                    <div className="mt-1 text-xs font-semibold text-ink-2">{rr.score}%</div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {rr.missing.length > 0 ? (
                    <span className="text-xs font-semibold text-amber-600">
                      {rr.missing.length} item{rr.missing.length === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">—</span>
                  )}
                </td>
                <td className="max-w-56 px-3 py-3">
                  {rr.blockedBy.length > 0 ? (
                    <div className="space-y-1">
                      {rr.blockedBy.map((issueId) => (
                        <div
                          key={issueId}
                          className="text-xs font-medium leading-snug text-red-600">
                          {issues.find((i) => i.id === issueId)?.title ?? issueId}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-ink-3">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-ink-2">{crewName(run.crewId)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
