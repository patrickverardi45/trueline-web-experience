// Station tick + search helpers for the mock plan viewer. The only sheet with
// a real station index in the fixtures is C-103 (Run A-12); other sheets get
// evenly spaced generic ticks for linework flavor.

import { c103Stations } from '@/lib/api/mock/sheets';

export const C103_SHEET_ID = 'sh-c103';
export const C103_SHEET_CODE = 'C-103';

export interface StationTick {
  code: string;
  x: number;
}

/**
 * Digits-only station normalization so '3+40', 'STA 3+40', and '340' all
 * compare equal. Returns null when the text carries no digits.
 */
export function stationValue(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  return Number(digits);
}

export interface StationMatch {
  code: string;
  x: number;
  sheetId: string;
  sheetCode: string;
}

/** Search the mock station index (C-103 only, by fixture design). */
export function findStation(query: string): StationMatch | null {
  const value = stationValue(query);
  if (value === null) return null;
  const hit = c103Stations.find((s) => stationValue(s.code) === value);
  if (!hit) return null;
  return { code: hit.code, x: hit.x, sheetId: C103_SHEET_ID, sheetCode: C103_SHEET_CODE };
}

/** Tick marks along the alignment: real index for C-103, generic elsewhere. */
export function ticksForSheet(sheetId: string): StationTick[] {
  if (sheetId === C103_SHEET_ID) return c103Stations;
  const ticks: StationTick[] = [];
  for (let i = 0; i <= 8; i++) {
    ticks.push({ code: `STA ${i}+00`, x: 95 + i * 101 });
  }
  return ticks;
}
