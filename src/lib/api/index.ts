import { mockApi } from './client';
import { reviewerReads } from './reviewerReads';
import { createLiveV2ProductApi, productApiEnabled } from './liveV2Product';
import type { TrueLineApi } from './types';

// Product mode reads the real v2 product API (reviewer reads are shared); offline/demo mode uses the
// fixture client. The choice is an explicit env decision — product mode NEVER silently falls back to
// mock portfolio truth.
const liveV2ProductApi: TrueLineApi = createLiveV2ProductApi(reviewerReads);

/**
 * The app-wide API instance. Swapping the read source is this one decision:
 * NEXT_PUBLIC_TL2_PRODUCT_API=1 -> the live v2 product client; otherwise the offline fixture client.
 * Pages and components stay untouched.
 */
export const api: TrueLineApi = productApiEnabled() ? liveV2ProductApi : mockApi;

/** The project the offline demo experience focuses on. */
export const FLAGSHIP_PROJECT_ID = 'p-cedar-ridge';

export type { TrueLineApi } from './types';
export type {
  EngineCard,
  EngineLane,
  EngineReviewBundle,
  EngineReviewStatus,
} from './adapters/v2Bundle';
export type {
  EngineArtifactCard,
  EngineArtifactManifest,
  EngineArtifactRef,
} from './adapters/v2Artifacts';
export type {
  RunAssemblyCard,
  RunAssemblyContinuationClass,
  RunAssemblyReview,
} from './adapters/v2RunAssembly';
export type {
  RedlineArtifactRef,
  RedlineLogEntry,
  RedlineManifestView,
} from './adapters/v2RedlineManifest';
