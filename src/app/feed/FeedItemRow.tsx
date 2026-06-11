import { FileText, MapPin } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { timeOnly } from '@/lib/format';
import { EVIDENCE_KIND } from '@/lib/status';
import type { FeedItem } from './types';

const LOG_CHIP = 'bg-slate-100 text-slate-600 ring-slate-500/20';
const MAX_PHOTOS = 4;

export function FeedItemRow({ item }: { item: FeedItem }) {
  const chip =
    item.kind === 'log'
      ? { label: 'Daily log', chip: LOG_CHIP }
      : EVIDENCE_KIND[item.kind];
  const metaLine = (
    item.kind === 'log'
      ? [item.projectName, item.weather]
      : [item.runName, item.projectName, item.crewName]
  )
    .filter(Boolean)
    .join(' · ');
  const shownPhotos = item.photos.slice(0, MAX_PHOTOS);
  const extraPhotos = item.photos.length - shownPhotos.length;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${chip.chip}`}>
            {chip.label}
          </span>
          <span className="truncate text-sm font-semibold text-ink">{item.title}</span>
        </div>
        <span className="shrink-0 text-xs text-ink-3">{timeOnly(item.at)}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span className="truncate">{metaLine}</span>
        {item.stationCode ? (
          <span className="font-mono text-[11px] font-medium text-ink-2">{item.stationCode}</span>
        ) : null}
        {item.gps ? (
          <span className="inline-flex items-center gap-1 font-mono text-[11px]">
            <MapPin className="size-3" strokeWidth={1.75} />
            {item.gps.lat.toFixed(4)}, {item.gps.lng.toFixed(4)}
          </span>
        ) : null}
      </div>

      {item.kind === 'log' ? (
        <div className="mt-2">
          <p className="line-clamp-2 text-xs leading-relaxed text-ink-2">{item.summary}</p>
          {item.quantities && item.quantities.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.quantities.map((q) => (
                <span
                  key={q.label}
                  className="rounded-md bg-navy-900/5 px-2 py-0.5 text-[11px] font-medium text-navy-700">
                  {q.label} · {q.qty.toLocaleString('en-US')} {q.unit}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {item.note ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-2">{item.note}</p>
      ) : null}

      {item.photos.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {shownPhotos.map((p) => (
            <PhotoPlaceholder
              key={p.id}
              caption={p.caption}
              stationCode={p.stationCode}
              className="w-28"
            />
          ))}
          {extraPhotos > 0 ? (
            <div className="flex aspect-[4/3] w-28 items-center justify-center rounded-lg border border-dashed border-line bg-navy-900/[0.02] text-sm font-semibold text-ink-3">
              +{extraPhotos}
            </div>
          ) : null}
        </div>
      ) : null}

      {item.sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.sources.map((s) => (
            <span
              key={s.refId}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-[10px] text-ink-2">
              <FileText className="size-3" strokeWidth={1.75} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
