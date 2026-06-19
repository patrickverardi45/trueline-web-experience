'use client';

import { useState } from 'react';
import { ImageOff, ShieldCheck } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import type { RedlineArtifactRef, RedlineLogEntry, RedlineManifestView } from '@/lib/api';

function ArtifactItem({ artifact, open }: { artifact: RedlineArtifactRef; open: boolean }) {
  // Load the image ONLY once served AND the panel is expanded (mirrors EngineArtifactPanel):
  // collapsed/availability refs never render an <img>, so the browser issues no request.
  if (artifact.served && artifact.url && open) {
    return (
      <li className="overflow-hidden rounded-lg border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- static, gitignored, lazy proof artifact; next/image optimization is inappropriate here */}
        <img
          src={artifact.url}
          alt={`Final redline stroke ${artifact.fileName}`}
          loading="lazy"
          decoding="async"
          className="block w-full bg-canvas"
        />
        <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-ink-3">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" aria-label="served" />
          <span className="truncate font-mono text-ink-2" title={artifact.manifestPath}>
            {artifact.fileName}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            served
          </span>
        </div>
      </li>
    );
  }

  const servedPending = artifact.served;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-canvas/60 px-2.5 py-2 text-xs text-ink-3">
      <ImageOff className="size-3.5 shrink-0" aria-label={servedPending ? 'loads on expand' : 'not exported'} />
      <span className="truncate font-mono text-ink-2" title={artifact.manifestPath}>
        {artifact.fileName}
      </span>
      <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        {servedPending ? 'loads on expand' : 'not exported'}
      </span>
    </li>
  );
}

function LogCardView({ log, open }: { log: RedlineLogEntry; open: boolean }) {
  return (
    <article className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,34,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold text-ink">{log.logId}</div>
          <div className="mt-0.5 text-xs text-ink-3">
            Sheets <span className="font-mono text-ink-2">{log.sourceSheets.join(', ')}</span>
            <span className="text-ink-3"> · </span>
            <span className="font-mono text-ink-2">{log.span.label}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
          {log.provenance === 'OWNER_CONFIRMED_HUMAN_ADJUSTABLE' ? 'owner · human-adjustable' : 'deterministic auto'}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {log.artifacts.map((artifact) => (
          <ArtifactItem key={artifact.manifestPath} artifact={artifact} open={open} />
        ))}
      </ul>
    </article>
  );
}

export function RedlineManifestPanel({ view }: { view: RedlineManifestView }) {
  const [open, setOpen] = useState(false);
  const { served, totals } = view;

  return (
    <section className="mt-8" aria-labelledby="v2-redline-manifest-heading">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="v2-redline-manifest-heading" className="text-lg font-semibold text-ink">
                v2 redline manifest (durable bundle)
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                {view.frontier}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                {served ? 'Served · lazy' : 'Availability only'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-3">
              Real durable redline manifest from the engine bundle store (read-only,{' '}
              <span className="font-mono">mock_example: false</span>). {totals.drawn} drawn ·{' '}
              {totals.covered} covered · {totals.blocked} blocked of {totals.total} logs.{' '}
              {served
                ? 'Final redline stroke images are served as static assets and load on demand only when you expand this panel.'
                : 'Image export not present — filenames only. Run npm run export:redline-bundle (then set NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED=1) to view strokes.'}
            </p>
          </div>
          <div className="text-right text-xs text-ink-3">
            <div className="font-mono">{view.bundleId}</div>
            <div className="mt-1">
              render <span className="font-mono">{view.renderCommit}</span>
            </div>
            <div className="mt-1">
              {view.artifactCount} FINAL_REDLINE_PNG · <span className="font-mono">served: {String(served)}</span>
            </div>
          </div>
        </div>
      </Card>

      <details
        className="mt-4 overflow-hidden rounded-xl border border-line bg-white"
        onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas/60">
          <span>{served ? 'Show drawn redlines (loads images)' : 'Show drawn redlines (filenames)'}</span>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-2">{view.drawnLogs.length}</span>
        </summary>
        <div className="grid gap-3 border-t border-line bg-canvas/40 p-3 lg:grid-cols-2">
          {view.drawnLogs.map((log) => (
            <LogCardView key={log.logId} log={log} open={open} />
          ))}
        </div>
      </details>
    </section>
  );
}
