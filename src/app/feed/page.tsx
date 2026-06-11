import type { Metadata } from 'next';

import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { FeedView } from './FeedView';
import type { FeedItem } from './types';

export const metadata: Metadata = { title: 'Field Evidence Feed' };

export default async function FeedPage() {
  const [projects, crews] = await Promise.all([api.projects.list(), api.crews.list()]);
  const crewName = (id: string) => crews.find((c) => c.id === id)?.name ?? id;

  const perProject = await Promise.all(
    projects.map(async (project) => {
      const [runs, evidence, logs] = await Promise.all([
        api.runs.byProject(project.id),
        api.evidence.byProject(project.id),
        api.dailyLogs.byProject(project.id),
      ]);
      const runName = (id: string) => runs.find((r) => r.id === id)?.name ?? id;

      const evidenceItems: FeedItem[] = await Promise.all(
        evidence.map(async (item) => {
          const photos = await api.photos.byEvidence(item.id);
          return {
            id: item.id,
            kind: item.kind,
            at: item.capturedAt,
            dayKey: item.capturedAt.slice(0, 10),
            title: item.label,
            projectId: project.id,
            projectName: project.name,
            runName: runName(item.runId),
            crewName: crewName(item.crewId),
            stationCode: item.stationCode,
            gps: item.gps,
            photos: photos.map((p) => ({
              id: p.id,
              caption: p.caption,
              stationCode: p.stationCode,
            })),
            sources: item.sources.map((s) => ({ refId: s.refId, label: s.label })),
            note: item.note,
          };
        }),
      );

      const logItems: FeedItem[] = logs.map((log) => ({
        id: log.id,
        kind: 'log' as const,
        // Logs close out the day — anchor them at 17:00 field time for ordering.
        at: `${log.date}T17:00:00-05:00`,
        dayKey: log.date,
        title: `Daily log — ${crewName(log.crewId)}`,
        projectId: project.id,
        projectName: project.name,
        crewName: crewName(log.crewId),
        photos: [],
        sources: [],
        weather: log.weather,
        summary: log.summary,
        quantities: log.quantities,
      }));

      return [...evidenceItems, ...logItems];
    }),
  );

  const items = perProject.flat().sort((a, b) => b.at.localeCompare(a.at));
  const evidenceCount = items.filter((i) => i.kind !== 'log').length;
  const logCount = items.length - evidenceCount;
  const photoCount = items.reduce((sum, i) => sum + i.photos.length, 0);

  return (
    <div>
      <PageHeader
        title="Field Evidence Feed"
        sub={`${evidenceCount} evidence items · ${logCount} daily logs · ${photoCount} photos · mock data`}
      />
      <FeedView items={items} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
