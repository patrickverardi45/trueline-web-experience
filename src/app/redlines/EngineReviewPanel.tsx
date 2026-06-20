import { Lock } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import type {
  EngineCard,
  EngineLane,
  EngineReviewBundle,
  EngineReviewStatus,
} from '@/lib/api/adapters/v2Bundle';

const LANE_ORDER: EngineLane[] = [
  'PLACED_REVIEW',
  'PICK_CARD_ROUTE_SUGGESTION',
  'HUMAN_ADJUSTABLE_LENGTH_REDLINE',
  'OUT_OF_CLASS',
  'SOURCE_REVIEW_REQUIRED',
  'UNSAFE_ABSTAIN',
];

const LANE_LABEL: Record<EngineLane, string> = {
  PLACED_REVIEW: 'Placed review',
  PICK_CARD_ROUTE_SUGGESTION: 'Route suggestions',
  HUMAN_ADJUSTABLE_LENGTH_REDLINE: 'Adjustable length',
  OUT_OF_CLASS: 'Named solver',
  SOURCE_REVIEW_REQUIRED: 'Source review',
  UNSAFE_ABSTAIN: 'Unsafe abstain',
};

const STATUS_LABEL: Record<EngineReviewStatus, string> = {
  'placement-review': 'Placement proof for review',
  'suggestion-not-placement': 'Suggestion, not placement',
  'adjustment-required': 'Reviewer adjustment required',
  'solver-blocked': 'Blocked for named solver',
  'source-review-required': 'Source correction required',
  'unsafe-abstain': 'Blocked, no safe placement',
};

function feet(value: number | undefined): string | null {
  if (value === undefined) return null;
  return `${value.toLocaleString('en-US')} ft`;
}

function stationLine(card: EngineCard): string | null {
  if (!card.station) return null;
  const endpoints = [card.station.startStation, card.station.endStation].filter(Boolean);
  const footage = feet(card.station.footageFt);
  if (endpoints.length === 0) return footage;
  return `${endpoints.join(' to ')}${footage ? ` (${footage})` : ''}`;
}

function truthClasses(card: EngineCard): string {
  if (card.truthLabel === 'PLACEMENT_FOR_REVIEW') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  }
  if (card.truthLabel === 'SUGGESTION_NOT_PLACEMENT') {
    return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  }
  return 'bg-slate-100 text-slate-600 ring-slate-500/20';
}

function EngineCardView({ card }: { card: EngineCard }) {
  const station = stationLine(card);
  const candidateLabels = [...new Set(card.candidates.map((candidate) => candidate.label))];

  return (
    <article className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,34,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold text-ink">{card.sourceBoreId}</div>
          <div className="mt-0.5 text-xs text-ink-3">
            Run mapping: <span className="font-semibold text-ink-2">{card.runMapping}</span>
            {card.runMapping === 'mapped' ? (
              <>
                {' '}
                <span className="text-ink-3">via local Brenham fixture</span>
                <span className="font-mono text-ink-2"> ({card.runId})</span>
              </>
            ) : null}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${truthClasses(card)}`}>
          {card.truthLabel}
        </span>
      </div>

      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-3">Lane / status</dt>
          <dd className="mt-0.5 text-ink-2">
            <span className="font-mono">{card.lane}</span>
            <span className="text-ink-3"> / </span>
            {STATUS_LABEL[card.reviewStatus]}
          </dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-3">Reason</dt>
          <dd className="mt-0.5 break-words font-mono text-ink-2">{card.reasonCode}</dd>
        </div>
        {card.blockerText ? (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-3">Blocker / next law</dt>
            <dd className="mt-0.5 leading-relaxed text-ink-2">{card.blockerText}</dd>
          </div>
        ) : null}
        {card.confidenceClass ? (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-3">Confidence class</dt>
            <dd className="mt-0.5 font-mono text-ink-2">{card.confidenceClass}</dd>
          </div>
        ) : null}
        {station ? (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-3">Station summary</dt>
            <dd className="mt-0.5 font-mono text-ink-2">{station}</dd>
          </div>
        ) : null}
        {card.sheets.length > 0 ? (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-3">Plan sheets</dt>
            <dd className="mt-0.5 font-mono text-ink-2">{card.sheets.join(', ')}</dd>
          </div>
        ) : null}
        {candidateLabels.length > 0 ? (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-3">
              Candidate truth ({card.candidates.length})
            </dt>
            <dd className="mt-0.5 font-mono text-amber-700">{candidateLabels.join(', ')}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

export function EngineReviewPanel({ bundle }: { bundle: EngineReviewBundle }) {
  const mappedCount = bundle.cards.filter((card) => card.runMapping === 'mapped').length;
  const unmappedCount = bundle.cards.length - mappedCount;
  const groups = LANE_ORDER.map((lane) => ({
    lane,
    cards: bundle.cards.filter((card) => card.lane === lane),
  })).filter((group) => group.cards.length > 0);

  return (
    <section className="mt-8" aria-labelledby="v2-engine-review-heading">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="v2-engine-review-heading" className="text-lg font-semibold text-ink">
                v2 engine reviewer cards
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                Read only
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-3">
              Static M8.11 default baseline export. Run IDs resolve only through exact bore-log
              identity matches in the web-local Brenham PH5 fixture, never against the fictional
              mock review queue above. These staging records are not production customer records.
              No approvals or write-back are enabled.
            </p>
          </div>
          <div className="text-right text-xs text-ink-3">
            <div>{bundle.cards.length} bore cards</div>
            <div className="mt-1">
              {mappedCount} fixture mapped / {unmappedCount} unmapped
            </div>
            <div className="mt-1 font-mono">source {bundle.sourceGitHead.slice(0, 7)}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {groups.map(({ lane, cards }) => (
            <span
              key={lane}
              className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-2 ring-1 ring-inset ring-line">
              {LANE_LABEL[lane]} <span className="font-semibold text-ink">{cards.length}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-3">
          <Lock className="size-3.5 shrink-0" />
          Brenham mappings are read-only identity scaffolds. Existing mock review decisions apply
          only to the mock review queue above; engine cards cannot be approved or changed here.
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {groups.map(({ lane, cards }) => (
          <details key={lane} className="overflow-hidden rounded-xl border border-line bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas/60">
              <span>
                {LANE_LABEL[lane]} <span className="font-mono text-xs text-ink-3">{lane}</span>
              </span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-2">
                {cards.length}
              </span>
            </summary>
            <div className="grid gap-3 border-t border-line bg-canvas/40 p-3 lg:grid-cols-2">
              {cards.map((card) => (
                <EngineCardView key={card.sourceBoreId} card={card} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
