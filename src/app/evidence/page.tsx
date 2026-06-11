import type { Metadata } from 'next';

import { api, FLAGSHIP_PROJECT_ID } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { ExplorerView } from './ExplorerView';
import type { EvidenceRunBundle } from './types';

export const metadata: Metadata = { title: 'Evidence Explorer' };

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run: runParam } = await searchParams;

  const [project, runs, crews, sheets, readiness] = await Promise.all([
    api.projects.get(FLAGSHIP_PROJECT_ID),
    api.runs.byProject(FLAGSHIP_PROJECT_ID),
    api.crews.list(),
    api.sheets.byProject(FLAGSHIP_PROJECT_ID),
    api.closeout.readiness(FLAGSHIP_PROJECT_ID),
  ]);
  if (!project) throw new Error('Flagship project missing from mock fixtures');

  const bundles: EvidenceRunBundle[] = await Promise.all(
    runs.map(async (run) => {
      const [evidence, tickets] = await Promise.all([
        api.evidence.byRun(run.id),
        api.tickets.byRun(run.id),
      ]);
      const photos = (
        await Promise.all(evidence.map((e) => api.photos.byEvidence(e.id)))
      ).flat();
      return {
        run,
        evidence: [...evidence].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
        photos,
        ticket: tickets[0] ?? null,
        readiness: readiness?.runs.find((r) => r.runId === run.id) ?? null,
        crew: crews.find((c) => c.id === run.crewId) ?? null,
        sheets: run.planSheetIds.flatMap((sheetId) => {
          const sheet = sheets.find((s) => s.id === sheetId);
          return sheet ? [{ id: sheet.id, code: sheet.code, title: sheet.title }] : [];
        }),
      };
    }),
  );

  const crewNames = Object.fromEntries(crews.map((c) => [c.id, c.name]));
  const isValid = (id?: string) => Boolean(id && runs.some((r) => r.id === id));
  const initialRunId = isValid(runParam) ? runParam! : isValid('r-a12') ? 'r-a12' : runs[0]!.id;

  return (
    <div>
      <PageHeader
        title="Evidence Explorer"
        sub={`${project.name} · ${runs.length} runs · mock data`}
      />
      <p className="-mt-4 mb-6 text-sm text-ink-2">
        Every run proves itself: plan → bore log → ticket → field captures → review.
      </p>
      <ExplorerView bundles={bundles} initialRunId={initialRunId} crewNames={crewNames} />
    </div>
  );
}
