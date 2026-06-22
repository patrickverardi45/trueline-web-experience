// Plan sheet fixtures for the mock PDF Plan Viewer. Sheet coordinate space is
// 1000 × 700 (drawing area inside the title block).

import type { PlanSheet, RedlinePath, SheetPin } from '@/contracts';

export const SHEET_VIEWBOX = { width: 1000, height: 700 };

export const sheets: PlanSheet[] = [
  { id: 'sh-c101', projectId: 'demo-project-001', code: 'C-101', title: 'Plan & Profile — Sample Street 1', runIds: ['r-d07'], nextSheetId: 'sh-c102' },
  { id: 'sh-c102', projectId: 'demo-project-001', code: 'C-102', title: 'Plan & Profile — Sample Street 2', runIds: ['r-b04'], prevSheetId: 'sh-c101', nextSheetId: 'sh-c103' },
  { id: 'sh-c103', projectId: 'demo-project-001', code: 'C-103', title: 'Plan & Profile — Sample Road, STA 0+00 to STA 8+80', runIds: ['r-a12'], prevSheetId: 'sh-c102', nextSheetId: 'sh-c104' },
  { id: 'sh-c104', projectId: 'demo-project-001', code: 'C-104', title: 'Plan & Profile — Sample Road, STA 8+80 to STA 16+20', runIds: ['r-a13'], prevSheetId: 'sh-c103', nextSheetId: 'sh-c105' },
  { id: 'sh-c105', projectId: 'demo-project-001', code: 'C-105', title: 'Plan & Profile — Sample Loop', runIds: ['r-c02'], prevSheetId: 'sh-c104' },
  { id: 'sh-f101', projectId: 'demo-project-002', code: 'F-101', title: 'Plan & Profile — Sample Highway Parallel', runIds: ['r-m01', 'r-m02'] },
  { id: 'sh-o101', projectId: 'demo-project-003', code: 'O-101', title: 'Site Plan — Sample Business Park', runIds: ['r-l11', 'r-l12'] },
];

export const sheetPins: SheetPin[] = [
  // Sheet C-103 (Run A-12) — the showcase sheet.
  { id: 'pin-c103-start', sheetId: 'sh-c103', x: 95, y: 380, kind: 'start', label: 'Start evidence — HH-104', evidenceId: 'ev-a12-start' },
  { id: 'pin-c103-st280', sheetId: 'sh-c103', x: 361, y: 380, kind: 'station-drop', label: 'Station drop — STA 2+80', evidenceId: 'ev-a12-st280' },
  { id: 'pin-c103-prob', sheetId: 'sh-c103', x: 418, y: 380, kind: 'problem', label: 'Caliche — STA 3+40', evidenceId: 'ev-a12-prob' },
  { id: 'pin-c103-st520', sheetId: 'sh-c103', x: 588, y: 380, kind: 'station-drop', label: 'Station drop — STA 5+20', evidenceId: 'ev-a12-st520' },
  { id: 'pin-c103-ml-left', sheetId: 'sh-c103', x: 28, y: 350, kind: 'matchline', label: 'Matchline — see C-102', targetSheetId: 'sh-c102' },
  { id: 'pin-c103-ml-right', sheetId: 'sh-c103', x: 972, y: 350, kind: 'matchline', label: 'Matchline — see C-104', targetSheetId: 'sh-c104' },
  { id: 'pin-c103-creek', sheetId: 'sh-c103', x: 475, y: 180, kind: 'callout', label: 'Creek crossing — engineering review CR-104 pending' },
  // Sheet C-102 (Run B-04).
  { id: 'pin-c102-start', sheetId: 'sh-c102', x: 140, y: 540, kind: 'start', label: 'Start evidence — VLT-201', evidenceId: 'ev-b04-start' },
  { id: 'pin-c102-end', sheetId: 'sh-c102', x: 860, y: 200, kind: 'end', label: 'End evidence — HH-112', evidenceId: 'ev-b04-end' },
  { id: 'pin-c102-ml-right', sheetId: 'sh-c102', x: 972, y: 350, kind: 'matchline', label: 'Matchline — see C-103', targetSheetId: 'sh-c103' },
  // Sheet C-105 (Run C-02).
  { id: 'pin-c105-start', sheetId: 'sh-c105', x: 120, y: 380, kind: 'start', label: 'Start evidence — PED-310', evidenceId: 'ev-c02-start' },
  { id: 'pin-c105-prob1', sheetId: 'sh-c105', x: 300, y: 380, kind: 'problem', label: 'Irrigation line — STA 1+20', evidenceId: 'ev-c02-prob1' },
  { id: 'pin-c105-prob2', sheetId: 'sh-c105', x: 410, y: 380, kind: 'problem', label: 'Rock shelf — STA 1+90', evidenceId: 'ev-c02-prob2' },
  // Sheet C-101 (Run D-07).
  { id: 'pin-c101-start', sheetId: 'sh-c101', x: 110, y: 320, kind: 'start', label: 'Start evidence — PL-77', evidenceId: 'ev-d07-start' },
  { id: 'pin-c101-end', sheetId: 'sh-c101', x: 880, y: 320, kind: 'end', label: 'End evidence — PL-82', evidenceId: 'ev-d07-end' },
];

/** As-built redlines drawn on sheets (sheet coordinate space). */
export const sheetRedlines: RedlinePath[] = [
  {
    id: 'rl-sheet-a12',
    runId: 'r-a12',
    surface: 'sheet',
    surfaceId: 'sh-c103',
    points: [
      [95, 380],
      [588, 380],
    ],
    status: 'in-progress',
  },
  {
    id: 'rl-sheet-b04',
    runId: 'r-b04',
    surface: 'sheet',
    surfaceId: 'sh-c102',
    points: [
      [140, 540],
      [140, 200],
      [860, 200],
    ],
    status: 'needs-review',
  },
  {
    id: 'rl-sheet-c02',
    runId: 'r-c02',
    surface: 'sheet',
    surfaceId: 'sh-c105',
    points: [
      [120, 380],
      [445, 380],
    ],
    status: 'blocked',
  },
  {
    id: 'rl-sheet-d07',
    runId: 'r-d07',
    surface: 'sheet',
    surfaceId: 'sh-c101',
    points: [
      [110, 320],
      [880, 320],
    ],
    status: 'complete',
  },
];

/**
 * Station tick marks rendered along the C-103 alignment for station search.
 * Linear scale: x = 95 + offsetFt × (835 / 880) — STA 0+00 at x 95,
 * STA 8+80 (880 ft) at x 930.
 */
export const c103Stations: Array<{ code: string; x: number }> = [
  { code: 'STA 0+00', x: 95 },
  { code: 'STA 1+00', x: 190 },
  { code: 'STA 2+00', x: 285 },
  { code: 'STA 2+80', x: 361 },
  { code: 'STA 3+40', x: 418 },
  { code: 'STA 4+00', x: 475 },
  { code: 'STA 5+20', x: 588 },
  { code: 'STA 6+00', x: 664 },
  { code: 'STA 7+00', x: 759 },
  { code: 'STA 8+00', x: 854 },
  { code: 'STA 8+80', x: 930 },
];
