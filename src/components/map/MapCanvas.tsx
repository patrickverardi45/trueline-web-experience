'use client';

// The Hero Map SVG surface — a stylized OSP plan view (mock basemap) with
// runs drawn as status-colored redline paths. Custom SVG keeps the preview
// dependency-free; a real basemap provider can replace this surface later
// without changing the contracts.

import type { RedlinePlaybackStep, RunStatus } from '@/contracts';
import {
  MAP_VIEWBOX,
  creek,
  mapCallouts,
  parcels,
  roads,
  structures,
} from '@/lib/api/mock/geometry';
import { pointAtProgress, toPolyline, type Pt } from '@/lib/geometry';
import { RUN_STATUS } from '@/lib/status';
import type { MapRunBundle } from './types';

const PIN_KINDS: Record<string, string> = {
  'start-evidence': '#1FA563',
  'station-drop': '#F4640E',
  problem: '#DE4339',
  'end-evidence': '#2563C4',
};

interface PlaybackState {
  runId: string;
  progress: number;
  steps: RedlinePlaybackStep[];
}

interface Props {
  bundles: MapRunBundle[];
  selectedId: string | null;
  hoveredId: string | null;
  statusFilter: RunStatus | 'all';
  playback: PlaybackState | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function Structure({ shape, at }: { shape: string; at: Pt }) {
  const [x, y] = at;
  const common = { fill: '#DCE5EF', stroke: '#0A1220', strokeWidth: 1.5 };
  if (shape === 'vault') return <rect x={x - 6} y={y - 6} width={12} height={12} transform={`rotate(45 ${x} ${y})`} {...common} />;
  if (shape === 'pedestal') return <rect x={x - 4} y={y - 6} width={8} height={12} rx={1} {...common} />;
  if (shape === 'pole') return <circle cx={x} cy={y} r={4.5} {...common} />;
  return <rect x={x - 5} y={y - 5} width={10} height={10} rx={1} {...common} />;
}

export function MapCanvas({
  bundles,
  selectedId,
  hoveredId,
  statusFilter,
  playback,
  onSelect,
  onHover,
}: Props) {
  const isVisible = (status: RunStatus) => statusFilter === 'all' || statusFilter === status;

  return (
    <svg
      viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
      className="h-full w-full"
      role="img"
      aria-label="Hero Map — runs drawn as status-colored redline paths over a stylized plan view">
      <rect width={MAP_VIEWBOX.width} height={MAP_VIEWBOX.height} fill="#0A1220" />

      {/* Parcels */}
      {parcels.map((p) => (
        <rect
          key={p.id}
          x={p.x}
          y={p.y}
          width={p.width}
          height={p.height}
          rx={3}
          fill="#0E1726"
          stroke="#1B2940"
          strokeWidth={1}
        />
      ))}

      {/* Creek */}
      <polyline
        points={toPolyline(creek)}
        fill="none"
        stroke="#16344E"
        strokeWidth={16}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      <polyline
        points={toPolyline(creek)}
        fill="none"
        stroke="#2C5A7E"
        strokeWidth={2}
        strokeDasharray="3 6"
        strokeLinejoin="round"
        opacity={0.8}
      />
      <text x={creek[1][0] + 14} y={creek[1][1] + 40} fill="#3E6E94" fontSize={10} fontFamily="var(--font-mono)" letterSpacing={1.5} transform={`rotate(82 ${creek[1][0] + 14} ${creek[1][1] + 40})`}>
        DRY CREEK
      </text>

      {/* Roads */}
      {roads.map((road) => (
        <g key={road.id}>
          <polyline
            points={toPolyline(road.points)}
            fill="none"
            stroke="#202F44"
            strokeWidth={22}
            strokeLinecap="round"
          />
          <polyline
            points={toPolyline(road.points)}
            fill="none"
            stroke="#39506E"
            strokeWidth={1}
            strokeDasharray="10 12"
            opacity={0.7}
          />
          <text
            x={road.labelAt[0]}
            y={road.labelAt[1]}
            fill="#5E7390"
            fontSize={10}
            fontFamily="var(--font-mono)"
            letterSpacing={1.5}
            transform={road.labelRotate ? `rotate(${road.labelRotate} ${road.labelAt[0]} ${road.labelAt[1]})` : undefined}>
            {road.name}
          </text>
        </g>
      ))}

      {/* Run redlines */}
      {bundles.map((bundle) => {
        const { run, path } = bundle;
        const meta = RUN_STATUS[run.status];
        const visible = isVisible(run.status);
        const selected = run.id === selectedId;
        const hovered = run.id === hoveredId;
        const inPlayback = playback?.runId === run.id;
        const progress = inPlayback
          ? playback.progress
          : run.lengthFt > 0
            ? run.placedFt / run.lengthFt
            : 0;
        const pts = path.points;
        const poly = toPolyline(pts);
        const label = pointAtProgress(pts, 0.5);
        const groupOpacity = visible ? 1 : 0.12;

        return (
          <g key={run.id} opacity={groupOpacity} style={{ transition: 'opacity 200ms' }}>
            {selected ? (
              <polyline
                points={poly}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
              />
            ) : null}
            <polyline
              points={poly}
              fill="none"
              stroke="#060B14"
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
            {/* Planned (full) alignment */}
            <polyline
              points={poly}
              fill="none"
              stroke={meta.hex}
              strokeWidth={3}
              strokeDasharray="5 7"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={progress >= 1 ? 0 : 0.4}
            />
            {/* Placed footage (or playback progress) */}
            <polyline
              points={poly}
              fill="none"
              stroke={meta.hex}
              strokeWidth={hovered || selected ? 5 : 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - Math.max(0.001, progress)}
              style={{ transition: 'stroke-dashoffset 700ms ease-in-out, stroke-width 150ms' }}
            />
            <text
              x={label[0]}
              y={label[1] - 14}
              textAnchor="middle"
              fill={meta.hex}
              fontSize={11.5}
              fontWeight={700}
              fontFamily="var(--font-mono)">
              {run.name}
            </text>
            {/* Hit area */}
            <polyline
              points={poly}
              fill="none"
              stroke="transparent"
              strokeWidth={22}
              strokeLinecap="round"
              className="cursor-pointer"
              onClick={() => onSelect(run.id)}
              onMouseEnter={() => onHover(run.id)}
              onMouseLeave={() => onHover(null)}>
              <title>
                {run.name} · {meta.label}
              </title>
            </polyline>
          </g>
        );
      })}

      {/* Problem / note callouts */}
      {mapCallouts.map((c) => {
        const bundle = bundles.find((b) => b.run.id === c.runId);
        if (!bundle || !isVisible(bundle.run.status)) return null;
        const [x, y] = c.at;
        return c.kind === 'problem' ? (
          <g key={c.id}>
            <path
              d={`M ${x} ${y - 7} L ${x + 6.5} ${y + 5} L ${x - 6.5} ${y + 5} Z`}
              fill="#DE4339"
              stroke="#0A1220"
              strokeWidth={1.25}
            />
            <text x={x} y={y + 3.2} textAnchor="middle" fill="#FFFFFF" fontSize={7.5} fontWeight={800}>
              !
            </text>
            <title>{c.label}</title>
          </g>
        ) : (
          <g key={c.id}>
            <circle cx={x} cy={y} r={5} fill="#E9A23B" stroke="#0A1220" strokeWidth={1.25} />
            <text x={x} y={y + 2.8} textAnchor="middle" fill="#0A1220" fontSize={7.5} fontWeight={800}>
              i
            </text>
            <title>{c.label}</title>
          </g>
        );
      })}

      {/* Structures */}
      {structures.map((s) => {
        const bundle = bundles.find((b) => b.run.id === s.runId);
        const visible = bundle ? isVisible(bundle.run.status) : true;
        return (
          <g key={s.id} opacity={visible ? 1 : 0.15} style={{ transition: 'opacity 200ms' }}>
            <Structure shape={s.shape} at={s.at} />
            <text
              x={s.at[0]}
              y={s.at[1] + 22}
              textAnchor="middle"
              fill="#8AA0BC"
              fontSize={10}
              fontFamily="var(--font-mono)">
              {s.code}
            </text>
          </g>
        );
      })}

      {/* Playback event pins */}
      {playback
        ? playback.steps
            .filter((step) => PIN_KINDS[step.kind])
            .map((step) => {
              const bundle = bundles.find((b) => b.run.id === step.runId);
              if (!bundle) return null;
              const [x, y] = pointAtProgress(bundle.path.points, step.progress);
              return (
                <g key={step.id}>
                  <circle cx={x} cy={y} r={7.5} fill={PIN_KINDS[step.kind]} stroke="#FFFFFF" strokeWidth={2} />
                  <title>
                    {step.stationCode ? `${step.stationCode} — ` : ''}
                    {step.note}
                  </title>
                </g>
              );
            })
        : null}

      {/* North arrow */}
      <g transform={`translate(${MAP_VIEWBOX.width - 52}, 46)`}>
        <circle r={20} fill="#0E1726" stroke="#28394E" strokeWidth={1} />
        <path d="M 0 -12 L 6 8 L 0 4 L -6 8 Z" fill="#8AA0BC" />
        <text y={-26} textAnchor="middle" fill="#5E7390" fontSize={10} fontFamily="var(--font-mono)">
          N
        </text>
      </g>

      {/* Scale bar */}
      <g transform={`translate(36, ${MAP_VIEWBOX.height - 30})`}>
        <rect x={0} y={0} width={60} height={5} fill="#DCE5EF" />
        <rect x={60} y={0} width={60} height={5} fill="#39506E" />
        <text x={0} y={-6} fill="#5E7390" fontSize={9} fontFamily="var(--font-mono)">
          0
        </text>
        <text x={112} y={-6} fill="#5E7390" fontSize={9} fontFamily="var(--font-mono)">
          200 FT
        </text>
      </g>
    </svg>
  );
}
