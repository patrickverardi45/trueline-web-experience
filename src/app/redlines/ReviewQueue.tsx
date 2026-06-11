'use client';

// Two-pane review queue: submissions list with status filters on the left,
// full review detail (preview, evidence, quantities, mock decision) on the
// right. All decisions are local client state — no backend mutation exists.

import { useState } from 'react';
import { Inbox } from 'lucide-react';

import type { ReviewStatus } from '@/contracts';
import { shortDate } from '@/lib/format';
import { REVIEW_STATUS } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';

import { ReviewDetail } from './ReviewDetail';
import type { MockDecision, ReviewItem } from './review-types';

const FILTERS: ReviewStatus[] = [
  'in-review',
  'submitted',
  'draft',
  'changes-requested',
  'approved',
];

function FilterChip({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-navy-900 bg-navy-900 text-white'
          : 'border-line bg-white text-ink-2 hover:bg-canvas'
      }`}>
      {dot ? <span className={`size-1.5 rounded-full ${dot}`} /> : null}
      {label}
      <span className={`font-semibold ${active ? 'text-white' : 'text-ink'}`}>{count}</span>
    </button>
  );
}

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.runId ?? null);
  const [decisions, setDecisions] = useState<Record<string, MockDecision>>({});

  const effectiveStatus = (item: ReviewItem): ReviewStatus =>
    decisions[item.runId] ?? item.reviewStatus;

  const visible = items.filter((item) => filter === 'all' || effectiveStatus(item) === filter);
  const selected = visible.find((item) => item.runId === selectedId) ?? visible[0] ?? null;

  const decide = (runId: string, decision: MockDecision) =>
    setDecisions((prev) => ({ ...prev, [runId]: decision }));
  const reset = (runId: string) =>
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[runId];
      return next;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          count={items.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {FILTERS.map((status) => {
          const meta = REVIEW_STATUS[status];
          const count = items.filter((item) => effectiveStatus(item) === status).length;
          return (
            <FilterChip
              key={status}
              label={meta.label}
              count={count}
              dot={meta.dot}
              active={filter === status}
              onClick={() => setFilter(status)}
            />
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          {visible.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No submissions match this filter"
              detail="Pick another status above — mock decisions move items between buckets."
            />
          ) : (
            <Card flush className="overflow-hidden">
              <ul className="divide-y divide-line">
                {visible.map((item) => {
                  const meta = REVIEW_STATUS[effectiveStatus(item)];
                  const isSelected = selected?.runId === item.runId;
                  return (
                    <li key={item.runId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.runId)}
                        aria-current={isSelected}
                        className={`relative w-full px-4 py-3 text-left transition-colors ${
                          isSelected ? 'bg-accent-soft/40' : 'hover:bg-canvas/60'
                        }`}>
                        {isSelected ? (
                          <span className="absolute inset-y-0 left-0 w-1 bg-accent" />
                        ) : null}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">{item.runName}</span>
                          <StatusPill meta={meta} size="sm" />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-3">
                          <span className="min-w-0 truncate">
                            <span className="font-mono text-ink-2">{item.sheetCode}</span> ·{' '}
                            {item.crewName} — {item.crewLead}
                          </span>
                          <span className="shrink-0">{shortDate(item.ticketDate)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <div className="xl:col-span-3">
          {selected ? (
            <ReviewDetail
              item={selected}
              decision={decisions[selected.runId]}
              onDecide={(decision) => decide(selected.runId, decision)}
              onReset={() => reset(selected.runId)}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="Select a submission"
              detail="Pick a run from the queue to review its redline and evidence."
            />
          )}
        </div>
      </div>
    </div>
  );
}
