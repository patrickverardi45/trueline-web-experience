// Serializable props passed from the server page to the client viewer.

import type { PlanSheet, RedlinePath, Run, SheetPin } from '@/contracts';

export interface SheetBundle {
  sheet: PlanSheet;
  pins: SheetPin[];
  redlines: RedlinePath[];
}

export interface PlanViewerProps {
  projectName: string;
  projectClient: string;
  bundles: SheetBundle[];
  runs: Run[];
}

/** A station-search hit rendered on the active sheet. */
export interface StationHit {
  code: string;
  x: number;
}
