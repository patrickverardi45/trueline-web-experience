'use client';

// Read-only uploaded PLAN_PDF page viewer with click-to-mark route capture. Fetches ONE page's PNG raster
// WITH the product identity headers (a plain <img src> cannot send headers), renders it via an object URL,
// and overlays an SVG of the marked control points + connecting path. A click is converted from screen
// pixels to PDF DISPLAY-space using the page bounds from the metadata route, so the captured geometry lives
// in the same coordinate space the renderer will draw in. It draws NO redline artifact — the dashed overlay
// is a live preview of the human-marked route, not a rendered/placed redline.
//
// The plan sheet is dense, so the inline preview is small. An "Enlarge to mark" control opens a fullscreen
// modal with zoom (1x–5x of fit-width) + scroll-to-pan; clicking marks points at the SAME accuracy as inline
// because the screen->display-space mapping is resolution-independent (it uses the rendered bounding rect).

import { useEffect, useRef, useState } from 'react';

import { fetchPlanPageRasterBlob, type ControlPointInput, type PlanPageBounds } from '@/lib/api/productWrites';

interface PlanPageViewerProps {
  readonly jobId: string;
  readonly planUploadId: string;
  readonly pageNumber: number;
  readonly bounds: PlanPageBounds;                 // PDF display-space bounds of this page
  readonly points: readonly ControlPointInput[];   // marked points, in display-space
  readonly onAddPoint: (point: ControlPointInput) => void;
  readonly onUndo?: () => void;                    // optional: undo last point (offered inside the modal)
  readonly onClear?: () => void;                   // optional: clear all points (offered inside the modal)
  readonly pageLabel?: string;                     // e.g. "Sheet 7 OF 30 · PDF page 20 of 43" (evidence)
}

type Raster =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; url: string };

export function PlanPageViewer({
  jobId, planUploadId, pageNumber, bounds, points, onAddPoint, onUndo, onClear, pageLabel,
}: PlanPageViewerProps) {
  const [raster, setRaster] = useState<Raster>({ phase: 'loading' });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [zoom, setZoom] = useState(1); // multiple of fit-to-modal-width (1 = fit, up to 5x)
  const inlineImg = useRef<HTMLImageElement | null>(null);
  const modalImg = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Close the modal on Escape.
  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEnlarged(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enlarged]);

  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;

  // Map a click on a rendered <img> to PDF display-space. Resolution/scale-independent: uses the element's
  // on-screen bounding rect, so it is accurate at any zoom or rendered size.
  function clickToPoint(e: React.MouseEvent<HTMLImageElement>, img: HTMLImageElement | null) {
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

  const overlay = natural ? (
    <svg
      viewBox={`0 0 ${natural.w} ${natural.h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full">
      {pxPoints.length >= 2 && (
        <polyline points={polyline} fill="none" stroke="#dc1919" strokeWidth={w * 2}
                  strokeDasharray={`${r * 1.5} ${r}`} />
      )}
      {pxPoints.map((p, i) => (
        <circle key={i} cx={p.px} cy={p.py} r={r}
                fill={i === 0 ? '#16a34a' : i === pxPoints.length - 1 ? '#dc1919' : '#ffffff'}
                stroke="#dc1919" strokeWidth={w} />
      ))}
    </svg>
  ) : null;

  return (
    <div className="mt-2">
      <div className="relative inline-block max-w-full">
        {/* Blob object URL — plain <img>, never next/image (which cannot optimize blob: URLs). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={inlineImg}
          src={raster.url}
          alt={`Uploaded plan page ${pageNumber}`}
          onClick={(e) => clickToPoint(e, inlineImg.current)}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="block w-full max-w-3xl cursor-crosshair rounded-lg border border-line bg-white"
        />
        {overlay}
      </div>
      <div className="mt-1.5">
        <button
          onClick={() => { setZoom(1); setEnlarged(true); }}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:text-ink">
          <span aria-hidden>⤢</span> Enlarge to mark — the plan is dense; zoom in to place points accurately
        </button>
      </div>

      {enlarged && natural && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70" role="dialog" aria-modal="true">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2 text-sm">
            <span className="font-semibold text-ink">Mark the bore route</span>
            {pageLabel && <span className="text-ink-3">{pageLabel}</span>}
            <span className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 10) / 10))}
                      className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink">−</button>
              <span className="w-12 text-center font-mono text-xs text-ink-2">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(5, Math.round((z + 0.5) * 10) / 10))}
                      className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink">+</button>
              <button onClick={() => setZoom(1)}
                      className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-ink">Fit</button>
            </span>
            <span className="text-xs text-ink-3">{points.length} point(s)</span>
            <button onClick={() => onUndo?.()} disabled={!onUndo || points.length === 0}
                    className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-ink disabled:opacity-50">Undo</button>
            <button onClick={() => onClear?.()} disabled={!onClear || points.length === 0}
                    className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-ink disabled:opacity-50">Clear</button>
            <button onClick={() => setEnlarged(false)}
                    className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-strong">Done</button>
          </div>
          {/* scroll-to-pan canvas; the image is sized as a multiple of the container width (zoom) */}
          <div className="flex-1 overflow-auto bg-neutral-200 p-4">
            <div className="relative mx-auto" style={{ width: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={modalImg}
                src={raster.url}
                alt={`Uploaded plan page ${pageNumber} (enlarged)`}
                onClick={(e) => clickToPoint(e, modalImg.current)}
                className="block w-full cursor-crosshair rounded bg-white shadow-lg"
              />
              {overlay}
            </div>
          </div>
          <div className="border-t border-line bg-white px-4 py-2 text-xs text-ink-3">
            Click the bore route: first click = start, last = end, middle clicks = bends. Zoom in for accuracy;
            scroll to pan. Click <span className="font-semibold">Done</span> when finished, then confirm + render below.
          </div>
        </div>
      )}
    </div>
  );
}
