'use client';

// Completed-redline SHOWCASE gallery (read-only). Lists + renders the deterministic showcase job's real
// FINAL_REDLINE_PNG artifacts CLIENT-side (header-bearing blob -> object URL, the same pattern the rest of
// the product UI uses), so it works behind the Cloudflare Access gate. It NEVER shows a placeholder /
// invented image: product mode off -> honest note; failed read -> honest "unavailable"; none -> honest empty.
//
// What is shown here is a REPRESENTATIVE slice of the finished deterministic package (the recognized
// showcase corpus). The full deterministic package is larger — that fact is stated honestly below rather
// than fabricated, so nobody mistakes the representative view for the whole bundle.

import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';

import {
  fetchJobArtifacts,
  fetchJobArtifactBlob,
  type JobArtifactRef,
} from '@/lib/api/productWrites';
import { productApiEnabled } from '@/lib/api/liveV2Product';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

// Generic showcase job id (no customer/place/person name). Seeded in the staging product store; its
// recognized-corpus bundle is already published, so its artifacts list without any re-run.
const SHOWCASE_JOB_ID = 'completed-redline-showcase';

// Verified facts about the full committed deterministic package (NOT fabricated — these are the real
// frontier / bundle figures). Stated so the representative view below is never mistaken for the whole.
const FULL_PACKAGE = {
  drawn: 50,
  totalLogs: 58,
  finalPngs: 83,
  renderCommit: 'c19b565',
  frontier: '50/58',
} as const;

interface LoadedArtifact {
  readonly ref: JobArtifactRef;
  readonly objectUrl: string;
}

type GalleryState =
  | { phase: 'off' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'empty' }
  | { phase: 'ready'; items: readonly LoadedArtifact[] };

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fileTail(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function ProductShowcaseGallery() {
  const [state, setState] = useState<GalleryState>(() =>
    productApiEnabled() ? { phase: 'loading' } : { phase: 'off' },
  );

  useEffect(() => {
    if (!productApiEnabled()) return;
    let active = true;
    const created: string[] = [];

    (async () => {
      const refs = await fetchJobArtifacts(SHOWCASE_JOB_ID);
      if (refs.length === 0) {
        if (active) setState({ phase: 'empty' });
        return;
      }
      const blobs = await Promise.all(refs.map((ref) => fetchJobArtifactBlob(SHOWCASE_JOB_ID, ref.path)));
      if (!active) return; // unmounted mid-flight — skip object-URL creation entirely
      const items = refs.map((ref, i) => {
        const objectUrl = URL.createObjectURL(blobs[i]);
        created.push(objectUrl);
        return { ref, objectUrl };
      });
      setState({ phase: 'ready', items });
    })().catch((err: unknown) => {
      if (active) {
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'unavailable' });
      }
    });

    return () => {
      active = false;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, []);

  return (
    <div>
      {/* Honest framing: representative slice + the real full-package facts. */}
      <Card>
        <h3 className="font-semibold text-ink">Representative finished output</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">
          The sheets below are real deterministic redline artifacts — drawn red strokes on the actual plan,
          served straight from the engine bundle (real engine output, never placeholders). They are a
          representative slice of the finished package shown here for a clean, fast view.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ink-3">Drawn redlines</dt>
            <dd className="font-mono text-ink">{FULL_PACKAGE.drawn}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Final PNG artifacts</dt>
            <dd className="font-mono text-ink">{FULL_PACKAGE.finalPngs}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Frontier</dt>
            <dd className="font-mono text-ink">{FULL_PACKAGE.frontier}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Render / source</dt>
            <dd className="font-mono text-ink">{FULL_PACKAGE.renderCommit}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-3">
          The full deterministic package contains {FULL_PACKAGE.drawn} drawn redlines across{' '}
          {FULL_PACKAGE.finalPngs} final redline artifacts ({FULL_PACKAGE.totalLogs} bore logs total). It
          exists in full; this view shows a representative subset.
        </p>
      </Card>

      <div className="mt-6">
        <h3 className="font-semibold text-ink">Finished redline sheets</h3>
        {state.phase === 'off' && (
          <p className="mt-2 text-sm text-ink-3">
            Product mode is off. Set <span className="font-mono">NEXT_PUBLIC_TL2_PRODUCT_API=1</span> plus{' '}
            <span className="font-mono">NEXT_PUBLIC_TL2_API_BASE</span> /{' '}
            <span className="font-mono">NEXT_PUBLIC_TL2_TENANT</span> to view the live artifacts.
          </p>
        )}
        {state.phase === 'loading' && (
          <p className="mt-2 text-sm text-ink-3">Loading real redline PNGs from the engine bundle…</p>
        )}
        {state.phase === 'error' && (
          <p className="mt-2 text-sm text-ink-3">
            Redline artifacts unavailable — check the v2 product API connection / configuration
            (NEXT_PUBLIC_TL2_*). No placeholder image is shown rather than invented data. ({state.message})
          </p>
        )}
        {state.phase === 'empty' && (
          <div className="mt-3">
            <EmptyState icon={ImageIcon} title="No finished redline artifacts published for the showcase job yet" />
          </div>
        )}
        {state.phase === 'ready' && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {state.items.map((item) => (
              <Card key={item.ref.path}>
                {/* Blob object URL — plain <img>, never next/image (which cannot optimize blob: URLs). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.objectUrl}
                  alt={`Finished redline PNG ${fileTail(item.ref.path)}`}
                  className="w-full rounded-lg border border-line bg-white"
                />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-ink-3">Log</dt>
                    <dd className="font-mono text-ink">{item.ref.logId || '—'}</dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="text-ink-3">File</dt>
                    <dd className="truncate font-mono text-ink">{fileTail(item.ref.path)}</dd>
                  </div>
                </dl>
                <p className="mt-1 text-xs text-ink-3">{humanSize(item.ref.bytes)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
