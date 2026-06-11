import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CheckCircle2, FileDown, Hammer, ListChecks, OctagonAlert } from 'lucide-react';

import { api, FLAGSHIP_PROJECT_ID } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { KpiStat } from '@/components/ui/KpiStat';
import { PageHeader } from '@/components/ui/PageHeader';
import { ReadinessRing } from '@/components/ui/ReadinessRing';
import { SectionHeader } from '@/components/ui/SectionHeader';

import { ApprovalNote } from './ApprovalNote';
import { EvidencePanels } from './EvidencePanels';
import { ReadinessTable } from './ReadinessTable';

export const metadata: Metadata = { title: 'Closeout readiness' };

export default async function CloseoutPage() {
  const [project, readiness, runs, issues, crews] = await Promise.all([
    api.projects.get(FLAGSHIP_PROJECT_ID),
    api.closeout.readiness(FLAGSHIP_PROJECT_ID),
    api.runs.byProject(FLAGSHIP_PROJECT_ID),
    api.issues.byProject(FLAGSHIP_PROJECT_ID),
    api.crews.list(),
  ]);
  if (!project || !readiness) notFound();

  const missingRunCount = new Set(readiness.missing.map((m) => m.runId)).size;
  const blockedNames = readiness.runsBlocked
    .map((runId) => runs.find((r) => r.id === runId)?.name ?? runId)
    .join(', ');

  return (
    <div>
      <PageHeader
        title="Closeout readiness"
        sub={`${project.name} · ${project.client} · mock data`}
        actions={
          <>
            <Link
              href="/packet"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
              <FileDown className="size-4" /> Export packet
            </Link>
            <ApprovalNote />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="flex items-center gap-5 xl:col-span-2">
          <ReadinessRing score={readiness.score} size={72} />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-ink">
              {readiness.score}% of required closeout evidence is in across{' '}
              {readiness.runs.length} runs.
            </p>
            <p className="mt-1 text-xs text-ink-3">Updated {dateTime(readiness.updatedAt)}</p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4 xl:col-span-3">
          <KpiStat
            label="Runs ready"
            value={String(readiness.runsReady.length)}
            sub={`of ${readiness.runs.length} runs`}
            icon={CheckCircle2}
          />
          <KpiStat
            label="Runs blocked"
            value={String(readiness.runsBlocked.length)}
            sub={blockedNames || 'none'}
            icon={OctagonAlert}
            tone={readiness.runsBlocked.length > 0 ? 'danger' : 'default'}
          />
          <KpiStat
            label="Not yet ready"
            value={String(readiness.runsInProgress.length)}
            sub="evidence or review outstanding"
            icon={Hammer}
          />
          <KpiStat
            label="Missing items"
            value={String(readiness.missing.length)}
            sub={`across ${missingRunCount} runs`}
            icon={ListChecks}
            tone="accent"
          />
        </div>
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Per-run readiness"
          sub="Click a run to inspect it on the Hero Map"
        />
        <ReadinessTable readiness={readiness} runs={runs} issues={issues} crews={crews} />
      </div>

      <div className="mt-8">
        <EvidencePanels readiness={readiness} runs={runs} issues={issues} />
      </div>
    </div>
  );
}
