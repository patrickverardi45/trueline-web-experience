'use client';

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Camera,
  CircleDashed,
  ClipboardList,
  FileText,
  Flag,
  MapPin,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { EvidenceItem, FieldPhoto, SourceRef } from '@/contracts';
import { dateTime, shortDate } from '@/lib/format';
import { EVIDENCE_KIND, REVIEW_STATUS } from '@/lib/status';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { StatusPill } from '@/components/ui/StatusPill';
import type { EvidenceRunBundle } from './types';

const KIND_ICON: Record<EvidenceItem['kind'], LucideIcon> = {
  start: Camera,
  end: Flag,
  problem: AlertTriangle,
  'station-drop': MapPin,
};

function readinessColor(score: number): string {
  if (score >= 90) return 'var(--color-status-complete)';
  if (score >= 60) return 'var(--color-status-review)';
  return 'var(--color-status-blocked)';
}

function ChainNode({
  icon: Icon,
  iconColor,
  missing = false,
  children,
}: {
  icon: LucideIcon;
  iconColor: string;
  missing?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-5 after:absolute after:bottom-0 after:left-[17px] after:top-9 after:w-px after:bg-line last:pb-0 last:after:hidden">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full border bg-white ${
          missing ? 'border-dashed border-amber-400' : 'border-line shadow-[0_1px_2px_rgba(15,23,34,0.05)]'
        }`}>
        <Icon className="size-4" strokeWidth={1.75} style={{ color: iconColor }} />
      </span>
      <div
        className={`min-w-0 flex-1 rounded-xl border p-4 ${
          missing
            ? 'border-dashed border-amber-400/70 bg-amber-50/50'
            : 'border-line bg-white shadow-[0_1px_2px_rgba(15,23,34,0.05)]'
        }`}>
        {children}
      </div>
    </li>
  );
}

function SourceChips({ sources }: { sources: SourceRef[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <span
          key={`${s.type}-${s.refId}`}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 ring-1 ring-inset ring-slate-500/10">
          {s.label}
        </span>
      ))}
    </div>
  );
}

function MissingNode({ title, stationCode }: { title: string; stationCode?: string }) {
  return (
    <ChainNode icon={CircleDashed} iconColor="#B45309" missing>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-amber-800">{title}</span>
        {stationCode ? <span className="font-mono text-xs text-amber-700">{stationCode}</span> : null}
      </div>
      <p className="mt-1 text-xs font-semibold text-amber-700">Missing — required for closeout</p>
    </ChainNode>
  );
}

function CapturedNode({
  item,
  photos,
  crewName,
}: {
  item: EvidenceItem;
  photos: FieldPhoto[];
  crewName: string;
}) {
  const kind = EVIDENCE_KIND[item.kind];
  const shown = photos.slice(0, 3);
  return (
    <ChainNode icon={KIND_ICON[item.kind]} iconColor={kind.hex}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${kind.chip}`}>
          {kind.label}
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{item.label}</span>
        <span className="ml-auto shrink-0">
          <StatusPill meta={REVIEW_STATUS[item.review]} size="sm" />
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span>{dateTime(item.capturedAt)}</span>
        <span>{crewName}</span>
        {item.stationCode ? (
          <span className="font-mono font-semibold text-ink-2">{item.stationCode}</span>
        ) : null}
      </div>
      {shown.length > 0 ? (
        <div className="mt-3 grid max-w-md grid-cols-3 gap-2">
          {shown.map((p) => (
            <PhotoPlaceholder key={p.id} caption={p.caption} stationCode={p.stationCode} />
          ))}
        </div>
      ) : null}
      {item.note ? (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-2">
          {item.note}
        </p>
      ) : null}
      <div className="mt-3">
        <SourceChips sources={item.sources} />
      </div>
    </ChainNode>
  );
}

export function EvidenceChain({
  bundle,
  crewNames,
}: {
  bundle: EvidenceRunBundle;
  crewNames: Record<string, string>;
}) {
  const { run, evidence, photos, ticket, readiness, sheets } = bundle;
  const photosFor = (evidenceId: string) => photos.filter((p) => p.evidenceItemId === evidenceId);

  return (
    <ol>
      {sheets.map((sheet) => (
        <ChainNode key={sheet.id} icon={FileText} iconColor="var(--color-navy-600)">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
              Plan sheet source
            </span>
            <span className="font-mono text-sm font-semibold text-ink">{sheet.code}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-2">{sheet.title}</p>
        </ChainNode>
      ))}

      {run.boreLogRef ? (
        <ChainNode icon={ScrollText} iconColor="var(--color-navy-600)">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
              Bore log source
            </span>
            <span className="font-mono text-sm font-semibold text-ink">{run.boreLogRef.label}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-2">
            Rod-by-rod depths backing the station drops on this run.
          </p>
        </ChainNode>
      ) : run.method === 'bore' ? (
        <MissingNode title="Bore log" />
      ) : null}

      {ticket ? (
        <ChainNode icon={ClipboardList} iconColor="var(--color-accent-strong)">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
              Field ticket
            </span>
            <span className="font-mono text-sm font-semibold uppercase text-ink">{ticket.id}</span>
            <span className="ml-auto shrink-0">
              <StatusPill meta={REVIEW_STATUS[ticket.status]} size="sm" />
            </span>
          </div>
          <div className="mt-1.5 text-xs text-ink-3">
            {shortDate(ticket.date)} · {crewNames[ticket.crewId] ?? ticket.crewId} ·{' '}
            {ticket.quantities.length} quantity line{ticket.quantities.length === 1 ? '' : 's'}
          </div>
          {ticket.notes ? (
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-2">
              {ticket.notes}
            </p>
          ) : null}
        </ChainNode>
      ) : (
        <MissingNode title="Field ticket" />
      )}

      {!run.evidence.hasStart ? (
        <MissingNode title="Start evidence" stationCode={run.fromStationCode} />
      ) : null}

      {evidence.map((item) => (
        <CapturedNode
          key={item.id}
          item={item}
          photos={photosFor(item.id)}
          crewName={crewNames[item.crewId] ?? item.crewId}
        />
      ))}

      {!run.evidence.hasEnd ? (
        <MissingNode title="End evidence" stationCode={run.toStationCode} />
      ) : null}

      <ChainNode icon={ShieldCheck} iconColor="var(--color-navy-600)">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
            Review state
          </span>
          {ticket ? (
            <StatusPill meta={REVIEW_STATUS[ticket.status]} size="sm" />
          ) : (
            <span className="text-xs font-semibold text-amber-700">No ticket submitted</span>
          )}
        </div>
        {readiness ? (
          <p className="mt-1.5 text-xs text-ink-2">
            Closeout readiness{' '}
            <span className="font-semibold" style={{ color: readinessColor(readiness.score) }}>
              {readiness.score}%
            </span>
            {readiness.missing.length > 0
              ? ` · ${readiness.missing.length} item${readiness.missing.length === 1 ? '' : 's'} outstanding`
              : ' · ready for the packet'}
          </p>
        ) : null}
      </ChainNode>
    </ol>
  );
}
