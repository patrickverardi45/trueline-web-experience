'use client';

// Compact before/after redline preview. Faint plan linework is always
// visible; the run's as-built redline overlay is revealed left of a
// draggable divider — the same comparison concept as the plan viewer,
// compressed into a short strip.

import { useId, useState } from 'react';

import { toPolyline, type Pt } from '@/lib/geometry';
import { RUN_STATUS } from '@/lib/status';

import type { ReviewItem } from './review-types';

// Sheet space is 1000 × 700; the preview compresses it vertically into a
// 1000 × 400 strip so the panel stays around 240 px tall.
const VB_W = 1000;
const VB_H = 400;
const SCALE_Y = VB_H / 700;

const FAINT = '#D5DEE9';
const FAINTER = '#E5EBF3';

function PlanLinework({ sheetCode, sheetTitle }: { sheetCode: string; sheetTitle: string }) {
  return (
    <g>
      {/* Road corridor with dashed centerline */}
      <line x1={0} y1={196} x2={VB_W} y2={196} stroke={FAINT} strokeWidth={1.5} />
      <line x1={0} y1={244} x2={VB_W} y2={244} stroke={FAINT} strokeWidth={1.5} />
      <line x1={0} y1={220} x2={VB_W} y2={220} stroke={FAINT} strokeWidth={1} strokeDasharray="14 10" />
      {/* Lot lines above and below the corridor */}
      {[120, 260, 400, 540, 680, 820, 940].map((x) => (
        <g key={x} stroke={FAINTER} strokeWidth={1}>
          <line x1={x} y1={40} x2={x} y2={160} />
          <line x1={x - 50} y1={282} x2={x - 50} y2={350} />
        </g>
      ))}
      <line x1={0} y1={40} x2={VB_W} y2={40} stroke={FAINTER} strokeWidth={1} />
      <line x1={0} y1={350} x2={VB_W} y2={350} stroke={FAINTER} strokeWidth={1} />
      {/* Matchlines */}
      <g stroke="#B9C6D6" strokeWidth={1.5} strokeDasharray="8 6">
        <line x1={20} y1={20} x2={20} y2={VB_H - 44} />
        <line x1={VB_W - 20} y1={20} x2={VB_W - 20} y2={VB_H - 44} />
      </g>
      {/* Title block strip */}
      <rect x={0} y={VB_H - 36} width={VB_W} height={36} fill="#F4F7FA" stroke={FAINT} strokeWidth={1} />
      <text
        x={16}
        y={VB_H - 13}
        fontSize={13}
        fontFamily="var(--font-mono)"
        fill="#7C8CA0"
        letterSpacing={1}>
        {sheetCode} · {sheetTitle.toUpperCase()}
      </text>
    </g>
  );
}

export function RedlinePreview({ item }: { item: ReviewItem }) {
  const [reveal, setReveal] = useState(62);
  const clipId = `reveal-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (!item.redline) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink-3">
        No sheet redline recorded for this run yet.
      </div>
    );
  }

  const meta = RUN_STATUS[item.redline.status];
  const pts: Pt[] = item.redline.points.map(([x, y]) => [x, Math.round(y * SCALE_Y * 10) / 10]);
  const start = pts[0];
  const end = pts[pts.length - 1];
  const poly = toPolyline(pts);
  const divider = (reveal / 100) * VB_W;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-3">
        <span style={{ color: meta.hex }}>As-built redline</span>
        <span>Plan only</span>
      </div>
      <div className="mt-1.5 overflow-hidden rounded-lg border border-line">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block w-full"
          role="img"
          aria-label={`Before/after redline preview for ${item.runName} on sheet ${item.sheetCode}`}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={divider} height={VB_H} />
            </clipPath>
          </defs>

          {/* Paper + faint plan linework — the "before" layer */}
          <rect width={VB_W} height={VB_H} fill="#FCFDFE" />
          <PlanLinework sheetCode={item.sheetCode} sheetTitle={item.sheetTitle} />

          {/* As-built overlay, revealed left of the divider */}
          <g clipPath={`url(#${clipId})`}>
            <polyline
              points={poly}
              fill="none"
              stroke={meta.hex}
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.16}
            />
            <polyline
              points={poly}
              fill="none"
              stroke={meta.hex}
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[start, end].map(([x, y], i) => (
              <rect
                key={i}
                x={x - 7}
                y={y - 7}
                width={14}
                height={14}
                rx={2}
                fill="#FFFFFF"
                stroke={meta.hex}
                strokeWidth={2.5}
              />
            ))}
            <text
              x={start[0] + 14}
              y={start[1] - 14}
              fontSize={13}
              fontFamily="var(--font-mono)"
              fill="#45535F">
              {item.fromStationCode}
            </text>
            <text
              x={end[0] - 14}
              y={end[1] - 14}
              textAnchor="end"
              fontSize={13}
              fontFamily="var(--font-mono)"
              fill="#45535F">
              {item.toStationCode}
            </text>
            <g transform="translate(34, 22)">
              <rect width={88} height={22} rx={4} fill="#FFFFFF" stroke={meta.hex} strokeWidth={1.5} />
              <text
                x={44}
                y={15}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fontFamily="var(--font-mono)"
                fill={meta.hex}
                letterSpacing={1}>
                AS-BUILT
              </text>
            </g>
          </g>

          {/* Divider */}
          <line x1={divider} y1={0} x2={divider} y2={VB_H} stroke="#15202B" strokeWidth={2} />
          <rect x={divider - 5} y={VB_H / 2 - 14} width={10} height={28} rx={5} fill="#15202B" />
        </svg>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={reveal}
        onChange={(e) => setReveal(Number(e.target.value))}
        className="mt-2 w-full"
        style={{ accentColor: meta.hex }}
        aria-label="Reveal as-built overlay"
      />
      <p className="text-[11px] text-ink-3">
        Drag the divider — the as-built overlay shows left of the line.
      </p>
    </div>
  );
}
