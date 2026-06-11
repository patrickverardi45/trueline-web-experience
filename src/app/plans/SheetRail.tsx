'use client';

// Left rail: the sheet index for the plan set. Click a sheet to open it.

import { RUN_STATUS } from '@/lib/status';
import type { RunRef } from './SheetCanvas';
import type { SheetBundle } from './types';

interface Props {
  bundles: SheetBundle[];
  runsById: Record<string, RunRef>;
  activeId: string;
  onSelect: (sheetId: string) => void;
}

export function SheetRail({ bundles, runsById, activeId, onSelect }: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-2">Sheet index</div>
        <div className="mt-0.5 text-[11px] text-ink-3">{bundles.length} sheets in set</div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {bundles.map(({ sheet, pins, redlines }) => {
          const active = sheet.id === activeId;
          const redline = redlines[0];
          const runNames = sheet.runIds
            .map((id) => runsById[id]?.name ?? id)
            .join(' · ');
          return (
            <li key={sheet.id}>
              <button
                type="button"
                onClick={() => onSelect(sheet.id)}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  active ? 'border-l-2 border-accent bg-accent-soft/60' : 'border-l-2 border-transparent hover:bg-canvas'
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono text-sm font-semibold ${active ? 'text-accent-strong' : 'text-ink'}`}>
                    {sheet.code}
                  </span>
                  {redline ? (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: RUN_STATUS[redline.status].hex }}
                      title={`Redline — ${RUN_STATUS[redline.status].label}`}
                    />
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-ink-3">{sheet.title}</div>
                <div className="mt-1 text-[11px] text-ink-3">
                  {runNames} · {pins.length} pin{pins.length === 1 ? '' : 's'}
                  {redline ? '' : ' · no redline yet'}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-3">
        Mock sheet set — stylized preview, not the engineered PDF. Engine-linked plan sets arrive
        later.
      </div>
    </aside>
  );
}
