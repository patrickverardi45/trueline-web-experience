import { ImageOff, ShieldCheck } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import type { EngineArtifactCard, EngineArtifactManifest } from '@/lib/api';

function GradeBadge({ grade }: { grade: EngineArtifactCard['designGrade'] }) {
  const accepted = grade === 'PASS_ACCEPTED';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
        accepted
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-600 ring-slate-500/20'
      }`}>
      {accepted ? <ShieldCheck className="size-3" /> : null}
      {grade}
    </span>
  );
}

function ArtifactCardView({ card }: { card: EngineArtifactCard }) {
  return (
    <article className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,34,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold text-ink">{card.sourceBoreId}</div>
          <div className="mt-0.5 text-xs text-ink-3">
            Sheets <span className="font-mono text-ink-2">{card.sheets.join(', ')}</span>
            <span className="text-ink-3"> · </span>
            <span className="font-mono text-ink-2">{card.laneStatus}</span>
          </div>
        </div>
        <GradeBadge grade={card.designGrade} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {card.artifacts.map((artifact) => (
          // Availability only: a disabled tile, never an <img>. No request is
          // made; the real image loads on demand in a later, served slice.
          <li
            key={artifact.fileName}
            className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-canvas/60 px-2.5 py-2 text-xs text-ink-3">
            <ImageOff className="size-3.5 shrink-0" aria-label="not served" />
            <span className="truncate font-mono text-ink-2" title={artifact.fileName}>
              {artifact.fileName}
            </span>
            <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              not served
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function EngineArtifactPanel({ manifest }: { manifest: EngineArtifactManifest }) {
  const refCount = manifest.cards.reduce((total, card) => total + card.artifacts.length, 0);

  return (
    <section className="mt-8" aria-labelledby="v2-design-stroke-artifacts-heading">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="v2-design-stroke-artifacts-heading"
                className="text-lg font-semibold text-ink">
                v2 design-stroke proof artifacts
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                Availability only
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-3">
              The {manifest.cards.length} graded-PASS strokes from the engine&rsquo;s REVIEW-only{' '}
              <span className="font-mono">{manifest.lane}</span> lane (separate from the reviewer
              bundle above). This slice shows only which artifacts EXIST — filenames, no images.
              Nothing is fetched; the real crops load on demand once a served path exists.
            </p>
          </div>
          <div className="text-right text-xs text-ink-3">
            <div>
              {manifest.cards.length} cards · {refCount} artifacts
            </div>
            <div className="mt-1 font-mono">served: {String(manifest.served)}</div>
          </div>
        </div>
      </Card>

      <details className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas/60">
          <span>Show artifact availability</span>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-2">{refCount}</span>
        </summary>
        <div className="grid gap-3 border-t border-line bg-canvas/40 p-3 lg:grid-cols-2">
          {manifest.cards.map((card) => (
            <ArtifactCardView key={card.sourceBoreId} card={card} />
          ))}
        </div>
      </details>
    </section>
  );
}
