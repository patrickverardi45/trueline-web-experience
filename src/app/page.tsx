import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardCheck,
  ImageIcon,
  Map as MapIcon,
  Ruler,
} from 'lucide-react';

import { api } from '@/lib/api';
import { dateTime, ft, pct, pctLabel } from '@/lib/format';
import { EVIDENCE_KIND, PROJECT_STATUS } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { KpiStat } from '@/components/ui/KpiStat';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressMeter } from '@/components/ui/ProgressMeter';
import { ReadinessRing } from '@/components/ui/ReadinessRing';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusPill } from '@/components/ui/StatusPill';

export default async function DashboardPage() {
  const [projects, crews] = await Promise.all([api.projects.list(), api.crews.list()]);
  const perProject = await Promise.all(
    projects.map(async (project) => ({
      project,
      runs: await api.runs.byProject(project.id),
      evidence: await api.evidence.byProject(project.id),
      issues: await api.issues.byProject(project.id),
    })),
  );

  const placedFt = projects.reduce((sum, p) => sum + p.footagePlacedFt, 0);
  const plannedFt = projects.reduce((sum, p) => sum + p.footagePlannedFt, 0);
  const allRuns = perProject.flatMap((p) => p.runs);
  const allEvidence = perProject.flatMap((p) => p.evidence);
  const openIssues = perProject
    .flatMap((p) => p.issues)
    .filter((i) => i.status !== 'resolved');
  const readyRuns = allRuns.filter((r) => r.status === 'complete').length;
  const photoCount = allEvidence.reduce((sum, e) => sum + e.photoIds.length, 0);

  const recentEvidence = [...allEvidence]
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    .slice(0, 6);
  const crewName = (id: string) => crews.find((c) => c.id === id)?.name ?? id;
  const runName = (id: string) => allRuns.find((r) => r.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader
        title="Portfolio"
        sub={`${projects.length} projects · ${projects.filter((p) => p.status === 'active').length} active · mock data`}
        actions={
          <Link
            href="/map"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
            <MapIcon className="size-4" /> Open Hero Map
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiStat
          label="Footage placed"
          value={ft(placedFt)}
          sub={`of ${ft(plannedFt)} planned · ${pctLabel(placedFt, plannedFt)}`}
          icon={Ruler}
          tone="accent"
        />
        <KpiStat
          label="Evidence captured"
          value={`${allEvidence.length} items`}
          sub={`${photoCount} field photos`}
          icon={ImageIcon}
        />
        <KpiStat
          label="Runs complete"
          value={`${readyRuns} of ${allRuns.length}`}
          sub="across all projects"
          icon={ClipboardCheck}
        />
        <KpiStat
          label="Open issues"
          value={String(openIssues.length)}
          sub={`${openIssues.filter((i) => i.blocking).length} blocking`}
          icon={AlertTriangle}
          tone={openIssues.some((i) => i.blocking) ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-8">
        <SectionHeader title="Projects" sub="Click a project for runs, evidence, and closeout" />
        <div className="grid gap-4 lg:grid-cols-3">
          {perProject.map(({ project, runs, issues }) => {
            const status = PROJECT_STATUS[project.status];
            const open = issues.filter((i) => i.status !== 'resolved').length;
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-ink group-hover:text-accent-strong">
                        {project.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-ink-3">
                        {project.client} · {project.location}
                      </p>
                    </div>
                    <ReadinessRing score={project.readinessScore} size={48} />
                  </div>
                  <div className="mt-4">
                    <ProgressMeter value={pct(project.footagePlacedFt, project.footagePlannedFt)} />
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className="text-ink-2">
                        {ft(project.footagePlacedFt)} of {ft(project.footagePlannedFt)}
                      </span>
                      <span className="font-semibold text-ink">
                        {pctLabel(project.footagePlacedFt, project.footagePlannedFt)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <StatusPill meta={status} size="sm" />
                    <span className="text-xs text-ink-3">
                      {runs.length} runs
                      {open > 0 ? (
                        <span className="ml-2 font-semibold text-red-600">{open} issues</span>
                      ) : null}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionHeader title="Recent field activity" actionLabel="Open field feed" actionHref="/feed" />
          <Card flush>
            <ul className="divide-y divide-line">
              {recentEvidence.map((item) => {
                const kind = EVIDENCE_KIND[item.kind];
                return (
                  <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${kind.chip}`}>
                      {kind.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{item.label}</div>
                      <div className="truncate text-xs text-ink-3">
                        {runName(item.runId)} · {crewName(item.crewId)}
                        {item.photoIds.length > 0
                          ? ` · ${item.photoIds.length} photo${item.photoIds.length === 1 ? '' : 's'}`
                          : ''}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-ink-3">{dateTime(item.capturedAt)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
        <div>
          <SectionHeader title="Open issues" actionLabel="View closeout" actionHref="/closeout" />
          <Card flush>
            <ul className="divide-y divide-line">
              {openIssues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-3 px-5 py-3">
                  <AlertTriangle
                    className={`mt-0.5 size-4 shrink-0 ${issue.blocking ? 'text-red-500' : 'text-amber-500'}`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug text-ink">{issue.title}</div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {runName(issue.runId ?? '')} ·{' '}
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
          </Card>
        </div>
      </div>
    </div>
  );
}
