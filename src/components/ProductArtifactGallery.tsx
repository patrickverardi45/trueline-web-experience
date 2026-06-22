'use client';

// Read-only product redline-artifact gallery. In product mode it lists the configured job's
// manifest-backed FINAL_REDLINE_PNG artifacts, then fetches each PNG's bytes WITH the product identity
// headers (a plain <img src> cannot send headers) and renders them via object URLs. It NEVER shows a
// placeholder / mock / offline-fixture image: in offline/demo mode it renders nothing; on a failed read
// it shows an honest "unavailable" state. Object URLs are revoked on unmount and before replacement.

import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';

import {
  productApiEnabled,
  fetchProductArtifacts,
  fetchProductArtifactBlob,
  type ProductArtifactRef,
} from '@/lib/api/liveV2Product';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

interface LoadedArtifact {
  readonly ref: ProductArtifactRef;
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

export function ProductArtifactGallery() {
  const [state, setState] = useState<GalleryState>(() =>
    productApiEnabled() ? { phase: 'loading' } : { phase: 'off' },
  );

  useEffect(() => {
    if (!productApiEnabled()) return;
    let active = true;
    const created: string[] = [];

    (async () => {
      const refs = await fetchProductArtifacts();
      if (refs.length === 0) {
        if (active) setState({ phase: 'empty' });
        return;
      }
      const blobs = await Promise.all(refs.map((ref) => fetchProductArtifactBlob(ref.path)));
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

  if (state.phase === 'off') return null;

  return (
    <div className="mt-8">
      <h3 className="font-semibold text-ink">Final redline artifacts (live)</h3>
      {state.phase === 'loading' && (
        <p className="mt-2 text-sm text-ink-3">Loading real redline PNGs from the v2 product API…</p>
      )}
      {state.phase === 'error' && (
        <p className="mt-2 text-sm text-ink-3">
          Redline artifacts unavailable — check the v2 product API connection / configuration
          (NEXT_PUBLIC_TL2_*). No placeholder image is shown rather than mock data. ({state.message})
        </p>
      )}
      {state.phase === 'empty' && (
        <div className="mt-3">
          <EmptyState icon={ImageIcon} title="No final redline artifacts for this job yet" />
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
                alt={`Final redline PNG ${fileTail(item.ref.path)}`}
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
  );
}
