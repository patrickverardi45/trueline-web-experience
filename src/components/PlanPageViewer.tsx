'use client';

// Read-only uploaded PLAN_PDF page viewer with click-to-mark route capture. Fetches ONE page's PNG raster
// WITH the product identity headers (a plain <img src> cannot send headers), renders it via an object URL,
// and overlays an SVG of the marked control points + connecting path. A click is converted from screen
// pixels to PDF DISPLAY-space using the page bounds from the metadata route, so the captured geometry lives
// in the same coordinate space the renderer will draw in. It draws NO redline artifact — the dashed overlay
// is a live preview of the human-marked route, not a rendered/placed redline.
//
// The plan sheet is dense, so the inline preview is small. An "Enlarge to mark" control opens a fullscreen
// modal that fetches an on-demand HIGHER-DPI raster (so station labels stay sharp when magnified), with
// zoom + scroll-or-drag pan + Fit; clicking marks points at the SAME accuracy at any zoom/pan because the
// screen->display-space mapping is resolution-independent (it uses the rendered bounding rect).

import { useEffect, useRef, useState } from 'react';

import {
  fetchPlanPageRasterBlob, manualRoutePointsEnabled, type ControlPointInput, type PlanPageBounds,
} from '@/lib/api/productWrites';

// On-demand higher-DPI raster requested for the fullscreen mark modal so dense station labels stay sharp
// when magnified (the backend clamps this to a safe range; the inline preview keeps the default raster).
const HI_DPI_ZOOM = 4;
// Max CSS magnification of the (already higher-DPI) modal raster.
const MODAL_MAX_ZOOM = 8;

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
  // Ticket W-C (optional, default absent -> no change): a source-backed route proposal's preview polyline,
  // same display-space as `points`. Reuses THIS component's existing click->display-space mapping (toPx) —
  // never a new coordinate transform. Drawn as a dashed line visually distinct from the marked-points
  // overlay (lighter red, wider dash gaps), underneath it so the human's own marks stay on top.
  readonly proposalPoints?: readonly ControlPointInput[];
  // Mission 8 (optional, default absent -> no change): drag-to-MOVE an INTERMEDIATE marked point (never the
  // first/last — start/end re-placement keeps the pre-existing click-to-mark flow untouched). Fired once per
  // completed drag with the point's new display-space coordinate (the exact pointer position — no snapping).
  // Only wired by the caller when manualRoutePointsEnabled() is true; when absent, every circle renders
  // exactly as before (decorative, pointer-events-none).
  readonly onMoveBend?: (index: number, point: ControlPointInput) => void;
  // Mission 8: which intermediate point (by index into `points`) is currently selected for removal, so its
  // circle can be highlighted. `null`/undefined -> no highlight.
  readonly selectedBendIndex?: number | null;
  // Mission 8: fired on a NO-DRAG click of an intermediate circle — toggles that index's selection (the
  // caller shows a "Remove bend" control while selected). Never fired for the first/last circle.
  readonly onSelectBend?: (index: number | null) => void;
}

type Raster =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; url: string };

export function PlanPageViewer({
  jobId, planUploadId, pageNumber, bounds, points, onAddPoint, onUndo, onClear, pageLabel, proposalPoints,
  onMoveBend, selectedBendIndex, onSelectBend,
}: PlanPageViewerProps) {
  // Mission 8: default-OFF runtime gate (manualRoutePointsEnabled()) — with it unset, `bendEditingOn` is
  // always false, so the interactive-circle branch below never renders extra attributes and onPanStart's
  // extra guard never matches anything (no circle ever carries `data-bend-circle`). Byte-identical output.
  const bendEditingOn = manualRoutePointsEnabled() && !!onMoveBend;
  const [raster, setRaster] = useState<Raster>({ phase: 'loading' });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [zoom, setZoom] = useState(1); // multiple of fit-to-modal-width (1 = fit)
  // On-demand higher-DPI raster for the modal (fetched only while enlarged); falls back to the base raster
  // until it is ready, so the modal is never blank.
  const [modalRaster, setModalRaster] = useState<Raster | null>(null);
  const inlineImg = useRef<HTMLImageElement | null>(null);
  const modalImg = useRef<HTMLImageElement | null>(null);
  const panBox = useRef<HTMLDivElement | null>(null);
  // Drag-to-pan bookkeeping (refs, so a drag never re-renders): the active drag origin, and whether the
  // last pointer interaction moved far enough to count as a pan (so the following click does NOT mark).
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const didPan = useRef(false);
  // Mission 8: bend-drag bookkeeping (refs, so a drag never re-renders) — mirrors the pan-drag pattern above
  // (origin + ~3px-threshold "did this become a real drag" flag), but tracks ONE intermediate circle by its
  // points-array index. `didDrag` false at pointer-up means "this was a plain click" (-> selection toggle,
  // never a move); true means a real drag happened (-> onMoveBend fired during the drag, no selection toggle
  // on release, and see onPanStart below for why this never ALSO triggers a pan).
  const bendDrag = useRef<{ index: number; startX: number; startY: number; didDrag: boolean } | null>(null);

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

  // Fetch the higher-DPI raster ONLY while the mark modal is open (on-demand). Revoke on close/unmount.
  useEffect(() => {
    if (!enlarged) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModalRaster(null);
      return;
    }
    let active = true;
    let url: string | null = null;
    setModalRaster({ phase: 'loading' });
    fetchPlanPageRasterBlob(jobId, planUploadId, pageNumber, HI_DPI_ZOOM)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setModalRaster({ phase: 'ready', url });
      })
      .catch((e: unknown) =>
        active && setModalRaster({ phase: 'error', message: e instanceof Error ? e.message : 'unavailable' }),
      );
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [enlarged, jobId, planUploadId, pageNumber]);

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

  // Mission 8: SAME screen->display-space math as clickToPoint above, but keyed off an arbitrary element's
  // own bounding rect rather than a specific `<img>` ref. A bend circle's overlay <svg> is always sized
  // `absolute inset-0 h-full w-full` over whichever image container currently holds it (inline preview OR
  // the enlarged modal — the SAME overlay JSX is mounted in both places), so asking the EVENT'S OWN
  // ancestor <svg> for its rect is correct regardless of which copy received the pointer — never a new/
  // different coordinate transform, just resolved dynamically instead of via a fixed `img` ref.
  function screenToDisplayPoint(clientX: number, clientY: number, rect: DOMRect): ControlPointInput | null {
    if (rect.width <= 0 || rect.height <= 0) return null;
    const fracX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const fracY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x: bounds.x0 + fracX * spanX, y: bounds.y0 + fracY * spanY };
  }

  // Mission 8: pointer handlers for an INTERMEDIATE circle (never wired for the first/last point). Pointer
  // events (not mouse-only) so mouse + touch share one path, per the touch-action:none circle style below.
  function onBendPointerDown(e: React.PointerEvent<SVGCircleElement>, index: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    bendDrag.current = { index, startX: e.clientX, startY: e.clientY, didDrag: false };
  }
  function onBendPointerMove(e: React.PointerEvent<SVGCircleElement>, index: number) {
    const d = bendDrag.current;
    if (!d || d.index !== index) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.didDrag = true;
    if (!d.didDrag) return; // below threshold — not yet a real drag (mirrors didPan's 3px threshold)
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg?.getBoundingClientRect();
    if (!rect) return;
    const pt = screenToDisplayPoint(e.clientX, e.clientY, rect);
    if (pt) onMoveBend?.(index, pt);
  }
  function onBendPointerUp(e: React.PointerEvent<SVGCircleElement>, index: number) {
    const d = bendDrag.current;
    bendDrag.current = null;
    if (!d || d.index !== index) return;
    if (!d.didDrag) {
      // A plain click (no drag past the threshold) toggles this bend's selection — never a move, never an
      // endpoint replacement, never click-through to the image below (this event never reaches the <img>;
      // it targets the circle, a sibling element, not an ancestor/descendant of the image).
      onSelectBend?.(selectedBendIndex === index ? null : index);
    }
  }
  // Fix-wave-1 F4: pointercancel (e.g. an interrupted touch gesture — a system gesture takes over, the
  // pointer leaves the viewport) must ABORT the interaction, never complete it. Wiring this to
  // onBendPointerUp would toggle selection on a cancelled non-drag tap, which is not a real click. Dedicated
  // handler: reset the drag ref only, no onSelectBend/onMoveBend call.
  function onBendPointerCancel(_e: React.PointerEvent<SVGCircleElement>, index: number) {
    const d = bendDrag.current;
    if (d && d.index === index) bendDrag.current = null;
  }

  // Drag-to-pan the enlarged canvas (in addition to native scroll). A drag past a small threshold sets
  // ``didPan`` so the trailing click does NOT mark a point — click-to-mark accuracy is unaffected.
  function onPanStart(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0 || !panBox.current) return;
    // Mission 8: a mouse interaction that started on an interactive bend circle (data-bend-circle) is a
    // bend drag, never a pan — bend circles only ever carry this attribute when bendEditingOn, so this
    // guard is a no-op (never matches) whenever the flag is off.
    if ((e.target as Element).closest?.('[data-bend-circle]')) return;
    didPan.current = false;
    drag.current = { x: e.clientX, y: e.clientY, left: panBox.current.scrollLeft, top: panBox.current.scrollTop };
  }
  function onPanMove(e: React.MouseEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !panBox.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
    panBox.current.scrollLeft = d.left - dx;
    panBox.current.scrollTop = d.top - dy;
  }
  function endPan() {
    drag.current = null;
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

  // Ticket W-C: optional route-proposal preview, mapped through the SAME toPx (display-space -> natural
  // pixels) used for the marked points above — no new coordinate transform.
  const proposalPxPoints = (proposalPoints ?? [])
    .map(toPx)
    .filter((p): p is { px: number; py: number } => p !== null);
  const proposalPolyline = proposalPxPoints.map((p) => `${p.px},${p.py}`).join(' ');

  const overlay = natural ? (
    <svg
      viewBox={`0 0 ${natural.w} ${natural.h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full">
      {/* Route-proposal preview — drawn first (underneath) so the human's own marks stay visually on top.
          Same red family as the marked-points overlay but a distinctly lighter tone + wider dash gaps, so
          the two are never confused for each other. */}
      {proposalPxPoints.length >= 2 && (
        <polyline points={proposalPolyline} fill="none" stroke="#f0847e" strokeOpacity={0.9}
                  strokeWidth={w * 1.5} strokeDasharray={`${r} ${r * 2.2}`} />
      )}
      {pxPoints.length >= 2 && (
        <polyline points={polyline} fill="none" stroke="#dc1919" strokeWidth={w * 2}
                  strokeDasharray={`${r * 1.5} ${r}`} />
      )}
      {pxPoints.map((p, i) => {
        // Mission 8: ONLY an intermediate point (never first/last — start/end re-placement keeps the
        // pre-existing click-to-mark flow untouched) is interactive, and only while bendEditingOn.
        const isIntermediate = i > 0 && i < pxPoints.length - 1;
        const interactive = bendEditingOn && isIntermediate;
        const selected = interactive && selectedBendIndex === i;
        return (
          <circle
            key={i} cx={p.px} cy={p.py} r={selected ? r * 1.4 : r}
            fill={i === 0 ? '#16a34a' : i === pxPoints.length - 1 ? '#dc1919' : selected ? '#fde68a' : '#ffffff'}
            stroke="#dc1919" strokeWidth={selected ? w * 1.5 : w}
            {...(interactive ? {
              'data-bend-circle': 'true',
              style: { pointerEvents: 'auto' as const, touchAction: 'none' as const, cursor: 'grab' as const },
              onPointerDown: (e: React.PointerEvent<SVGCircleElement>) => onBendPointerDown(e, i),
              onPointerMove: (e: React.PointerEvent<SVGCircleElement>) => onBendPointerMove(e, i),
              onPointerUp: (e: React.PointerEvent<SVGCircleElement>) => onBendPointerUp(e, i),
              onPointerCancel: (e: React.PointerEvent<SVGCircleElement>) => onBendPointerCancel(e, i),
            } : {})}
          />
        );
      })}
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
              <button onClick={() => setZoom((z) => Math.min(MODAL_MAX_ZOOM, Math.round((z + 0.5) * 10) / 10))}
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
          {/* scroll- or drag-to-pan canvas; the image is sized as a multiple of the container width (zoom).
              The modal shows the on-demand higher-DPI raster once ready, falling back to the base raster. */}
          <div
            ref={panBox}
            onMouseDown={onPanStart}
            onMouseMove={onPanMove}
            onMouseUp={endPan}
            onMouseLeave={endPan}
            className="flex-1 cursor-grab overflow-auto bg-neutral-200 p-4">
            <div className="relative mx-auto" style={{ width: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={modalImg}
                src={modalRaster && modalRaster.phase === 'ready' ? modalRaster.url : raster.url}
                alt={`Uploaded plan page ${pageNumber} (enlarged)`}
                onClick={(e) => {
                  if (didPan.current) { didPan.current = false; return; } // a drag-pan is not a mark
                  clickToPoint(e, modalImg.current);
                }}
                draggable={false}
                className="block w-full cursor-crosshair rounded bg-white shadow-lg"
              />
              {overlay}
            </div>
          </div>
          <div className="border-t border-line bg-white px-4 py-2 text-xs text-ink-3">
            Click the bore route: first click = start, last = end, middle clicks = bends. Zoom in for accuracy;
            scroll or drag to pan. Click <span className="font-semibold">Done</span> when finished, then confirm + render below.
            {modalRaster?.phase === 'loading' && <span className="ml-1 text-ink-2">Loading a sharper view…</span>}
          </div>
        </div>
      )}
    </div>
  );
}
