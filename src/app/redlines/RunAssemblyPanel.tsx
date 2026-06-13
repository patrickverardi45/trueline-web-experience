import { Lock } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import type {
  RunAssemblyCard,
  RunAssemblyContinuationClass,
  RunAssemblyReview,
} from '@/lib/api/adapters/v2RunAssembly';

const GROUP_ORDER: RunAssemblyContinuationClass[] = [
  'RUN_CONTINUATION_CANDIDATE',
  'JUNCTION_DROP_BRANCH',
];

const GROUP_LABEL: Record<RunAssemblyContinuationClass, string> = {
  RUN_CONTINUATION_CANDIDATE: 'Candidate continuation',
  JUNCTION_DROP_BRANCH: 'Fiber-drop lateral',
};

const GROUP_SUBLABEL: Record<RunAssemblyContinuationClass, string> = {
  RUN_CONTINUATION_CANDIDATE:
    'A bore departs the shared terminal — a candidate run continuation. The reviewer decides; nothing is placed.',
  JUNCTION_DROP_BRANCH:
    'A fiber-drop lateral OFF the terminus — NOT the trunk continuing (the departing source prints a drop marker).',
};

function chipClasses(continuation: RunAssemblyContinuationClass): string {
  return continuation === 'RUN_CONTINUATION_CANDIDATE'
    ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
    : 'bg-slate-100 text-slate-600 ring-slate-500/20';
}

function stationLine(card: RunAssemblyCard): string | null {
  const ends = [card.endStation, card.startStation].filter(Boolean);
  if (ends.length === 0) return null;
  return ends.join(' / ');
}

function RunAssemblyCardView({ card }: { card: RunAssemblyCard }) {
  const station = stationLine(card);
  return (
    <article className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,34,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold text-ink">
            {card.endBore} END → {card.startBore} START
          </div>
          <div className="mt-0.5 font-mono text-xs text-ink-3">
            terminal AP-{card.terminalAp}
            {card.spliceLoc ? <span className="text-ink-3"> · {card.spliceLoc}</span> : null}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${chipClasses(card.continuationClass)}`}>
          {GROUP_LABEL[card.continuationClass]}
        </span>
      </div>

      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-3">Truth label</dt>
          <dd className="mt-0.5 font-mono text-amber-700">{card.label}</dd>
        </div>
        {station ? (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-3">Shared terminal station</dt>
            <dd className="mt-0.5 font-mono text-ink-2">{station}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-3">Departure run class</dt>
          <dd className="mt-0.5 font-mono text-ink-2">
            {card.departureRunClass}
            <span className="text-ink-3"> · competing departures {card.competingDepartures}</span>
          </dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-3">Evidence</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-2">{card.detail}</dd>
        </div>
      </dl>
    </article>
  );
}

export function RunAssemblyPanel({ review }: { review: RunAssemblyReview }) {
  const groups = GROUP_ORDER.map((continuation) => ({
    continuation,
    cards: review.cards.filter((card) => card.continuationClass === continuation),
  })).filter((group) => group.cards.length > 0);

  return (
    <section className="mt-8" aria-labelledby="v2-run-assembly-heading">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="v2-run-assembly-heading" className="text-lg font-semibold text-ink">
                v2 run-assembly review cards
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                Read only
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-3">
              Bore-to-bore junctions where one bore&apos;s END terminus is the terminal another bore
              departs. Every card is a SUGGESTION_NOT_PLACEMENT review item: no geometry, no automatic
              placement, no write-back. The reviewer classifies the continuation; the engine places
              nothing here.
            </p>
          </div>
          <div className="text-right text-xs text-ink-3">
            <div>{review.cards.length} junction cards</div>
            <div className="mt-1 font-mono">source {review.sourceGitHead.slice(0, 7)}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {groups.map(({ continuation, cards }) => (
            <span
              key={continuation}
              className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-2 ring-1 ring-inset ring-line">
              {GROUP_LABEL[continuation]}{' '}
              <span className="font-semibold text-ink">{cards.length}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-3">
          <Lock className="size-3.5 shrink-0" />
          Read-only evidence surface. These run-assembly cards carry no geometry and cannot be
          approved, placed, or changed here.
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {groups.map(({ continuation, cards }) => (
          <details
            key={continuation}
            className="overflow-hidden rounded-xl border border-line bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas/60">
              <span>
                {GROUP_LABEL[continuation]}{' '}
                <span className="font-mono text-xs text-ink-3">{continuation}</span>
              </span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-2">
                {cards.length}
              </span>
            </summary>
            <div className="border-t border-line bg-canvas/40 p-3">
              <p className="mb-3 text-xs leading-relaxed text-ink-3">{GROUP_SUBLABEL[continuation]}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {cards.map((card) => (
                  <RunAssemblyCardView key={`${card.endBore}-${card.startBore}`} card={card} />
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
