'use client';

// Read-only uploaded PLAN_PDF page viewer with click-to-mark route capture. Fetches ONE page's PNG raster
// WITH the product identity headers (a plain <img src> cannot send headers), renders it via an object URL,
// and overlays an SVG of the marked control points + connecting path. A click is converted from screen
// pixels to PDF DISPLAY-space using the page bounds from the metadata route, so the captured geometry lives
// in the same coordinate space the renderer (next slice) will draw in. It draws NO redline artifact — the
// dashed overlay is a live preview of the human-marked route, not a rendered/placed redline.

import { useEffect, useRef, useState } from 'react';

import { fetchPlanPageRasterBlob, type ControlPointInput, type PlanPageBounds } from '@/lib/api/productWrites';

interface PlanPageViewerProps {
  readonly jobId: string;
  readonly planUploadId: string;
  readonly pageNumber: number;
  readonly bounds: PlanPageBounds;                 // PDF display-space bounds of this page
  readonly points: readonly ControlPointInput[];   // marked points, in display-space
  readonly onAddPoint: (point: ControlPointInput) => void;
}

type Raster =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; url: string };

export function PlanPageViewer({ jobId, planUploadId, pageNumber, bounds, points, onAddPoint }: PlanPageViewerProps) {
  const [raster, setRaster] = useState<Raster>({ phase: 'loading' });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setRaster({ phase: 'loading' });
    setNatural(null);
    fetchPlanPageRasterBlob(jobId, planUploadId, pageNumber)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setRaster({ phase: 'ready', url });
      })
      .catch((e: unknown) =>
        active && setRaster({ phase: 'error', message: e instanceof Error ? e.message : 'unavailable' }),
      );
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [jobId, planUploadId, pageNumber]);

  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;

  function onClick(e: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current;
    if (!img || spanX <= 0 || spanY <= 0) return;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const fracX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const fracY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onAddPoint({ x: bounds.x0 + fracX * spanX, y: bounds.y0 + fracY * spanY });
  }

  function toPx(p: ControlPointInput): { px: number; py: number } | null {
    if (!natural || spanX <= 0 || spanY <= 0) return null;
    return { px: ((p.x - bounds.x0) / spanX) * natural.w, py: ((p.y - bounds.y0) / spanY) * natural.h };
  }

  if (raster.phase === 'loading') {
    return <p className="mt-2 text-sm text-ink-3">Loading plan page…</p>;
  }
  if (raster.phase === 'error') {
    return (
      <p className="mt-2 text-sm text-ink-3">
        Plan page unavailable — check the v2 product API connection / configuration. No placeholder image is
        shown. ({raster.message})
      </p>
    );
  }

  const pxPoints = points
    .map(toPx)
    .filter((p): p is { px: number; py: number } => p !== null);
  const polyline = pxPoints.map((p) => `${p.px},${p.py}`).join(' ');
  const r = natural ? Math.max(4, natural.w / 160) : 5;
  const w = natural ? Math.max(2, natural.w / 320) : 2;

  return (
    <div className="relative mt-2 inline-block max-w-full">
      {/* Blob object URL — plain <img>, never next/image (which cannot optimize blob: URLs). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={raster.url}
        alt={`Uploaded plan page ${pageNumber}`}
        onClick={onClick}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="block w-full max-w-3xl cursor-crosshair rounded-lg border border-line bg-white"
      />
      {natural && (
        <svg
          viewBox={`0 0 ${natural.w} ${natural.h}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full">
          {pxPoints.length >= 2 && (
            <polyline
              points={polyline}
              fill="none"
              stroke="#dc1919"
              strokeWidth={w * 2}
              strokeDasharray={`${r * 1.5} ${r}`}
            />
          )}
          {pxPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.px}
              cy={p.py}
              r={r}
              fill={i === 0 ? '#16a34a' : i === pxPoints.length - 1 ? '#dc1919' : '#ffffff'}
              stroke="#dc1919"
              strokeWidth={w}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
