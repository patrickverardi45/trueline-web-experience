// TrueLine shared product contracts — the single vocabulary the website,
// mobile field app, and (later) the v2 engine integration all speak.
//
// Contract-first: nothing in this file imports engine code or assumes engine
// internals. The mock API implements these shapes today; a real backend
// replaces the implementation, not the contract.
//
// Mirrored in trueline-field-mobile/src/contracts — keep in sync until the
// contracts move into a shared package.

export type ID = string;
/** ISO 8601 timestamp, e.g. '2026-06-10T14:35:00-05:00'. */
export type ISODate = string;

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Where a fact came from — every evidence object can cite its sources. */
export interface SourceRef {
  type: 'field-ticket' | 'bore-log' | 'plan-sheet' | 'daily-log' | 'engine-import';
  refId: ID;
  label: string;
}

export interface QuantityLine {
  label: string;
  qty: number;
  unit: string;
}

// ---------------------------------------------------------------------------
// Status vocabularies
// ---------------------------------------------------------------------------

export type ReviewStatus =
  | 'draft'
  | 'submitted'
  | 'in-review'
  | 'changes-requested'
  | 'approved';

/** Operational status of a run/segment as shown on the Hero Map. */
export type RunStatus =
  | 'complete'
  | 'in-progress'
  | 'blocked'
  | 'needs-review'
  | 'missing-evidence';

export type ProjectStatus = 'active' | 'on-hold' | 'closeout';

export type ConstructionMethod = 'bore' | 'trench' | 'aerial' | 'pull';

/** The four field capture actions. */
export type EvidenceKind = 'start' | 'end' | 'problem' | 'station-drop';

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Crew {
  id: ID;
  name: string;
  lead: string;
  size: number;
  phone?: string;
}

// ---------------------------------------------------------------------------
// Work breakdown
// ---------------------------------------------------------------------------

export interface Project {
  id: ID;
  name: string;
  client: string;
  location: string;
  status: ProjectStatus;
  startDate: ISODate;
  targetDate: ISODate;
  footagePlannedFt: number;
  footagePlacedFt: number;
  runIds: ID[];
  crewIds: ID[];
  /** 0–100, derived from evidence completeness (see CloseoutReadiness). */
  readinessScore: number;
  openIssueCount: number;
  lastActivityAt: ISODate;
}

export interface Run {
  id: ID;
  projectId: ID;
  name: string;
  fromStationCode: string;
  toStationCode: string;
  lengthFt: number;
  placedFt: number;
  method: ConstructionMethod;
  status: RunStatus;
  crewId?: ID;
  lastActivityAt: ISODate;
  segmentIds: ID[];
  planSheetIds: ID[];
  boreLogRef?: SourceRef;
  evidence: EvidenceSummary;
}

/** Rollup the map/cards show without loading every evidence item. */
export interface EvidenceSummary {
  hasStart: boolean;
  hasEnd: boolean;
  problemCount: number;
  stationDropCount: number;
  requiredCount: number;
  capturedCount: number;
}

export interface Segment {
  id: ID;
  runId: ID;
  index: number;
  fromStationCode: string;
  toStationCode: string;
  lengthFt: number;
  method: ConstructionMethod;
  status: RunStatus;
}

export interface Station {
  id: ID;
  runId: ID;
  /** Display code, e.g. 'STA 3+40' or a structure code like 'HH-104'. */
  code: string;
  /** Distance from run start in feet. */
  offsetFt: number;
  gps?: GeoPoint;
  droppedAt?: ISODate;
  source: SourceRef;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  id: ID;
  runId: ID;
  projectId: ID;
  kind: EvidenceKind;
  label: string;
  capturedAt: ISODate;
  crewId: ID;
  stationCode?: string;
  gps?: GeoPoint;
  photoIds: ID[];
  review: ReviewStatus;
  sources: SourceRef[];
  note?: string;
}

export interface FieldPhoto {
  id: ID;
  evidenceItemId: ID;
  /** Absent in mock mode — render a placeholder tile. */
  thumbUrl?: string;
  takenAt: ISODate;
  gps?: GeoPoint;
  stationCode?: string;
  caption?: string;
}

export interface FieldTicket {
  id: ID;
  runId: ID;
  projectId: ID;
  date: ISODate;
  crewId: ID;
  status: ReviewStatus;
  quantities: QuantityLine[];
  evidenceIds: ID[];
  notes: string;
}

export interface DailyLog {
  id: ID;
  projectId: ID;
  crewId: ID;
  date: ISODate;
  weather: string;
  summary: string;
  quantities: QuantityLine[];
  status: 'draft' | 'submitted';
}

export interface Issue {
  id: ID;
  projectId: ID;
  runId?: ID;
  kind: 'utility-conflict' | 'access' | 'damage' | 'permit' | 'rework' | 'locates';
  title: string;
  openedAt: ISODate;
  status: 'open' | 'monitoring' | 'resolved';
  /** Blocking issues hold their run at status 'blocked'. */
  blocking: boolean;
}

// ---------------------------------------------------------------------------
// Redlines
// ---------------------------------------------------------------------------

/** A drawable redline geometry on a surface (Hero Map or a plan sheet). */
export interface RedlinePath {
  id: ID;
  runId: ID;
  surface: 'map' | 'sheet';
  /** Sheet id when surface === 'sheet'; undefined for the map surface. */
  surfaceId?: ID;
  /** Points in the surface's own coordinate space. */
  points: Array<[number, number]>;
  status: RunStatus;
}

/** One event in the step-by-step redline playback of a run. */
export interface RedlinePlaybackStep {
  id: ID;
  runId: ID;
  seq: number;
  at: ISODate;
  kind:
    | 'mobilize'
    | 'start-evidence'
    | 'advance'
    | 'station-drop'
    | 'problem'
    | 'end-evidence'
    | 'submit'
    | 'review';
  /** Position along the run's path, 0 at start to 1 at end. */
  progress: number;
  stationCode?: string;
  note: string;
  evidenceId?: ID;
}

// ---------------------------------------------------------------------------
// Plan sheets (supporting contract for the plan viewer)
// ---------------------------------------------------------------------------

export interface PlanSheet {
  id: ID;
  projectId: ID;
  code: string;
  title: string;
  runIds: ID[];
  /** Matchline neighbors, by sheet id. */
  prevSheetId?: ID;
  nextSheetId?: ID;
}

export interface SheetPin {
  id: ID;
  sheetId: ID;
  /** Sheet coordinate space (0–1000 x, 0–700 y). */
  x: number;
  y: number;
  kind: EvidenceKind | 'matchline' | 'callout';
  label: string;
  evidenceId?: ID;
  targetSheetId?: ID;
}

// ---------------------------------------------------------------------------
// Closeout
// ---------------------------------------------------------------------------

export interface MissingEvidence {
  runId: ID;
  kind: EvidenceKind | 'ticket' | 'bore-log' | 'redline';
  description: string;
}

export interface RunReadiness {
  runId: ID;
  /** 0–100. */
  score: number;
  missing: MissingEvidence[];
  /** Issue ids currently blocking this run. */
  blockedBy: ID[];
}

export interface CloseoutReadiness {
  projectId: ID;
  /** 0–100 project-wide score. */
  score: number;
  updatedAt: ISODate;
  runsReady: ID[];
  runsBlocked: ID[];
  runsInProgress: ID[];
  missing: MissingEvidence[];
  runs: RunReadiness[];
}

export interface PacketSection {
  id: ID;
  title: string;
  kind:
    | 'cover'
    | 'as-builts'
    | 'redlines'
    | 'bore-logs'
    | 'photos'
    | 'tickets'
    | 'daily-logs'
    | 'quantities';
  itemCount: number;
  included: boolean;
  ready: boolean;
}

export interface CloseoutPacket {
  id: ID;
  projectId: ID;
  name: string;
  status: 'draft' | 'assembling' | 'ready' | 'submitted' | 'accepted';
  sections: PacketSection[];
  generatedAt?: ISODate;
}

// ---------------------------------------------------------------------------
// Sync (mobile offline-first)
// ---------------------------------------------------------------------------

export interface SyncState {
  state: 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncAt?: ISODate;
  pendingPhotos: number;
  pendingEvidence: number;
  pendingTickets: number;
}
