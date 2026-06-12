'use client';

import { useState } from 'react';
import { ImageOff, ShieldCheck } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import type { EngineArtifactCard, EngineArtifactManifest, EngineArtifactRef } from '@/lib/api';

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

function ArtifactItem({ artifact, open }: { artifact: EngineArtifactRef; open: boolean }) {
  // Load the image ONLY once the panel is expanded. While collapsed the <img>
  // is never rendered, so the browser issues no request (no preload); when
  // served and open we additionally keep loading="lazy" so off-screen crops
  // defer until scrolled near. Availability-only refs never get an <img>.
  if (artifact.served && artifact.url && open) {
    return (
      <li className="overflow-hidden rounded-lg border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- static, gitignored, lazy proof artifact; next/image optimization is inappropriate here */}
        <img
          src={artifact.url}
          alt={`Design-stroke proof crop ${artifact.fileName}`}
          loading="lazy"
          decoding="async"
          className="block w-full bg-canvas"
        />
        <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-ink-3">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" aria-label="served" />
          <span className="truncate font-mono text-ink-2" title={artifact.fileName}>
            {artifact.fileName}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            served
          </span>
        </div>
      </li>
    );
  }

  // Collapsed, or availability-only: a disabled tile, never an <img>.
  const servedPending = artifact.served;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-canvas/60 px-2.5 py-2 text-xs text-ink-3">
      <ImageOff className="size-3.5 shrink-0" aria-label={servedPending ? 'loads on expand' : 'not served'} />
      <span className="truncate font-mono text-ink-2" title={artifact.fileName}>
        {artifact.fileName}
      </span>
      <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        {servedPending ? 'loads on expand' : 'not served'}
      </span>
    </li>
  );
}

function ArtifactCardView({ card, open }: { card: EngineArtifactCard; open: boolean }) {
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
          <ArtifactItem key={artifact.fileName} artifact={artifact} open={open} />
        ))}
      </ul>
    </article>
  );
}

export function EngineArtifactPanel({ manifest }: { manifest: EngineArtifactManifest }) {
  const [open, setOpen] = useState(false);
  const refCount = manifest.cards.reduce((total, card) => total + card.artifacts.length, 0);
  const served = manifest.served;

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
                {served ? 'Served · lazy' : 'Availability only'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-3">
              The {manifest.cards.length} graded-PASS strokes from the engine&rsquo;s REVIEW-only{' '}
              <span className="font-mono">{manifest.lane}</span> lane (separate from the reviewer
              bundle above).{' '}
              {served
                ? 'The proof crops are served as static assets and load on demand only when you expand this panel — nothing is fetched until then.'
                : 'This slice shows only which artifacts EXIST — filenames, no images. Nothing is fetched.'}
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

      <details
        className="mt-4 overflow-hidden rounded-xl border border-line bg-white"
        onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas/60">
          <span>{served ? 'Show artifacts (loads images)' : 'Show artifact availability'}</span>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-2">{refCount}</span>
        </summary>
        <div className="grid gap-3 border-t border-line bg-canvas/40 p-3 lg:grid-cols-2">
          {manifest.cards.map((card) => (
            <ArtifactCardView key={card.sourceBoreId} card={card} open={open} />
          ))}
        </div>
      </details>
    </section>
  );
}
