import type {
  Crew,
  EvidenceItem,
  FieldPhoto,
  FieldTicket,
  Run,
  RunReadiness,
} from '@/contracts';

/** Plan-sheet source shown at the top of a run's evidence chain. */
export interface SheetSource {
  id: string;
  code: string;
  title: string;
}

/** Everything the Evidence Explorer needs for one run, prefetched server-side. */
export interface EvidenceRunBundle {
  run: Run;
  /** Sorted by capturedAt ascending — the chain renders in capture order. */
  evidence: EvidenceItem[];
  photos: FieldPhoto[];
  ticket: FieldTicket | null;
  readiness: RunReadiness | null;
  crew: Crew | null;
  sheets: SheetSource[];
}
