'use client';

// Station search input + feedback. The mock station index only covers C-103
// (Run A-12); formatting is tolerant — '3+40', 'STA 3+40', and '340' all hit.

import { Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { StationMatch } from './stationIndex';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  match: StationMatch | null;
  activeSheetId: string;
  onJump: (sheetId: string) => void;
}

export function SearchBox({ query, onQueryChange, match, activeSheetId, onJump }: Props) {
  const trimmed = query.trim();
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find station — e.g. STA 3+40"
          aria-label="Station search"
          className="w-56 rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 font-mono text-xs text-ink placeholder:font-sans placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
      </div>
      {trimmed && !match ? (
        <span className="text-[11px] text-ink-3">No match in station index (mock)</span>
      ) : null}
      {match && match.sheetId === activeSheetId ? (
        <span className="font-mono text-[11px] font-semibold text-accent-strong">{match.code}</span>
      ) : null}
      {match && match.sheetId !== activeSheetId ? (
        <Button size="sm" variant="secondary" onClick={() => onJump(match.sheetId)}>
          Found on {match.sheetCode} — jump
        </Button>
      ) : null}
    </div>
  );
}
