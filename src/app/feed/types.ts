// Serializable feed item shape passed from the server page to the client
// FeedView. Evidence captures and daily logs flatten into one timeline.

import type { EvidenceKind, GeoPoint, QuantityLine } from '@/contracts';

export type FeedKind = EvidenceKind | 'log';

export interface FeedPhotoInfo {
  id: string;
  caption?: string;
  stationCode?: string;
}

export interface FeedSource {
  refId: string;
  label: string;
}

export interface FeedItem {
  id: string;
  kind: FeedKind;
  /** ISO timestamp used for ordering. Daily logs sort at 17:00 field time. */
  at: string;
  /** YYYY-MM-DD in field-local time, for day grouping. */
  dayKey: string;
  title: string;
  projectId: string;
  projectName: string;
  runName?: string;
  crewName: string;
  stationCode?: string;
  gps?: GeoPoint;
  photos: FeedPhotoInfo[];
  sources: FeedSource[];
  note?: string;
  /** Daily-log fields. */
  weather?: string;
  summary?: string;
  quantities?: QuantityLine[];
}

export interface ProjectOption {
  id: string;
  name: string;
}
