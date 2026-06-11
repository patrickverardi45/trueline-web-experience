'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileCheck, History } from 'lucide-react';

import type { CloseoutPacket, PacketSection } from '@/contracts';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressMeter } from '@/components/ui/ProgressMeter';
import { StatusPill } from '@/components/ui/StatusPill';
import { PACKET_STATUS, SECTION_META } from './PacketBuilder';

type Phase = 'idle' | 'assembling' | 'done';

/** Mock page estimate: photos bind several to a page, bore logs run long. */
function estimatePages(sections: PacketSection[]): number {
  return sections.reduce(
    (sum, s) => sum + Math.max(1, Math.ceil(s.itemCount * SECTION_META[s.kind].pagesPerItem)),
    0,
  );
}

export function SummaryRail({
  packet,
  includedSections,
}: {
  packet: CloseoutPacket;
  includedSections: PacketSection[];
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (phase !== 'assembling') return;
    const timer = setInterval(() => {
      setProgress((p) => Math.min(100, p + 7));
    }, 130);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'assembling' && progress >= 100) setPhase('done');
  }, [phase, progress]);

  const totalItems = includedSections.reduce((sum, s) => sum + s.itemCount, 0);
  const meta = PACKET_STATUS[packet.status];
  const assembleLabel = packet.status === 'ready' ? 'Re-assemble packet' : 'Assemble packet';

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
          <FileCheck className="size-5" strokeWidth={1.75} />
        </div>
        <StatusPill meta={meta} size="sm" />
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-snug text-ink">{packet.name}</h3>
      {packet.generatedAt ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-3">
          <History className="size-3.5" /> Generated {dateTime(packet.generatedAt)}
        </p>
      ) : null}

      <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-3">Included sections</dt>
          <dd className="font-semibold text-ink">
            {includedSections.length} of {packet.sections.length}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-3">Total items</dt>
          <dd className="font-semibold text-ink">{totalItems}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-3">Page count</dt>
          <dd className="font-semibold text-ink">
            {estimatePages(includedSections)} pages <span className="font-normal text-ink-3">est.</span>
          </dd>
        </div>
      </dl>

      <div className="mt-5 space-y-3">
        {phase === 'assembling' ? (
          <div>
            <ProgressMeter value={progress / 100} />
            <div className="mt-1.5 text-xs text-ink-3">Assembling sections… {progress}%</div>
          </div>
        ) : null}

        {phase === 'done' ? (
          <p className="inline-flex items-start gap-1.5 text-xs leading-snug text-emerald-700">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            Packet draft assembled (mock) — PDF export arrives with the backend.
          </p>
        ) : null}

        <Button
          className="w-full"
          disabled={phase === 'assembling' || includedSections.length === 0}
          onClick={() => {
            setProgress(0);
            setPhase('assembling');
          }}>
          {phase === 'done' ? 'Re-assemble packet' : assembleLabel}
        </Button>

        {phase === 'done' || packet.status === 'ready' ? (
          <Button variant="secondary" className="w-full" disabled>
            <Download className="size-4" /> Download packet (PDF)
          </Button>
        ) : null}

        <p className="text-center text-[11px] text-ink-3">
          Mock action — backend integration arrives later
        </p>
      </div>
    </Card>
  );
}
