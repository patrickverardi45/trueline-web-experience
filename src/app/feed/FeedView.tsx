'use client';

import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';

import { EmptyState } from '@/components/ui/EmptyState';
import { FeedItemRow } from './FeedItemRow';
import type { FeedItem, FeedKind, ProjectOption } from './types';

type KindFilter = 'all' | FeedKind;

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'start', label: 'Start' },
  { value: 'end', label: 'End' },
  { value: 'problem', label: 'Problem' },
  { value: 'station-drop', label: 'Station drop' },
  { value: 'log', label: 'Daily log' },
];

function dayLabel(dayKey: string): string {
  // Noon anchor keeps the printed day stable regardless of viewer timezone.
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

interface Props {
  items: FeedItem[];
  projects: ProjectOption[];
}

export function FeedView({ items, projects }: Props) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [projectId, setProjectId] = useState('all');

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (kind === 'all' || item.kind === kind) &&
          (projectId === 'all' || item.projectId === projectId),
      ),
    [items, kind, projectId],
  );

  const days = useMemo(() => {
    const byDay = new Map<string, FeedItem[]>();
    for (const item of filtered) {
      const bucket = byDay.get(item.dayKey);
      if (bucket) bucket.push(item);
      else byDay.set(item.dayKey, [item]);
    }
    return [...byDay.entries()];
  }, [filtered]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Filter by capture kind"
          className="flex flex-wrap items-center gap-1.5">
          {KIND_FILTERS.map((f) => {
            const active = kind === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
                  active
                    ? 'bg-navy-900 text-white ring-navy-900'
                    : 'bg-white text-ink-2 ring-line hover:bg-canvas'
                }`}>
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-ink-3">
            {filtered.length} of {items.length} entries
          </span>
          <select
            aria-label="Filter by project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700">
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {days.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No entries match these filters"
          detail="Try a different capture kind or project — every field capture and daily log lands in this feed."
        />
      ) : (
        days.map(([dayKey, dayItems]) => (
          <section key={dayKey} className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold text-ink">{dayLabel(dayKey)}</h2>
              <span className="text-xs text-ink-3">
                {dayItems.length} {dayItems.length === 1 ? 'entry' : 'entries'}
              </span>
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-3">
              {dayItems.map((item) => (
                <FeedItemRow key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
