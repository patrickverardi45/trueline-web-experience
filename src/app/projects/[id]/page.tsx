import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  Map as MapIcon,
  Ruler,
  Users,
} from 'lucide-react';

import { api, FLAGSHIP_PROJECT_ID } from '@/lib/api';
import { dateTime, ft, pct, pctLabel, shortDate } from '@/lib/format';
import { METHOD_LABEL, PROJECT_STATUS, RUN_STATUS } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { KpiStat } from '@/components/ui/KpiStat';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressMeter } from '@/components/ui/ProgressMeter';
import { ReadinessRing } from '@/components/ui/ReadinessRing';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusPill } from '@/components/ui/StatusPill';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await api.projects.get(id);
  if (!project) notFound();

  const [runs, issues, logs, crews] = await Promise.all([
    api.runs.byProject(project.id),
    api.issues.byProject(project.id),
    api.dailyLogs.byProject(project.id),
    api.crews.list(),
  ]);
  const projectCrews = crews.filter((c) => project.crewIds.includes(c.id));
  const crewName = (crewId?: string) => crews.find((c) => c.id === crewId)?.name ?? '—';
  const openIssues = issues.filter((i) => i.status !== 'resolved');
  const completeRuns = runs.filter((r) => r.status === 'complete').length;
  const captured = runs.reduce((sum, r) => sum + r.evidence.capturedCount, 0);
  const required = runs.reduce((sum, r) => sum + r.evidence.requiredCount, 0);
  const status = PROJECT_STATUS[project.status];

  return (
    <div>
      <PageHeader
        title={project.name}
        sub={`${project.client} · ${project.location} · ${shortDate(project.startDate)} → ${shortDate(project.targetDate)}`}
        actions={
          <>
            <StatusPill meta={status} />
            <Link
              href="/map"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-canvas">
              <MapIcon className="size-4" /> Hero Map
            </Link>
            <Link
              href="/closeout"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
              <ClipboardCheck className="size-4" /> Closeout
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiStat
          label="Footage placed"
          value={ft(project.footagePlacedFt)}
          sub={`of ${ft(project.footagePlannedFt)} · ${pctLabel(project.footagePlacedFt, project.footagePlannedFt)}`}
          icon={Ruler}
          tone="accent"
        />
        <KpiStat
          label="Runs complete"
          value={`${completeRuns} of ${runs.length}`}
          icon={ClipboardCheck}
        />
        <KpiStat
          label="Evidence completeness"
          value={`${captured}/${required}`}
          sub="required captures"
          icon={FileText}
        />
        <Card className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">
              Closeout readiness
            </div>
            <Link
              href="/closeout"
              className="mt-1 inline-block text-xs font-semibold text-accent-strong hover:text-accent">
              View breakdown
            </Link>
          </div>
          <ReadinessRing score={project.readinessScore} />
        </Card>
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Runs & segments"
          sub="Click a run to inspect it on the Hero Map"
        />
        <Card flush>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
                <th className="px-5 py-3 font-medium">Run</th>
                <th className="px-3 py-3 font-medium">Stations</th>
                <th className="px-3 py-3 font-medium">Method</th>
                <th className="px-3 py-3 font-medium">Footage</th>
                <th className="px-3 py-3 font-medium">Evidence</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Crew</th>
                <th className="px-5 py-3 text-right font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((run) => {
                const meta = RUN_STATUS[run.status];
                return (
                  <tr key={run.id} className="group relative hover:bg-canvas/60">
                    <td className="px-5 py-3 font-semibold text-ink">
                      {project.id === FLAGSHIP_PROJECT_ID ? (
                        // The Hero Map preview is scoped to the flagship
                        // project, so only its runs deep-link there.
                        <Link href={`/map?run=${run.id}`} className="after:absolute after:inset-0">
                          {run.name}
                        </Link>
                      ) : (
                        run.name
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-ink-2">
                      {run.fromStationCode} → {run.toStationCode}
                    </td>
                    <td className="px-3 py-3 text-ink-2">{METHOD_LABEL[run.method]}</td>
                    <td className="px-3 py-3">
                      <div className="w-28">
                        <ProgressMeter value={pct(run.placedFt, run.lengthFt)} color={meta.hex} />
                        <div className="mt-1 text-xs text-ink-3">
                          {ft(run.placedFt)} / {ft(run.lengthFt)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-semibold text-ink-2">
                        {run.evidence.capturedCount}/{run.evidence.requiredCount}
                      </span>
                      {run.evidence.problemCount > 0 ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertTriangle className="size-3" /> {run.evidence.problemCount}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill meta={meta} size="sm" />
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-2">{crewName(run.crewId)}</td>
                    <td className="px-5 py-3 text-right text-xs text-ink-3">
                      {dateTime(run.lastActivityAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <div>
          <SectionHeader title="Open issues" />
          <Card flush>
            {openIssues.length === 0 ? (
              <div className="px-5 py-6 text-sm text-ink-3">No open issues.</div>
            ) : (
              <ul className="divide-y divide-line">
                {openIssues.map((issue) => (
                  <li key={issue.id} className="flex items-start gap-3 px-5 py-3">
                    <AlertTriangle
                      className={`mt-0.5 size-4 shrink-0 ${issue.blocking ? 'text-red-500' : 'text-amber-500'}`}
                    />
                    <div>
                      <div className="text-sm font-medium leading-snug text-ink">{issue.title}</div>
                      <div className="mt-0.5 text-xs text-ink-3">
                        {runs.find((r) => r.id === issue.runId)?.name ?? 'Project'} ·{' '}
                        {issue.blocking ? (
                          <span className="font-semibold text-red-600">Blocking</span>
                        ) : (
                          'Monitoring'
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div>
          <SectionHeader title="Daily logs" actionLabel="Field feed" actionHref="/feed" />
          <Card flush>
            <ul className="divide-y divide-line">
              {logs.map((log) => (
                <li key={log.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{shortDate(log.date)}</span>
                    <span className="text-xs text-ink-3">
                      {crewName(log.crewId)} · {log.weather}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">
                    {log.summary}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div>
          <SectionHeader title="Crews" />
          <Card flush>
            <ul className="divide-y divide-line">
              {projectCrews.map((crew) => (
                <li key={crew.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-navy-900/5 text-navy-700">
                    <Users className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{crew.name}</div>
                    <div className="text-xs text-ink-3">
                      {crew.lead} · {crew.size} crew{crew.phone ? ` · ${crew.phone}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
