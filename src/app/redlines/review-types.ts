// Serializable shapes passed from the /redlines server page into the client
// review queue. Built from contracts only — no engine assumptions.

import type {
  ConstructionMethod,
  EvidenceSummary,
  ISODate,
  QuantityLine,
  RedlinePath,
  ReviewStatus,
} from '@/contracts';

/** One run's redline submission, assembled per-run on the server. */
export interface ReviewItem {
  runId: string;
  runName: string;
  fromStationCode: string;
  toStationCode: string;
  lengthFt: number;
  placedFt: number;
  method: ConstructionMethod;
  sheetCode: string;
  sheetTitle: string;
  crewName: string;
  crewLead: string;
  ticketId: string;
  ticketDate: ISODate;
  reviewStatus: ReviewStatus;
  quantities: QuantityLine[];
  ticketNotes: string;
  evidence: EvidenceSummary;
  /** The run's redline on its primary plan sheet, if drawn. */
  redline: RedlinePath | null;
}

/** Local-only mock decision state — no backend mutation exists yet. */
export type MockDecision = 'approved' | 'changes-requested';
