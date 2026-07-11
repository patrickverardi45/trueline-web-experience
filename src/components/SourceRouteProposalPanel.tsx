'use client';

// Ticket W-C: compact panel shown when POST /source-route-proposals returns outcome PROPOSAL. Plain-language
// summary + honest provenance (source sheet/page, why-connected verbatim, each warning as its own sentence)
// ahead of the two explicit choices — adopt the source-backed route, or keep the human-marked straight
// segment. Renders NOTHING automatically: adoption only happens when the human clicks "Use engineering
// route" (which the caller wires to the EXISTING source-anchor create write with route_adoption attached).
// Mounted only behind sourceRouteAdoptionEnabled() by the caller (ProductSourceAnchorCapture).

import type { RouteAdoptionInput, RouteProposalView } from '@/lib/api/productWrites';

interface SourceRouteProposalPanelProps {
  readonly proposal: RouteProposalView;
  // Ticket W-C-ECHO: the full route_adoption echo sourced verbatim from `proposal` by the caller (see
  // routeAdoptionInputFromProposal in productWrites.ts) — null when the held proposal is missing a field the
  // echo needs (older/malformed shape). Adoption is disabled and an honest inline note shown in that case,
  // rather than guessing a value from elsewhere.
  readonly adoption: RouteAdoptionInput | null;
  readonly onAdopt: (adoption: RouteAdoptionInput) => void;
  readonly onDismiss: () => void;
  readonly busy: boolean;
}

export function SourceRouteProposalPanel({
  proposal, adoption, onAdopt, onDismiss, busy,
}: SourceRouteProposalPanelProps) {
  const interiorCount = proposal.candidateRoutePoints.length;
  const hasSource = proposal.source.engineeringSheet != null || proposal.source.pdfPage != null;

  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent-soft p-3 text-xs">
      <p className="text-sm font-semibold text-ink">Engineering route proposed</p>
      <p className="mt-1 text-ink-2">
        Follows the source plan linework between your two marks ({interiorCount} point{interiorCount === 1 ? '' : 's'}).
      </p>

      {(hasSource || proposal.connectivity.whyConnected) && (
        <dl className="mt-2 space-y-1 text-ink-3">
          {hasSource && (
            <div>
              <dt className="inline font-medium text-ink-2">Source: </dt>
              <dd className="inline">
                {proposal.source.engineeringSheet ?? 'sheet unknown'}
                {proposal.source.pdfPage != null ? ` · PDF page ${proposal.source.pdfPage}` : ''}
              </dd>
            </div>
          )}
          {proposal.connectivity.whyConnected && (
            <div>
              <dt className="inline font-medium text-ink-2">Why connected: </dt>
              <dd className="inline">{proposal.connectivity.whyConnected}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Warnings are shown plainly and up front — never buried behind a click. */}
      {proposal.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-700">
          {proposal.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { if (adoption) onAdopt(adoption); }}
          disabled={busy || adoption === null}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Adopting…' : 'Use engineering route'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="rounded-md border border-line px-2.5 py-1.5 font-medium text-ink-2 hover:text-ink disabled:opacity-50">
          Keep straight segment
        </button>
      </div>
      {adoption === null && (
        <p className="mt-1.5 text-red-600">Proposal incomplete — re-search.</p>
      )}
      <p className="mt-1.5 text-ink-3">
        Straight segment (representative) — declining draws a straight line between your two marks instead,
        same as marking without a search.
      </p>
    </div>
  );
}
