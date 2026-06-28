'use client';

// Workspace Map / Route page. Renders REAL route context from the job's uploaded GIS_ROUTE (.kmz/.kml) as a
// self-contained SVG — NO external map tiles, NO library, NO API key, NO geocoding. It draws ONLY coordinates
// the backend parsed from the file (honest empty states otherwise), and never claims a redline map overlay:
// redline geometry is pixel-only and lives on the source PDF pages.
//
// DEFAULT = "Route only": the uploaded route LINE geometry is the primary visual; the dense per-address POINT
// layer is HIDDEN by default (it overwhelms the route and does not help the user). A toggle reveals the source
// points as a debug layer. The underlying data is never dropped — only the default view is decluttered.

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { fetchGisRoute, type GisRouteView } from '@/lib/api/productWrites';

const VIEW_W = 820;
const VIEW_H = 460;
const PAD = 28;

const REASON_COPY: Record<string, string> = {
  NO_GIS_ROUTE_UPLOADED: 'No GIS route (.kmz / .kml) has been uploaded to this job yet.',
  GIS_ROUTE_FILE_MISSING: 'The GIS route upload is registered but its stored file is missing.',
  GIS_ROUTE_NOT_PARSEABLE: 'The uploaded GIS route file could not be read as KMZ/KML.',
  NO_COORDINATES_FOUND: 'The uploaded GIS route file has no WGS84 coordinates to plot.',
};

type Pt = readonly number[]; // [lon, lat]

/** Project [lon,lat] WGS84 onto the SVG box with a cos(lat) longitude correction (true-ish route shape),
 *  fit + centered, north up. Fits to ALL coordinates so the view is stable when the point layer is toggled.
 *  Returns a screen-space mapper or null when there is nothing to draw. */
function makeProjector(features: GisRouteView['features']) {
  const pts: Pt[] = features.flatMap((f) => f.coordinates);
  if (pts.length === 0) return null;
  const meanLat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const k = Math.max(0.05, Math.cos((meanLat * Math.PI) / 180));
  const xs = pts.map((p) => p[0] * k);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const scale = Math.min((VIEW_W - 2 * PAD) / spanX, (VIEW_H - 2 * PAD) / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offX = PAD + (VIEW_W - 2 * PAD - drawnW) / 2;
  const offY = PAD + (VIEW_H - 2 * PAD - drawnH) / 2;
  return (p: Pt): [number, number] => [
    offX + (p[0] * k - minX) * scale,
    offY + (maxY - p[1]) * scale, // flip: north up
  ];
}

export function ProductRouteMap({ jobId, refreshKey }: { jobId: string; refreshKey?: string }) {
  const [view, setView] = useState<GisRouteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPoints, setShowPoints] = useState(false); // default: Route only (point layer hidden)

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setView(await fetchGisRoute(jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to read route geometry');
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  const features = view?.features ?? [];
  const project = view && view.present ? makeProjector(features) : null;
  const lineCount = features.filter((f) => f.type === 'LineString').length;
  const pointCount = features.filter((f) => f.type === 'Point').length;
  const polyCount = features.filter((f) => f.type === 'Polygon').length;
  // Named features only (cap) — keeps the list readable; in route-only mode hide the (often per-address) points.
  const named = features.filter((f) => f.name && (showPoints || f.type !== 'Point')).slice(0, 10);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Map / Route context</h3>
        <div className="flex items-center gap-2">
          {view?.present && (
            <div className="inline-flex overflow-hidden rounded-lg border border-line text-xs">
              <button
                onClick={() => setShowPoints(false)}
                className={`px-2.5 py-1 ${!showPoints ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`}>
                Route only
              </button>
              <button
                onClick={() => setShowPoints(true)}
                className={`border-l border-line px-2.5 py-1 ${showPoints ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`}>
                Show source points
              </button>
            </div>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-50">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-3">
        Route context drawn from this job’s uploaded GIS route (KMZ/KML) — real WGS84 coordinates only, no
        external map tiles or geocoding. The route geometry is the primary view; the per-point source layer is
        hidden by default (toggle “Show source points” to reveal it). Redline geometry is pixel-only and is
        shown on the source PDF pages in the Redline section; a geo-referenced map overlay awaits georeference.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!error && loading && <p className="mt-3 text-sm text-ink-3">Reading route geometry…</p>}

      {!error && !loading && view && !view.present && (
        <div className="mt-3 rounded-lg border border-line bg-paper p-4 text-sm text-ink-3">
          {REASON_COPY[view.reason ?? ''] ?? 'Route context is not available for this job.'}
          {view.reason === 'NO_GIS_ROUTE_UPLOADED' && (
            <span className="ml-1">Upload a <span className="font-mono">.kmz</span> / <span className="font-mono">.kml</span> in the Project files section to see the route here.</span>
          )}
        </div>
      )}

      {!error && !loading && view && view.present && project && features.length > 0 && (
        <>
          <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white">
            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-auto w-full" role="img"
                 aria-label="Uploaded route geometry">
              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#FBFCFE" />
              {/* Areas (route extent) — subtle, drawn first. */}
              {features.map((f, fi) => {
                if (f.type !== 'Polygon' || f.coordinates.length === 0) return null;
                const d = f.coordinates.map((p) => project(p)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
                return <polygon key={`poly-${fi}`} points={d} fill="rgba(13,110,253,0.05)" stroke="#9fb6d9" strokeWidth={1} />;
              })}
              {/* Route lines — the primary visual (no per-segment dots). */}
              {features.map((f, fi) => {
                if (f.type !== 'LineString' || f.coordinates.length === 0) return null;
                const d = f.coordinates.map((p) => project(p)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
                return <polyline key={`line-${fi}`} points={d} fill="none" stroke="#D85408" strokeWidth={2}
                                 strokeLinejoin="round" strokeLinecap="round" />;
              })}
              {/* Source points — debug layer, hidden by default. */}
              {showPoints && features.map((f, fi) => {
                if (f.type !== 'Point' || f.coordinates.length === 0) return null;
                const [x, y] = project(f.coordinates[0]);
                return <circle key={`pt-${fi}`} cx={x} cy={y} r={2.5} fill="#5b7bb0" fillOpacity={0.7} />;
              })}
            </svg>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
            <span><span className="mr-1 inline-block h-0.5 w-4 align-middle bg-[#D85408]" /> route</span>
            {showPoints && <span><span className="mr-1 inline-block size-2 rounded-full align-middle bg-[#5b7bb0]" /> source point</span>}
            <span>{lineCount} route segment{lineCount === 1 ? '' : 's'} · {pointCount} source point{pointCount === 1 ? '' : 's'}{showPoints ? '' : ' (hidden)'}{polyCount > 0 ? ` · ${polyCount} area${polyCount === 1 ? '' : 's'}` : ''}</span>
            {view.uploadFilename && <span className="font-mono">{view.uploadFilename}</span>}
            {view.bbox && (
              <span className="font-mono">
                bbox {view.bbox[1].toFixed(4)},{view.bbox[0].toFixed(4)} → {view.bbox[3].toFixed(4)},{view.bbox[2].toFixed(4)}
              </span>
            )}
          </div>
          {named.length > 0 && (
            <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
              {named.map((f, fi) => (
                <li key={fi} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-ink">
                    <span className="font-mono text-xs text-ink-3">{f.type}</span>
                    {f.name && <span className="ml-2">{f.name}</span>}
                  </span>
                  <span className="font-mono text-xs text-ink-3">{f.coordinates.length} pt(s)</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-ink-3">
            Street names/labels are not shown — they are not derived from the uploaded file and are never
            invented. A tiled basemap (with labels) is a separate, owner-approved follow-up.
          </p>
        </>
      )}
    </Card>
  );
}
