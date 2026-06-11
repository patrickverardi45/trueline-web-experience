import type {
  Crew,
  EvidenceItem,
  FieldPhoto,
  RedlinePath,
  RedlinePlaybackStep,
  Run,
  RunReadiness,
} from '@/contracts';

/** Everything the Hero Map needs for one run, prefetched server-side. */
export interface MapRunBundle {
  run: Run;
  path: RedlinePath;
  evidence: EvidenceItem[];
  photos: FieldPhoto[];
  steps: RedlinePlaybackStep[];
  readiness?: RunReadiness;
  crew?: Crew;
}
