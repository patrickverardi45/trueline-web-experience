import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { CloseoutReadiness, Issue, Run } from '@/contracts';
import { dateTime, ft } from '@/lib/format';
import { RUN_STATUS } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

interface Props {
  readiness: CloseoutReadiness;
  runs: Run[];
  issues: Issue[];
}

export function EvidencePanels({ readiness, runs, issues }: Props) {
  const runName = (runId: string) => runs.find((r) => r.id === runId)?.name ?? runId;

  // Group missing items by run, preserving fixture order.
  const missingByRun: Array<{ runId: string; descriptions: string[] }> = [];
  for (const item of readiness.missing) {
    const group = missingByRun.find((g) => g.runId === item.runId);
    if (group) group.descriptions.push(item.description);
    else missingByRun.push({ runId: item.runId, descriptions: [item.description] });
  }

  const blockedRuns = readiness.runsBlocked
    .map((runId) => {
      const rr = readiness.runs.find((r) => r.runId === runId);
      const blockingIssues = (rr?.blockedBy ?? [])
        .map((issueId) => issues.find((i) => i.id === issueId))
        .filter((i): i is Issue => i !== undefined);
      return { runId, blockingIssues };
    })
    .filter((b) => b.blockingIssues.length > 0);

  const readyRuns = readiness.runsReady
    .map((runId) => runs.find((r) => r.id === runId))
    .filter((r): r is Run => r !== undefined);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div>
        <SectionHeader title="Missing evidence" sub="What the field still owes" />
        <Card flush>
          {missingByRun.length === 0 ? (
            <div className="px-5 py-6 text-sm text-ink-3">All required evidence is in.</div>
          ) : (
            <ul className="divide-y divide-line">
              {missingByRun.map((group) => (
                <li key={group.runId} className="px-5 py-3">
                  <div className="text-sm font-semibold text-ink">{runName(group.runId)}</div>
                  <ul className="mt-1.5 space-y-1.5">
                    {group.descriptions.map((description) => (
                      <li key={description} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span className="text-xs leading-snug text-ink-2">{description}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <SectionHeader title="Blocked runs" sub="Issues holding closeout" />
        <Card flush>
          {blockedRuns.length === 0 ? (
            <div className="px-5 py-6 text-sm text-ink-3">No runs are blocked.</div>
          ) : (
            <ul className="divide-y divide-line">
              {blockedRuns.map((blocked) => (
                <li key={blocked.runId} className="px-5 py-3">
                  <div className="text-sm font-semibold text-ink">{runName(blocked.runId)}</div>
                  <ul className="mt-1.5 space-y-2">
                    {blocked.blockingIssues.map((issue) => (
                      <li key={issue.id} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium leading-snug text-ink">
                            {issue.title}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-3">
                            Opened {dateTime(issue.openedAt)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <SectionHeader title="Ready for closeout" sub="Evidence complete, nothing owed" />
        <Card flush>
          {readyRuns.length === 0 ? (
            <div className="px-5 py-6 text-sm text-ink-3">No runs ready yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {readyRuns.map((run) => (
                <li key={run.id} className="flex items-center gap-3 px-5 py-3">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" strokeWidth={1.75} />
                  <div className="min-w-0 text-sm text-ink">
                    <span className="font-semibold">{run.name}</span>
                    <span className="text-ink-2">
                      {' '}· {RUN_STATUS[run.status].label} · {ft(run.lengthFt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
