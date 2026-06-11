// Hero Map geometry for the Cedar Ridge project, in map surface coordinates
// (viewBox 1200 × 800). The basemap is a stylized OSP plan view — roads,
// parcels, a creek — not real GIS data.

import type { RedlinePath } from '@/contracts';

export const MAP_VIEWBOX = { width: 1200, height: 800 };

export interface RoadFeature {
  id: string;
  name: string;
  points: Array<[number, number]>;
  labelAt: [number, number];
  labelRotate?: number;
}

export interface ParcelFeature {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const roads: RoadFeature[] = [
  { id: 'rd-cedar', name: 'CEDAR RIDGE RD', points: [[0, 480], [1200, 480]], labelAt: [960, 502] },
  { id: 'rd-bluebonnet', name: 'BLUEBONNET LN', points: [[300, 120], [300, 760]], labelAt: [318, 640], labelRotate: -90 },
  { id: 'rd-ridgeline', name: 'RIDGELINE DR', points: [[60, 190], [780, 190]], labelAt: [600, 174] },
  { id: 'rd-quarry', name: 'QUARRY RD', points: [[820, 120], [820, 760]], labelAt: [838, 300], labelRotate: -90 },
  { id: 'rd-pecan', name: 'PECAN LOOP', points: [[700, 650], [1160, 650]], labelAt: [880, 672] },
];

export const creek: Array<[number, number]> = [
  [355, 60],
  [368, 200],
  [360, 330],
  [378, 460],
  [392, 600],
  [385, 800],
];

export const parcels: ParcelFeature[] = [
  { id: 'pa-1', x: 90, y: 230, width: 170, height: 200 },
  { id: 'pa-2', x: 440, y: 230, width: 320, height: 110 },
  { id: 'pa-3', x: 440, y: 360, width: 320, height: 90 },
  { id: 'pa-4', x: 90, y: 530, width: 170, height: 180 },
  { id: 'pa-5', x: 460, y: 530, width: 300, height: 90 },
  { id: 'pa-6', x: 870, y: 230, width: 260, height: 200 },
  { id: 'pa-7', x: 870, y: 520, width: 110, height: 100 },
  { id: 'pa-8', x: 340, y: 60, width: 420, height: 90 },
];

/** Structure markers (handholes, vaults, pedestals, poles) on the map. */
export interface StructureFeature {
  id: string;
  code: string;
  runId: string;
  shape: 'handhole' | 'vault' | 'pedestal' | 'pole';
  at: [number, number];
}

export const structures: StructureFeature[] = [
  { id: 'mk-hh104', code: 'HH-104', runId: 'r-a12', shape: 'handhole', at: [150, 468] },
  { id: 'mk-hh105', code: 'HH-105', runId: 'r-a12', shape: 'handhole', at: [640, 468] },
  { id: 'mk-hh106', code: 'HH-106', runId: 'r-a13', shape: 'handhole', at: [1080, 468] },
  { id: 'mk-vlt201', code: 'VLT-201', runId: 'r-b04', shape: 'vault', at: [288, 690] },
  { id: 'mk-hh112', code: 'HH-112', runId: 'r-b04', shape: 'handhole', at: [288, 250] },
  { id: 'mk-ped310', code: 'PED-310', runId: 'r-c02', shape: 'pedestal', at: [740, 638] },
  { id: 'mk-ped311', code: 'PED-311', runId: 'r-c02', shape: 'pedestal', at: [1130, 638] },
  { id: 'mk-pl77', code: 'PL-77', runId: 'r-d07', shape: 'pole', at: [120, 178] },
  { id: 'mk-pl82', code: 'PL-82', runId: 'r-d07', shape: 'pole', at: [700, 178] },
];

export const mapRedlines: RedlinePath[] = [
  {
    id: 'rl-map-a12',
    runId: 'r-a12',
    surface: 'map',
    points: [
      [150, 468],
      [640, 468],
    ],
    status: 'in-progress',
  },
  {
    id: 'rl-map-a13',
    runId: 'r-a13',
    surface: 'map',
    points: [
      [640, 468],
      [1080, 468],
    ],
    status: 'missing-evidence',
  },
  {
    id: 'rl-map-b04',
    runId: 'r-b04',
    surface: 'map',
    points: [
      [288, 690],
      [288, 250],
    ],
    status: 'needs-review',
  },
  {
    id: 'rl-map-c02',
    runId: 'r-c02',
    surface: 'map',
    points: [
      [740, 638],
      [1130, 638],
    ],
    status: 'blocked',
  },
  {
    id: 'rl-map-d07',
    runId: 'r-d07',
    surface: 'map',
    points: [
      [120, 178],
      [700, 178],
    ],
    status: 'complete',
  },
];

/** Notable point markers along runs (problems, the creek callout). */
export interface MapCallout {
  id: string;
  runId: string;
  at: [number, number];
  kind: 'problem' | 'note';
  label: string;
}

export const mapCallouts: MapCallout[] = [
  { id: 'co-caliche', runId: 'r-a12', at: [339, 468], kind: 'problem', label: 'Caliche — STA 3+40' },
  { id: 'co-creek', runId: 'r-a12', at: [372, 430], kind: 'note', label: 'Creek crossing — eng. review' },
  { id: 'co-irrigation', runId: 'r-c02', at: [818, 638], kind: 'problem', label: 'Irrigation line — STA 1+20' },
  { id: 'co-rock', runId: 'r-c02', at: [863, 638], kind: 'problem', label: 'Rock shelf — STA 1+90' },
];
