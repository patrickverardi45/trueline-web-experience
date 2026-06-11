// The API surface the product consumes. The mock client implements this
// today; a real backend client implements the same interface later. UI code
// imports `api` from '@/lib/api' and never reaches into fixtures directly.

import type {
  CloseoutPacket,
  CloseoutReadiness,
  Crew,
  DailyLog,
  EvidenceItem,
  FieldPhoto,
  FieldTicket,
  ID,
  Issue,
  PlanSheet,
  Project,
  RedlinePath,
  RedlinePlaybackStep,
  Run,
  Segment,
  SheetPin,
  Station,
  SyncState,
} from '@/contracts';

export interface TrueLineApi {
  projects: {
    list(): Promise<Project[]>;
    get(id: ID): Promise<Project | undefined>;
  };
  crews: {
    list(): Promise<Crew[]>;
    get(id: ID): Promise<Crew | undefined>;
  };
  runs: {
    byProject(projectId: ID): Promise<Run[]>;
    get(id: ID): Promise<Run | undefined>;
  };
  segments: {
    byRun(runId: ID): Promise<Segment[]>;
  };
  stations: {
    byRun(runId: ID): Promise<Station[]>;
  };
  evidence: {
    byRun(runId: ID): Promise<EvidenceItem[]>;
    byProject(projectId: ID): Promise<EvidenceItem[]>;
    get(id: ID): Promise<EvidenceItem | undefined>;
  };
  photos: {
    byEvidence(evidenceId: ID): Promise<FieldPhoto[]>;
  };
  tickets: {
    byRun(runId: ID): Promise<FieldTicket[]>;
    byProject(projectId: ID): Promise<FieldTicket[]>;
  };
  dailyLogs: {
    byProject(projectId: ID): Promise<DailyLog[]>;
  };
  issues: {
    byProject(projectId: ID): Promise<Issue[]>;
  };
  redlines: {
    mapPaths(projectId: ID): Promise<RedlinePath[]>;
    sheetPaths(sheetId: ID): Promise<RedlinePath[]>;
  };
  playback: {
    byRun(runId: ID): Promise<RedlinePlaybackStep[]>;
  };
  sheets: {
    byProject(projectId: ID): Promise<PlanSheet[]>;
    get(id: ID): Promise<PlanSheet | undefined>;
    pins(sheetId: ID): Promise<SheetPin[]>;
  };
  closeout: {
    readiness(projectId: ID): Promise<CloseoutReadiness | undefined>;
    packet(projectId: ID): Promise<CloseoutPacket | undefined>;
  };
  sync: {
    state(): Promise<SyncState>;
  };
}
