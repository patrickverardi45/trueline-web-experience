// Pure pricing math + money formatting for the closeout/pricing table (v1-parity live pricing).
// No deps, no runtime imports (unit-checkable under plain Node). The UI computes price LIVE from the
// server's footage quantity and the per-foot rate through these helpers, so the markup stays free of math.
//
// HONESTY: footage is NEVER fabricated here — when the server has no measured footage the base/final totals
// stay `null` and the UI shows a missing-footage state (never a fake "$0" success). The per-foot rate lives
// in ONE place (STAGING_RATE_PER_FT) so no component hardcodes it.

/** The staging/product per-foot rate ($/ft). Single source of truth — components import this, never a literal. */
export const STAGING_RATE_PER_FT = 15;

/** Parse a user/server-supplied numeric value to a finite, NON-NEGATIVE number; `null` on empty / invalid /
 *  negative. Never throws, never coerces a bad value into 0 — a null propagates to an honest missing state. */
export function parseNonNegative(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === 'number' ? value : String(value).trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export interface PriceBreakdown {
  readonly footageFt: number | null;    // parsed footage; null when unavailable / invalid / negative
  readonly ratePerFt: number | null;    // parsed rate; null when blank / invalid / negative
  readonly baseTotal: number | null;    // footage × rate; null when EITHER input is missing (never faked to 0)
  readonly exceptionTotal: number;      // Σ valid exception amounts (0 when none)
  readonly finalTotal: number | null;   // base + exceptions; null when base is null
  readonly footageAvailable: boolean;   // footage parsed to a real number?
}

/** Live pricing: `baseTotal = footage × rate`, plus any valid exception amounts. When footage (or rate) is
 *  missing/invalid the base + final totals are `null` — the caller renders a missing-footage state, NOT $0. */
export function computePricing(
  footage: string | number | null | undefined,
  rate: string | number | null | undefined,
  exceptionAmounts: readonly (string | number | null | undefined)[] = [],
): PriceBreakdown {
  const footageFt = parseNonNegative(footage);
  const ratePerFt = parseNonNegative(rate);
  // A billable footage is strictly > 0: 0 ft means no measured length (e.g. a generic render with no drawn
  // footage), so it is treated as MISSING (base/final stay null) — never a fabricated "$0" price.
  const footageAvailable = footageFt !== null && footageFt > 0;
  const exceptionTotal = exceptionAmounts.reduce<number>((sum, a) => sum + (parseNonNegative(a) ?? 0), 0);
  const baseTotal = footageFt !== null && footageFt > 0 && ratePerFt !== null ? footageFt * ratePerFt : null;
  const finalTotal = baseTotal !== null ? baseTotal + exceptionTotal : null;
  return { footageFt, ratePerFt, baseTotal, exceptionTotal, finalTotal, footageAvailable };
}

export type FootageSource = 'DRAWN' | 'SOURCE_SPAN';

export interface BillableFootage {
  readonly footageFt: number | null;        // positive billable footage, or null when none is available
  readonly source: FootageSource | null;    // where it came from (null when no billable footage)
}

/** Choose the billable footage for pricing: prefer a MEASURED drawn length (> 0) from the redline manifest;
 *  else fall back to the SOURCE-CONFIRMED span footage (the planned bore length) when present — clearly a
 *  source-span estimate, not a measured length. Returns null (no source) when neither is a positive number,
 *  so the caller shows a missing-footage state, never a fabricated "$0". */
export function resolveBillableFootage(
  drawnFootage: string | number | null | undefined,
  sourceSpanFootage: number | null | undefined,
): BillableFootage {
  const drawn = parseNonNegative(drawnFootage);
  if (drawn !== null && drawn > 0) return { footageFt: drawn, source: 'DRAWN' };
  const span = parseNonNegative(sourceSpanFootage);
  if (span !== null && span > 0) return { footageFt: span, source: 'SOURCE_SPAN' };
  return { footageFt: null, source: null };
}

/** Format a dollar amount as USD (`$2,250.00`, thousands-separated). A `null` amount → the honest em-dash —
 *  never "$0" for a missing value. */
export function formatUSD(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/** Format a footage quantity (`1,234 ft` / `1,234.5 ft`); null → the honest missing label. */
export function formatFootage(footageFt: number | null): string {
  if (footageFt === null) return 'not available yet';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(footageFt)} ft`;
}
