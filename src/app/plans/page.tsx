import type { Metadata } from 'next';
import Link from 'next/link';
import { Map as MapIcon } from 'lucide-react';

import { api, FLAGSHIP_PROJECT_ID } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlanViewer } from './PlanViewer';
import type { SheetBundle } from './types';

export const metadata: Metadata = { title: 'Plan Viewer' };

export default async function PlansPage() {
  const [project, sheets, runs] = await Promise.all([
    api.projects.get(FLAGSHIP_PROJECT_ID),
    api.sheets.byProject(FLAGSHIP_PROJECT_ID),
    api.runs.byProject(FLAGSHIP_PROJECT_ID),
  ]);
  if (!project) throw new Error('Flagship project missing from mock fixtures');

  const bundles: SheetBundle[] = await Promise.all(
    sheets.map(async (sheet) => ({
      sheet,
      pins: await api.sheets.pins(sheet.id),
      redlines: await api.redlines.sheetPaths(sheet.id),
    })),
  );

  return (
    <div>
      <PageHeader
        title="Plan Viewer"
        sub={`${project.name} · ${sheets.length} sheets · field redlines over the contract plan set · mock data`}
        actions={
          <Link
            href="/map"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-canvas">
            <MapIcon className="size-4" /> Hero Map
          </Link>
        }
      />
      <PlanViewer
        projectName={project.name}
        projectClient={project.client}
        bundles={bundles}
        runs={runs}
      />
    </div>
  );
}
