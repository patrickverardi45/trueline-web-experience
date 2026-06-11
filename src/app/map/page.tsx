import type { Metadata } from 'next';

import { api, FLAGSHIP_PROJECT_ID } from '@/lib/api';
import { HeroMapView } from '@/components/map/HeroMapView';
import type { MapRunBundle } from '@/components/map/types';

export const metadata: Metadata = { title: 'Hero Map' };

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run: runParam } = await searchParams;

  const [project, runs, paths, crews, readiness] = await Promise.all([
    api.projects.get(FLAGSHIP_PROJECT_ID),
    api.runs.byProject(FLAGSHIP_PROJECT_ID),
    api.redlines.mapPaths(FLAGSHIP_PROJECT_ID),
    api.crews.list(),
    api.closeout.readiness(FLAGSHIP_PROJECT_ID),
  ]);
  if (!project) throw new Error('Flagship project missing from mock fixtures');

  const loaded = await Promise.all(
    runs.map(async (run): Promise<MapRunBundle | null> => {
      const path = paths.find((p) => p.runId === run.id);
      if (!path) return null;
      const evidence = await api.evidence.byRun(run.id);
      const photos = (
        await Promise.all(evidence.map((e) => api.photos.byEvidence(e.id)))
      ).flat();
      const steps = await api.playback.byRun(run.id);
      return {
        run,
        path,
        evidence,
        photos,
        steps,
        readiness: readiness?.runs.find((r) => r.runId === run.id),
        crew: crews.find((c) => c.id === run.crewId),
      };
    }),
  );
  const bundles = loaded.filter((b): b is MapRunBundle => b !== null);

  const initialRunId = bundles.some((b) => b.run.id === runParam) ? runParam! : null;

  return <HeroMapView project={project} bundles={bundles} initialRunId={initialRunId} />;
}
