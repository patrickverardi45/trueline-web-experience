'use client';

// Static plan-sheet drawing: white paper, double border frame, faint
// civil linework (road, existing utilities, parcels), station ticks, and the
// title block strip. Purely decorative — overlays render on top of this.

import type { StationTick } from './stationIndex';

export const ALIGN_Y = 380;
export const DRAW_TOP = 26;
export const DRAW_BOTTOM = 606;

const TITLE_TOP = 618;
const TITLE_BOTTOM = 682;
const CELL_X = [18, 300, 590, 712, 878, 982];

interface Props {
  projectName: string;
  projectClient: string;
  sheetCode: string;
  sheetTitle: string;
  /** Zero-based position in the sheet set. */
  sheetIndex: number;
  sheetCount: number;
  ticks: StationTick[];
}

function parcelRow(seed: number, startX: number, widths: number[]): Array<{ x: number; w: number }> {
  const out: Array<{ x: number; w: number }> = [];
  let x = startX + ((seed * 53) % 64);
  for (const w of widths) {
    if (x + w > 948) break;
    out.push({ x, w });
    x += w + 16;
  }
  return out;
}

function splitTitle(title: string): string[] {
  const comma = title.indexOf(', ');
  if (comma === -1 || title.length <= 36) return [title];
  return [title.slice(0, comma), title.slice(comma + 2)];
}

export function SheetFurniture({
  projectName,
  projectClient,
  sheetCode,
  sheetTitle,
  sheetIndex,
  sheetCount,
  ticks,
}: Props) {
  const roadName =
    sheetTitle.split('—')[1]?.split(',')[0]?.trim().toUpperCase() ?? 'COUNTY ROAD';
  const titleLines = splitTitle(sheetTitle);
  const parcelsAbove = parcelRow(sheetIndex, 36, [176, 208, 162, 198, 184]);
  const parcelsBelow = parcelRow(sheetIndex + 3, 60, [222, 178, 242, 196]);

  return (
    <g>
      {/* Paper + double border frame */}
      <rect x={0} y={0} width={1000} height={700} fill="#FFFFFF" />
      <rect x={10} y={10} width={980} height={680} fill="none" stroke="#8E9DAC" strokeWidth={2} />
      <rect x={18} y={18} width={964} height={664} fill="none" stroke="#B7C2CD" strokeWidth={0.75} />

      {/* Parcel outlines */}
      {parcelsAbove.map((p) => (
        <rect key={`pa-${p.x}`} x={p.x} y={52} width={p.w} height={240} fill="none" stroke="#E5EAF0" strokeWidth={1} />
      ))}
      {parcelsBelow.map((p) => (
        <rect key={`pb-${p.x}`} x={p.x} y={468} width={p.w} height={104} fill="none" stroke="#E5EAF0" strokeWidth={1} />
      ))}

      {/* Existing utilities */}
      <line x1={26} y1={318} x2={974} y2={318} stroke="#D3DBE3" strokeWidth={1} strokeDasharray="8 6" />
      <text x={30} y={312} fontSize={7.5} fill="#ABB8C5" fontFamily="var(--font-mono)" letterSpacing={1}>
        EX. TEL
      </text>
      <line x1={26} y1={452} x2={974} y2={452} stroke="#D3DBE3" strokeWidth={1} strokeDasharray="14 5 3 5" />
      <text x={30} y={464} fontSize={7.5} fill="#ABB8C5" fontFamily="var(--font-mono)" letterSpacing={1}>
        EX. GAS
      </text>

      {/* Road edges + centerline */}
      <line x1={20} y1={350} x2={980} y2={350} stroke="#DCE3EA" strokeWidth={1.5} />
      <line x1={20} y1={410} x2={980} y2={410} stroke="#DCE3EA" strokeWidth={1.5} />
      <line x1={20} y1={ALIGN_Y} x2={980} y2={ALIGN_Y} stroke="#C2CCD6" strokeWidth={1.2} strokeDasharray="26 7 7 7" />
      <text x={500} y={342} textAnchor="middle" fontSize={10} fill="#9FAEBC" fontFamily="var(--font-mono)" letterSpacing={2.5}>
        {roadName}
      </text>

      {/* Station ticks along the alignment */}
      {ticks.map((tick) => (
        <g key={tick.code}>
          <line x1={tick.x} y1={ALIGN_Y - 8} x2={tick.x} y2={ALIGN_Y + 8} stroke="#8C9AAA" strokeWidth={1.2} />
          <text
            x={tick.x}
            y={398}
            transform={`rotate(-90 ${tick.x} 398)`}
            textAnchor="end"
            fontSize={8.5}
            fill="#7C8B9C"
            fontFamily="var(--font-mono)">
            {tick.code}
          </text>
        </g>
      ))}

      {/* North arrow */}
      <g transform="translate(944, 64)">
        <circle r={16} fill="none" stroke="#C9D2DC" strokeWidth={1} />
        <path d="M 0 -10 L 5 7 L 0 3.5 L -5 7 Z" fill="#9FAEBC" />
        <text y={-21} textAnchor="middle" fontSize={9} fill="#9FAEBC" fontFamily="var(--font-mono)">
          N
        </text>
      </g>

      {/* Title block strip */}
      <line x1={18} y1={TITLE_TOP} x2={982} y2={TITLE_TOP} stroke="#8E9DAC" strokeWidth={1.25} />
      {CELL_X.slice(1, -1).map((x) => (
        <line key={x} x1={x} y1={TITLE_TOP} x2={x} y2={TITLE_BOTTOM} stroke="#C9D2DC" strokeWidth={1} />
      ))}

      {/* Cell: project */}
      <text x={28} y={634} fontSize={7} fill="#94A2B0" letterSpacing={1.5}>
        PROJECT
      </text>
      <text x={28} y={652} fontSize={12.5} fontWeight={600} fill="#2A3744">
        {projectName}
      </text>
      <text x={28} y={668} fontSize={8.5} fill="#7C8B9C" fontFamily="var(--font-mono)" letterSpacing={0.5}>
        {projectClient.toUpperCase()}
      </text>

      {/* Cell: sheet title */}
      <text x={310} y={634} fontSize={7} fill="#94A2B0" letterSpacing={1.5}>
        SHEET TITLE
      </text>
      {titleLines.map((line, i) => (
        <text
          key={line}
          x={310}
          y={titleLines.length === 1 ? 656 : 651 + i * 14}
          fontSize={titleLines.length === 1 ? 11.5 : 10.5}
          fontWeight={600}
          fill="#2A3744">
          {line}
        </text>
      ))}

      {/* Cell: scale + date */}
      <text x={600} y={634} fontSize={7} fill="#94A2B0" letterSpacing={1.5}>
        SCALE / DATE
      </text>
      <text x={600} y={652} fontSize={9.5} fill="#45535F" fontFamily="var(--font-mono)">
        {`SCALE: 1" = 100'`}
      </text>
      <text x={600} y={666} fontSize={9.5} fill="#45535F" fontFamily="var(--font-mono)">
        DATE: 06/10/2026
      </text>

      {/* Cell: preview stamp (light gray) */}
      <g transform="rotate(-2 795 650)">
        <rect x={722} y={628} width={146} height={44} rx={3} fill="none" stroke="#C9D2DC" strokeWidth={1.25} />
        <text x={795} y={647} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#B9C4CF" letterSpacing={1}>
          TRUELINE PREVIEW
        </text>
        <text x={795} y={661} textAnchor="middle" fontSize={8} fill="#B9C4CF" letterSpacing={0.5}>
          NOT FOR CONSTRUCTION
        </text>
      </g>

      {/* Cell: sheet code */}
      <text x={930} y={633} textAnchor="middle" fontSize={7} fill="#94A2B0" letterSpacing={1.5}>
        SHEET
      </text>
      <text x={930} y={660} textAnchor="middle" fontSize={24} fontWeight={700} fill="#22303D" fontFamily="var(--font-mono)">
        {sheetCode}
      </text>
      <text x={930} y={675} textAnchor="middle" fontSize={8} fill="#7C8B9C" fontFamily="var(--font-mono)">
        {sheetIndex + 1} OF {sheetCount}
      </text>
    </g>
  );
}
