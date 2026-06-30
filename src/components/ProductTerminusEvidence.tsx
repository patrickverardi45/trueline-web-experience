'use client';

// G3 — terminus evidence (DISPLAY-only observer). Shows the source-backed evidence for a bore's START and END:
// is each endpoint proven by a printed structure note on the plan, or only known from the bore-log row? It is
// purely informational — it does NOT place, change, or imply an automatic (AUTO) redline, captures no clicks,
// renders no plan raster, and writes nothing. It reads the backend's read-only /terminus-evidence endpoint.

import { useCallback, useEffect, useState } from 'react';

import { fetchTerminusEvidence, type TerminusEndpointView, type TerminusEvidenceView } from '@/lib/api/productWrites';

// Plain-English copy for the source TYPE. BORE_LOG_ROW is deliberately framed as "value only" — it is NOT a
// source-bound (AUTO-eligible) proof.
const SOURCE_TYPE_COPY: Record<string, string> = {
  PRINTED_STRUCTURE_LABEL: 'Printed structure note on the plan',
  PRINTED_STA_CALLOUT: 'Printed station callout on the plan',
  MATCHLINE_BOUNDARY_STATION: 'Matchline boundary equation',
  BORE_LOG_ROW: 'Bore-log row (station value only)',
  KMZ_ROUTE_VERTEX: 'GIS route vertex',
  INFERRED_FROM_GEOMETRY: 'Inferred from geometry',
  ABSENT: 'No value found',
};

// Plain-English copy for a missing-evidence blocker on an endpoint. The raw code stays available for traceability.
const TERMINUS_BLOCKER_COPY: Record<string, string> = {
  NO_PRINTED_START_STRUCTURE:
    'No printed structure note marks the start on the plan — the start is known only from the bore-log row.',
  NO_PRINTED_END_STRUCTURE:
    'No printed structure note marks the end on the plan — the end is known only from the bore-log row.',
  AMBIGUOUS_START_STRUCTURE:
    'More than one printed structure note shares the start station — the start is ambiguous.',
  AMBIGUOUS_END_STRUCTURE: 'More than one printed structure note shares the end station — the end is ambiguous.',
  NO_BORE_LOG_STATION: 'The bore-log row carries no station for this endpoint.',
};

function sourceTypeCopy(code: string): string {
  return SOURCE_TYPE_COPY[code] ?? code;
}

/** One source-backed info field. A null/empty value renders an honest, muted "not available" — never an
 *  invented placeholder. */
function InfoField({ label, value }: { label: string; value: string | null }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd
        className={missing ? 'truncate text-xs italic text-ink-3' : 'truncate text-sm text-ink'}
        title={missing ? 'not available' : value}>
        {missing ? 'not available' : value}
      </dd>
    </div>
  );
}

/** One endpoint (START / END) row: an honest source badge + the source-read fields + the named blocker when
 *  the endpoint is not printed-proven. Never frames any endpoint as AUTO-eligible. */
function EndpointRow({ endpoint }: { endpoint: TerminusEndpointView }) {
  const bound = endpoint.sourceBound;
  return (
    <div className="rounded-md border border-line bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
          {endpoint.which === 'START' ? 'Start' : endpoint.which === 'END' ? 'End' : endpoint.which}
        </span>
        <span
          className={
            bound
              ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800'
              : 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800'
          }>
          {bound ? 'Source-proven (printed)' : 'From bore-log row — not source-proven'}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        <InfoField label="Station (from source)" value={endpoint.stationStr} />
        <InfoField label="Plan sheet" value={endpoint.sheet != null ? String(endpoint.sheet) : null} />
        <InfoField label="Evidence type" value={sourceTypeCopy(endpoint.sourceType)} />
      </dl>

      {/* Printed proof: quote the verbatim note + the structure it names. Confidence here is PRINTED-proof
          confidence, explicitly NOT an automatic-placement promotion. */}
      {bound && endpoint.sourceText && (
        <p className="mt-2 text-xs text-ink-2">
          Printed on the plan:{' '}
          <span className="rounded bg-paper px-1 py-0.5 font-mono text-ink">{endpoint.sourceText}</span>
          {endpoint.confidence != null && (
            <span className="ml-2 text-ink-3">(printed-proof match, not an automatic placement)</span>
          )}
        </p>
      )}

      {/* Not source-proven: name exactly which printed proof is missing, in plain English. */}
      {!bound && endpoint.blocker && (
        <p className="mt-2 text-xs text-amber-800">
          {TERMINUS_BLOCKER_COPY[endpoint.blocker] ?? endpoint.blocker}
        </p>
      )}
    </div>
  );
}

export function ProductTerminusEvidence({
  jobId,
  reviewedBoreLogId,
  refreshKey,
}: {
  jobId: string;
  // Scope the displayed bore to the candidate under review; falls back to the job's first bore when null.
  reviewedBoreLogId?: string | null;
  // Changes when the job's uploads/review change so the panel re-reads the current evidence.
  refreshKey?: string;
}) {
  const [view, setView] = useState<TerminusEvidenceView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await fetchTerminusEvidence(jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unavailable');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Degrade honestly: if the read failed, say so quietly rather than blocking the review.
  if (error) {
    return (
      <div className="mt-2 rounded-md border border-line bg-paper px-3 py-2 text-xs text-ink-3">
        Endpoint source evidence unavailable. ({error})
      </div>
    );
  }
  if (!view) {
    return (
      <div className="mt-2 rounded-md border border-line bg-paper px-3 py-2 text-xs text-ink-3">
        Checking endpoint source evidence…
      </div>
    );
  }

  const entry =
    view.termini.find((t) => reviewedBoreLogId != null && t.reviewedBoreLogId === reviewedBoreLogId) ??
    view.termini[0] ??
    null;

  return (
    <details className="mt-2 rounded-md border border-line bg-paper px-3 py-2" open={entry != null}>
      <summary className="cursor-pointer text-xs font-semibold text-ink-2">
        Endpoint source evidence — what proves the start &amp; end
      </summary>

      <p className="mt-2 text-[11px] text-ink-3">
        Where each endpoint comes from on your plan. This is evidence only — it does not place or change the
        redline.
      </p>

      {entry ? (
        <>
          <div className="mt-2 space-y-2">
            <EndpointRow endpoint={entry.evidence.start} />
            <EndpointRow endpoint={entry.evidence.end} />
          </div>
          {!entry.evidence.bothSourceBound && (
            <p className="mt-2 text-[11px] text-ink-3">
              Endpoints known only from the bore-log row aren’t printed-proven, so this stays a review — not an
              automatic placement.
            </p>
          )}
        </>
      ) : (
        // No bore evidence resolved — surface the report's honest named blockers (plain reasons).
        <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">
          {view.blockers.length > 0 ? (
            view.blockers.map((b) => <li key={b.code}>{b.reason}</li>)
          ) : (
            <li className="italic text-ink-3">No endpoint evidence available yet.</li>
          )}
        </ul>
      )}
    </details>
  );
}
