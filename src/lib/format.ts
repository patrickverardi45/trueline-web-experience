// All field data is anchored to the project's field timezone so SSR and the
// browser render identical strings (no hydration drift) and times read as
// the crew experienced them.
const FIELD_TZ = 'America/Chicago';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function ft(n: number): string {
  return `${n.toLocaleString('en-US')} ft`;
}

/** Fraction complete, clamped to [0, 1]. */
export function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, part / total));
}

export function pctLabel(part: number, total: number): string {
  return `${Math.round(pct(part, total) * 100)}%`;
}

export function shortDate(iso: string): string {
  // Date-only strings parse as UTC midnight — format them in UTC so they
  // never shift a day in the viewer's timezone.
  if (DATE_ONLY.test(iso)) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: FIELD_TZ,
  });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: FIELD_TZ,
  });
}

export function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: FIELD_TZ,
  });
}
