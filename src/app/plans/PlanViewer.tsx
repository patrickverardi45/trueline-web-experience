'use client';

// The mock PDF Plan Viewer: sheet rail, toolbar (station search, redline
// toggle, before/after reveal, prev/next), and the drawn sheet canvas.

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { EVIDENCE_KIND } from '@/lib/status';
import { findStation } from './stationIndex';
import { SheetCanvas, type RunRef } from './SheetCanvas';
import { SheetRail } from './SheetRail';
import { SearchBox } from './SearchBox';
import type { PlanViewerProps } from './types';

const SHOWCASE_SHEET_ID = 'sh-c103';

export function PlanViewer({ projectName, projectClient, bundles, runs }: PlanViewerProps) {
  const [activeId, setActiveId] = useState(
    bundles.some((b) => b.sheet.id === SHOWCASE_SHEET_ID)
      ? SHOWCASE_SHEET_ID
      : (bundles[0]?.sheet.id ?? ''),
  );
  const [redlinesOn, setRedlinesOn] = useState(true);
  const [reveal, setReveal] = useState(100);
  const [query, setQuery] = useState('');

  const runsById = useMemo(() => {
    const map: Record<string, RunRef> = {};
    for (const run of runs) map[run.id] = { name: run.name, status: run.status };
    return map;
  }, [runs]);

  const activeIndex = Math.max(
    0,
    bundles.findIndex((b) => b.sheet.id === activeId),
  );
  const active = bundles[activeIndex];
  if (!active) {
    return (
      <EmptyState
        icon={FileText}
        title="No plan sheets"
        detail="This project has no sheets in the mock plan set."
      />
    );
  }

  const match = query.trim() ? findStation(query) : null;
  const searchHit = match && match.sheetId === active.sheet.id ? { code: match.code, x: match.x } : null;

  function openSheet(sheetId: string) {
    if (bundles.some((b) => b.sheet.id === sheetId)) setActiveId(sheetId);
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(15,23,34,0.05)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
          <span className="font-mono text-sm font-semibold text-ink">{active.sheet.code}</span>
          <span className="hidden max-w-72 truncate text-xs text-ink-3 xl:inline">
            {active.sheet.title}
          </span>
        </div>

        <SearchBox
          query={query}
          onQueryChange={setQuery}
          match={match}
          activeSheetId={active.sheet.id}
          onJump={openSheet}
        />

        <Button
          size="sm"
          variant={redlinesOn ? 'primary' : 'secondary'}
          onClick={() => setRedlinesOn((on) => !on)}
          aria-pressed={redlinesOn}>
          {redlinesOn ? 'Redlines on' : 'Redlines off'}
        </Button>

        <label
          className={`flex items-center gap-2 text-[11px] font-medium text-ink-3 ${
            redlinesOn ? '' : 'opacity-50'
          }`}>
          Plan only
          <input
            type="range"
            min={0}
            max={100}
            value={reveal}
            disabled={!redlinesOn}
            onChange={(e) => setReveal(Number(e.target.value))}
            className="w-36 accent-accent"
            aria-label="Before/after redline reveal"
          />
          With redlines
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={!active.sheet.prevSheetId}
            onClick={() => active.sheet.prevSheetId && openSheet(active.sheet.prevSheetId)}>
            <ChevronLeft className="size-3.5" /> Prev
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!active.sheet.nextSheetId}
            onClick={() => active.sheet.nextSheetId && openSheet(active.sheet.nextSheetId)}>
            Next <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <SheetRail
          bundles={bundles}
          runsById={runsById}
          activeId={active.sheet.id}
          onSelect={openSheet}
        />

        <div className="relative min-w-0 flex-1 bg-[#D8DFE7] p-4">
          <SheetCanvas
            bundle={active}
            runsById={runsById}
            projectName={projectName}
            projectClient={projectClient}
            sheetIndex={activeIndex}
            sheetCount={bundles.length}
            redlinesOn={redlinesOn}
            reveal={reveal}
            searchHit={searchHit}
            onMatchlineClick={openSheet}
          />

          {/* Pin legend */}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-white/95 px-3.5 py-1.5 text-[11px] text-ink-2 shadow-sm">
            {(Object.keys(EVIDENCE_KIND) as Array<keyof typeof EVIDENCE_KIND>).map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: EVIDENCE_KIND[kind].hex }}
                />
                {EVIDENCE_KIND[kind].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-px w-4 border-t border-dashed border-navy-600" /> Matchline
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
