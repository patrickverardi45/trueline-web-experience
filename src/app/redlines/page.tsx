import type { ReviewStatus } from '@/contracts';
import { api, FLAGSHIP_PROJECT_ID } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';

import { EngineArtifactPanel } from './EngineArtifactPanel';
import { EngineReviewPanel } from './EngineReviewPanel';
import { RedlineManifestPanel } from './RedlineManifestPanel';
import { RunAssemblyPanel } from './RunAssemblyPanel';
import { ReviewQueue } from './ReviewQueue';
import type { ReviewItem } from './review-types';

export const metadata = { title: 'Redline Review' };

/** Actionable submissions first, signed-off work last. */
const QUEUE_ORDER: Record<ReviewStatus, number> = {
  'in-review': 0,
  submitted: 1,
  draft: 2,
  'changes-requested': 3,
  approved: 4,
};

export default async function RedlinesPage() {
  const [project, runs, tickets, crews, sheets, engineBundle, engineArtifacts] =
    await Promise.all([
      api.projects.get(FLAGSHIP_PROJECT_ID),
      api.runs.byProject(FLAGSHIP_PROJECT_ID),
      api.tickets.byProject(FLAGSHIP_PROJECT_ID),
      api.crews.list(),
      api.sheets.byProject(FLAGSHIP_PROJECT_ID),
      api.reviews.engineBundle(),
      api.reviews.engineDesignStrokeArtifacts(),
    ]);

  // M9.7: default-OFF run-assembly panel. When the flag is unset the panel does not
  // render and no run-assembly read is performed (fixture or live).
  const runAssemblyEnabled = process.env.NEXT_PUBLIC_TL2_RUN_ASSEMBLY === '1';
  const runAssembly = runAssemblyEnabled ? await api.reviews.engineRunAssembly() : null;

  // Phase 2K: default-OFF durable redline-manifest panel. When the flag is unset the panel does
  // not render and no manifest read is performed.
  const redlineManifestEnabled = process.env.NEXT_PUBLIC_TL2_REDLINE_MANIFEST === '1';
  const redlineManifest = redlineManifestEnabled ? await api.reviews.engineRedlineManifest() : null;

  const items: ReviewItem[] = [];
  for (const run of runs) {
    const ticket = tickets.find((t) => t.runId === run.id);
    if (!ticket) continue;

    const sheetId = run.planSheetIds[0];
    const sheet = sheets.find((s) => s.id === sheetId);
    const sheetPaths = sheetId ? await api.redlines.sheetPaths(sheetId) : [];
    const crew = crews.find((c) => c.id === ticket.crewId);

    items.push({
      runId: run.id,
      runName: run.name,
      fromStationCode: run.fromStationCode,
      toStationCode: run.toStationCode,
      lengthFt: run.lengthFt,
      placedFt: run.placedFt,
      method: run.method,
      sheetCode: sheet?.code ?? '—',
      sheetTitle: sheet?.title ?? 'Plan sheet pending',
      crewName: crew?.name ?? 'Unassigned',
      crewLead: crew?.lead ?? '—',
      ticketId: ticket.id,
      ticketDate: ticket.date,
      reviewStatus: ticket.status,
      quantities: ticket.quantities,
      ticketNotes: ticket.notes,
      evidence: run.evidence,
      redline: sheetPaths.find((p) => p.runId === run.id) ?? null,
    });
  }

  items.sort(
    (a, b) =>
      QUEUE_ORDER[a.reviewStatus] - QUEUE_ORDER[b.reviewStatus] ||
      b.ticketDate.localeCompare(a.ticketDate),
  );

  return (
    <div>
      <PageHeader
        title="Redline Review"
        sub={`${project?.name ?? 'Brenham PH5 — v2 staging'} · read-only v2 staging · the durable redline manifest below is real engine data`}
      />
      {redlineManifest ? <RedlineManifestPanel view={redlineManifest} /> : null}
      {runAssembly ? <RunAssemblyPanel review={runAssembly} /> : null}
      <EngineReviewPanel bundle={engineBundle} />
      <EngineArtifactPanel manifest={engineArtifacts} />
      <details className="mt-8 overflow-hidden rounded-xl border border-dashed border-line bg-canvas/40">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink-3 hover:bg-canvas/60">
          Mock UI demo queue — not engine data ({items.length})
        </summary>
        <div className="border-t border-line p-3">
          <ReviewQueue items={items} />
        </div>
      </details>
    </div>
  );
}
