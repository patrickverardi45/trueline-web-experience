import type { ReviewStatus } from '@/contracts';
import { api, FLAGSHIP_PROJECT_ID } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';

import { EngineReviewPanel } from './EngineReviewPanel';
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
  const [project, runs, tickets, crews, sheets, engineBundle] = await Promise.all([
    api.projects.get(FLAGSHIP_PROJECT_ID),
    api.runs.byProject(FLAGSHIP_PROJECT_ID),
    api.tickets.byProject(FLAGSHIP_PROJECT_ID),
    api.crews.list(),
    api.sheets.byProject(FLAGSHIP_PROJECT_ID),
    api.reviews.engineBundle(),
  ]);

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
        sub={`${project?.name ?? 'Cedar Ridge FTTH — Phase 2'} · ${items.length} submissions in queue · mock data`}
      />
      <ReviewQueue items={items} />
      <EngineReviewPanel bundle={engineBundle} />
    </div>
  );
}
