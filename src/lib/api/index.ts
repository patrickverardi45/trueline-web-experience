import { mockApi } from './client';
import type { TrueLineApi } from './types';

/**
 * The app-wide API instance. Swapping in the real backend later means
 * changing this one assignment — pages and components stay untouched.
 */
export const api: TrueLineApi = mockApi;

/** The project the demo experience focuses on. */
export const FLAGSHIP_PROJECT_ID = 'p-cedar-ridge';

export type { TrueLineApi } from './types';
