'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Calculator,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Drill,
  FileSignature,
  ImageIcon,
  Layers,
  PenLine,
} from 'lucide-react';

import type { CloseoutPacket, PacketSection, Project } from '@/contracts';
import type { StatusMeta } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SummaryRail } from './SummaryRail';

export interface PacketBundle {
  packet: CloseoutPacket;
  project: Project;
}

interface SectionMeta {
  icon: LucideIcon;
  unit: [singular: string, plural: string];
  /** Plausible mock arithmetic for the estimated page count. */
  pagesPerItem: number;
}

export const SECTION_META: Record<PacketSection['kind'], SectionMeta> = {
  cover: { icon: FileSignature, unit: ['page', 'pages'], pagesPerItem: 1 },
  'as-builts': { icon: Layers, unit: ['sheet', 'sheets'], pagesPerItem: 1 },
  redlines: { icon: PenLine, unit: ['redline', 'redlines'], pagesPerItem: 1 },
  'bore-logs': { icon: Drill, unit: ['bore log', 'bore logs'], pagesPerItem: 2 },
  photos: { icon: ImageIcon, unit: ['photo', 'photos'], pagesPerItem: 0.25 },
  tickets: { icon: ClipboardList, unit: ['ticket', 'tickets'], pagesPerItem: 1 },
  'daily-logs': { icon: CalendarDays, unit: ['daily log', 'daily logs'], pagesPerItem: 1 },
  quantities: { icon: Calculator, unit: ['summary', 'summaries'], pagesPerItem: 2 },
};

export function itemCountLabel(section: PacketSection): string {
  const [singular, plural] = SECTION_META[section.kind].unit;
  return `${section.itemCount} ${section.itemCount === 1 ? singular : plural}`;
}

/** Packet lifecycle chips, styled locally — packet status is not a run/review status. */
export const PACKET_STATUS: Record<CloseoutPacket['status'], StatusMeta> = {
  draft: { label: 'Draft', hex: '#E9A23B', chip: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  assembling: { label: 'Assembling', hex: '#2563C4', chip: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  ready: { label: 'Ready', hex: '#1FA563', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  submitted: { label: 'Submitted', hex: '#2563C4', chip: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  accepted: { label: 'Accepted', hex: '#1FA563', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
};

/** Short tab names — the packet fixture names carry a ' — Closeout Packet' suffix. */
const TAB_NAME: Record<string, string> = {
  'demo-project-001': 'Demo Project 001 — v2 staging',
  'demo-project-003': 'Demo Project 003',
};

/** Why a Demo Project 001 section is still waiting, matching the readiness fixture story. */
const WAITING_REASON: Record<string, string> = {
  'as-builts': 'Runs A-12 / A-13 still in progress — sheets not final',
  redlines: 'Run B-04 redline pending review approval',
  tickets: 'Tickets T-1040 / T-1042 still in draft',
};

export function PacketBuilder({ bundles }: { bundles: PacketBundle[] }) {
  const [activeId, setActiveId] = useState(bundles[0]?.packet.id ?? '');
  const [includedByPacket, setIncludedByPacket] = useState<Record<string, Record<string, boolean>>>(
    () =>
      Object.fromEntries(
        bundles.map((b) => [
          b.packet.id,
          Object.fromEntries(b.packet.sections.map((s) => [s.id, s.included])),
        ]),
      ),
  );

  const active = bundles.find((b) => b.packet.id === activeId) ?? bundles[0];
  if (!active) return null;
  const included = includedByPacket[active.packet.id] ?? {};

  const toggleSection = (sectionId: string) =>
    setIncludedByPacket((prev) => ({
      ...prev,
      [active.packet.id]: {
        ...prev[active.packet.id],
        [sectionId]: !prev[active.packet.id]?.[sectionId],
      },
    }));

  return (
    <div>
      <PageHeader
        title="Closeout Packet Builder"
        sub="Assemble approved field evidence into a client-ready deliverable · mock data"
      />

      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Closeout packets">
        {bundles.map(({ packet, project }) => {
          const meta = PACKET_STATUS[packet.status];
          const isActive = packet.id === active.packet.id;
          return (
            <button
              key={packet.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(packet.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-accent bg-white text-ink shadow-sm'
                  : 'border-line bg-white/60 text-ink-3 hover:bg-white hover:text-ink'
              }`}>
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              {TAB_NAME[project.id] ?? project.name} · {meta.label}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionHeader
            title="Packet sections"
            sub="Check the sections to bind into this packet — order matches the delivered PDF"
          />
          <Card flush>
            <ul className="divide-y divide-line">
              {active.packet.sections.map((section) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  isIncluded={included[section.id] ?? false}
                  onToggle={() => toggleSection(section.id)}
                />
              ))}
            </ul>
          </Card>
        </div>

        <SummaryRail
          key={active.packet.id}
          packet={active.packet}
          includedSections={active.packet.sections.filter((s) => included[s.id])}
        />
      </div>

      <p className="mt-8 border-t border-line pt-4 text-xs text-ink-3">
        Packet assembly is a placeholder. Real export consumes the same CloseoutPacket contract.
      </p>
    </div>
  );
}

function SectionRow({
  section,
  isIncluded,
  onToggle,
}: {
  section: PacketSection;
  isIncluded: boolean;
  onToggle: () => void;
}) {
  const meta = SECTION_META[section.kind];
  const Icon = meta.icon;
  return (
    <li className={`flex items-center gap-4 px-5 py-3.5 ${isIncluded ? '' : 'opacity-55'}`}>
      <input
        type="checkbox"
        checked={isIncluded}
        onChange={onToggle}
        aria-label={`Include ${section.title}`}
        className="size-4 shrink-0 cursor-pointer rounded border-line"
        style={{ accentColor: 'var(--color-accent)' }}
      />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-navy-700">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{section.title}</div>
        <div className="text-xs text-ink-3">{itemCountLabel(section)}</div>
      </div>
      {section.ready ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <CheckCircle2 className="size-4" /> Ready
        </span>
      ) : (
        <div className="shrink-0 text-right">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <Clock className="size-4" /> Waiting
          </span>
          <div className="mt-0.5 max-w-52 text-xs leading-snug text-ink-3">
            {WAITING_REASON[section.kind] ?? 'Waiting on field review'}
          </div>
        </div>
      )}
    </li>
  );
}
