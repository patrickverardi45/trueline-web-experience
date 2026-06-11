'use client';

// Evidence pins, matchlines, and callouts rendered on top of the sheet.
// Matchlines are clickable and jump to their neighbor sheet.

import type { EvidenceKind, SheetPin } from '@/contracts';
import { EVIDENCE_KIND } from '@/lib/status';
import { DRAW_BOTTOM, DRAW_TOP } from './SheetFurniture';

const GLYPH: Record<EvidenceKind, string> = {
  start: 'S',
  end: 'E',
  problem: '!',
  'station-drop': '+',
};

interface Props {
  pins: SheetPin[];
  onMatchlineClick: (sheetId: string) => void;
}

function Matchline({ pin, onJump }: { pin: SheetPin; onJump: (sheetId: string) => void }) {
  const labelX = pin.x < 500 ? pin.x + 14 : pin.x - 6;
  return (
    <g
      className="cursor-pointer"
      onClick={() => {
        if (pin.targetSheetId) onJump(pin.targetSheetId);
      }}>
      <line
        x1={pin.x}
        y1={DRAW_TOP}
        x2={pin.x}
        y2={DRAW_BOTTOM}
        stroke="#44566B"
        strokeWidth={1.5}
        strokeDasharray="12 6"
      />
      <text
        x={labelX}
        y={240}
        transform={`rotate(-90 ${labelX} 240)`}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={600}
        letterSpacing={1.5}
        fill="#44566B"
        fontFamily="var(--font-mono)">
        {pin.label.toUpperCase()}
      </text>
      <rect x={pin.x - 14} y={DRAW_TOP} width={28} height={DRAW_BOTTOM - DRAW_TOP} fill="transparent" />
      <title>{`${pin.label} — click to jump`}</title>
    </g>
  );
}

function Callout({ pin }: { pin: SheetPin }) {
  const w = Math.min(380, pin.label.length * 5.9 + 18);
  const bx = Math.min(Math.max(pin.x - w / 2, 26), 974 - w);
  const by = pin.y - 46;
  return (
    <g>
      <line x1={pin.x} y1={pin.y - 6} x2={pin.x} y2={by + 22} stroke="#E9A23B" strokeWidth={1.25} />
      <rect x={bx} y={by} width={w} height={22} rx={4} fill="#FDF6E8" stroke="#E9A23B" strokeWidth={1} />
      <text
        x={bx + w / 2}
        y={by + 14.5}
        textAnchor="middle"
        fontSize={9.5}
        fill="#7A5410"
        fontFamily="var(--font-mono)">
        {pin.label}
      </text>
      <circle cx={pin.x} cy={pin.y} r={6.5} fill="#E9A23B" stroke="#FFFFFF" strokeWidth={1.5} />
      <text x={pin.x} y={pin.y + 2.8} textAnchor="middle" fontSize={8} fontWeight={800} fill="#3D2A07">
        i
      </text>
      <title>{pin.label}</title>
    </g>
  );
}

function EvidencePin({ pin }: { pin: SheetPin }) {
  const meta = EVIDENCE_KIND[pin.kind as EvidenceKind];
  return (
    <g>
      <circle cx={pin.x} cy={pin.y} r={9} fill={meta.hex} stroke="#FFFFFF" strokeWidth={2.25} />
      <text
        x={pin.x}
        y={pin.y + 3.2}
        textAnchor="middle"
        fontSize={9}
        fontWeight={800}
        fill="#FFFFFF">
        {GLYPH[pin.kind as EvidenceKind]}
      </text>
      <title>{pin.label}</title>
    </g>
  );
}

export function SheetPinsLayer({ pins, onMatchlineClick }: Props) {
  const matchlines = pins.filter((p) => p.kind === 'matchline');
  const callouts = pins.filter((p) => p.kind === 'callout');
  const evidence = pins.filter((p) => p.kind !== 'matchline' && p.kind !== 'callout');

  return (
    <g>
      {matchlines.map((pin) => (
        <Matchline key={pin.id} pin={pin} onJump={onMatchlineClick} />
      ))}
      {callouts.map((pin) => (
        <Callout key={pin.id} pin={pin} />
      ))}
      {evidence.map((pin) => (
        <EvidencePin key={pin.id} pin={pin} />
      ))}
    </g>
  );
}
