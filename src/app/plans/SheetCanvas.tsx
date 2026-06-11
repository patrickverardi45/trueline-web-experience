'use client';

// The drawn plan sheet: furniture underneath, field redlines as a marker-style
// overlay (clipped by the before/after reveal), pins, and the station-search
// highlight on top.

import type { RunStatus } from '@/contracts';
import { pointAtProgress, toPolyline } from '@/lib/geometry';
import { RUN_STATUS } from '@/lib/status';
import { ALIGN_Y, DRAW_BOTTOM, DRAW_TOP, SheetFurniture } from './SheetFurniture';
import { SheetPinsLayer } from './SheetPinsLayer';
import { ticksForSheet } from './stationIndex';
import type { SheetBundle, StationHit } from './types';

export interface RunRef {
  name: string;
  status: RunStatus;
}

interface Props {
  bundle: SheetBundle;
  runsById: Record<string, RunRef>;
  projectName: string;
  projectClient: string;
  sheetIndex: number;
  sheetCount: number;
  redlinesOn: boolean;
  /** 0–100 before/after reveal; redlines show left of this position. */
  reveal: number;
  searchHit: StationHit | null;
  onMatchlineClick: (sheetId: string) => void;
}

export function SheetCanvas({
  bundle,
  runsById,
  projectName,
  projectClient,
  sheetIndex,
  sheetCount,
  redlinesOn,
  reveal,
  searchHit,
  onMatchlineClick,
}: Props) {
  const { sheet, pins, redlines } = bundle;
  const clipId = `redline-reveal-${sheet.id}`;
  const revealX = (reveal / 100) * 1000;
  const showDivider = redlinesOn && reveal > 0.5 && reveal < 99.5;

  return (
    <svg
      viewBox="0 0 1000 700"
      className="h-full w-full drop-shadow-md"
      role="img"
      aria-label={`Plan sheet ${sheet.code} — ${sheet.title}, with field redlines and evidence pins`}>
      <SheetFurniture
        projectName={projectName}
        projectClient={projectClient}
        sheetCode={sheet.code}
        sheetTitle={sheet.title}
        sheetIndex={sheetIndex}
        sheetCount={sheetCount}
        ticks={ticksForSheet(sheet.id)}
      />

      {/* Field redline overlay, revealed left of the slider position */}
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={revealX} height={700} />
        </clipPath>
      </defs>
      {redlinesOn ? (
        <g clipPath={`url(#${clipId})`}>
          {redlines.map((path) => {
            const meta = RUN_STATUS[path.status];
            const run = runsById[path.runId];
            const mid = pointAtProgress(path.points, 0.5);
            return (
              <g key={path.id} opacity={0.9}>
                <polyline
                  points={toPolyline(path.points)}
                  fill="none"
                  stroke={meta.hex}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text
                  x={mid[0]}
                  y={mid[1] - 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={meta.hex}
                  fontFamily="var(--font-mono)">
                  {`${(run?.name ?? path.runId).toUpperCase()} — ${meta.label.toUpperCase()}`}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}

      {/* Before/after divider */}
      {showDivider ? (
        <line
          x1={revealX}
          y1={DRAW_TOP}
          x2={revealX}
          y2={612}
          stroke="#16212E"
          strokeWidth={1}
          strokeDasharray="3 5"
          opacity={0.55}
        />
      ) : null}

      <SheetPinsLayer pins={pins} onMatchlineClick={onMatchlineClick} />

      {/* Station search highlight */}
      {searchHit ? (
        <g>
          <line
            x1={searchHit.x}
            y1={DRAW_TOP}
            x2={searchHit.x}
            y2={DRAW_BOTTOM}
            stroke="#F4640E"
            strokeWidth={1.25}
            strokeDasharray="6 4"
          />
          <circle cx={searchHit.x} cy={ALIGN_Y} r={24} fill="none" stroke="#F4640E" strokeWidth={5} opacity={0.2} />
          <circle cx={searchHit.x} cy={ALIGN_Y} r={16} fill="none" stroke="#F4640E" strokeWidth={2.5} />
          <rect x={searchHit.x - 36} y={DRAW_TOP + 6} width={72} height={18} rx={4} fill="#F4640E" />
          <text
            x={searchHit.x}
            y={DRAW_TOP + 19}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="#FFFFFF"
            fontFamily="var(--font-mono)">
            {searchHit.code}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
