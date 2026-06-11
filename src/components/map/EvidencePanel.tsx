'use client';

import Link from 'next/link';
import { AlertTriangle, FileText, Play, ShieldCheck, X } from 'lucide-react';

import { dateTime, ft, pctLabel } from '@/lib/format';
import { METHOD_LABEL, RUN_STATUS } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { EvidenceChecklist } from '@/components/ui/EvidenceChecklist';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { ProgressMeter } from '@/components/ui/ProgressMeter';
import { StatusPill } from '@/components/ui/StatusPill';
import type { MapRunBundle } from './types';

interface Props {
  bundle: MapRunBundle;
  playbackAvailable: boolean;
  onStartPlayback: () => void;
  onClose: () => void;
}

function readinessColor(score: number): string {
  if (score >= 90) return 'var(--color-status-complete)';
  if (score >= 60) return 'var(--color-status-review)';
  return 'var(--color-status-blocked)';
}

export function EvidencePanel({ bundle, playbackAvailable, onStartPlayback, onClose }: Props) {
  const { run, photos, readiness, crew } = bundle;
  const meta = RUN_STATUS[run.status];
  const shownPhotos = photos.slice(0, 6);

  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col overflow-y-auto border-l border-line bg-white">
      <div className="sticky top-0 z-10 border-b border-line bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-ink">{run.name}</h3>
            <div className="mt-1 flex items-center gap-2">
              <StatusPill meta={meta} size="sm" />
              <span className="text-xs text-ink-3">{METHOD_LABEL[run.method]}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evidence panel"
            className="rounded-lg p-1.5 text-ink-3 hover:bg-canvas hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Start</div>
            <div className="font-mono text-xs font-semibold text-ink">{run.fromStationCode}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">End</div>
            <div className="font-mono text-xs font-semibold text-ink">{run.toStationCode}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Crew</div>
            <div className="text-xs font-semibold text-ink">{crew?.name ?? 'Unassigned'}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
              Last activity
            </div>
            <div className="text-xs font-semibold text-ink">{dateTime(run.lastActivityAt)}</div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-ink-3">Footage</span>
            <span className="font-semibold text-ink">
              {ft(run.placedFt)} of {ft(run.lengthFt)} · {pctLabel(run.placedFt, run.lengthFt)}
            </span>
          </div>
          <ProgressMeter value={run.lengthFt > 0 ? run.placedFt / run.lengthFt : 0} color={meta.hex} />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Evidence</div>
          <EvidenceChecklist summary={run.evidence} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-3">
              Field photos
            </span>
            <span className="text-xs text-ink-3">
              {photos.length} captured
              {photos.length > shownPhotos.length ? ` · showing ${shownPhotos.length}` : ''}
            </span>
          </div>
          {shownPhotos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
              No photos yet — captures land here from the field app.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {shownPhotos.map((photo) => (
                <PhotoPlaceholder key={photo.id} stationCode={photo.stationCode} />
              ))}
            </div>
          )}
        </div>

        {readiness ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide text-ink-3">
                Closeout readiness
              </span>
              <span className="font-semibold" style={{ color: readinessColor(readiness.score) }}>
                {readiness.score}%
              </span>
            </div>
            <ProgressMeter value={readiness.score / 100} color={readinessColor(readiness.score)} />
            {readiness.missing.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {readiness.missing.map((m, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-ink-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
                    {m.description}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs font-medium text-emerald-600">
                All evidence in — ready for the packet.
              </p>
            )}
            {readiness.blockedBy.length > 0 ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                <AlertTriangle className="size-3.5" /> Blocked by {readiness.blockedBy.length} open
                issue{readiness.blockedBy.length === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 border-t border-line pt-4">
          <Button
            onClick={onStartPlayback}
            disabled={!playbackAvailable}
            className="w-full"
            title={playbackAvailable ? undefined : 'No playback events recorded yet'}>
            <Play className="size-4" /> Redline playback
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/plans"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-2 text-xs font-semibold text-ink hover:bg-canvas">
              <FileText className="size-3.5" /> Plan sheet
            </Link>
            <Link
              href={`/evidence?run=${run.id}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-2 text-xs font-semibold text-ink hover:bg-canvas">
              <ShieldCheck className="size-3.5" /> Evidence chain
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
