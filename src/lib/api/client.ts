// Fixture-default implementation of the TrueLine API contract. Reviewer reads
// opt into the local v2 API only when NEXT_PUBLIC_TL2_API_BASE is configured.

import type { TrueLineApi } from './types';
import { adaptV2ReviewerBundle } from './adapters/v2Bundle';
import { adaptV2DesignStrokeArtifacts } from './adapters/v2Artifacts';
import reviewerBundleFixture from './fixtures/reviewer_bundle.v1.json';
import designStrokeArtifactsFixture from './fixtures/design_stroke_artifacts.v1.json';
import {
  crews,
  brenhamRuns,
  dailyLogs,
  evidenceItems,
  issues,
  photos,
  projects,
  runs,
  segments,
  stations,
  syncState,
  tickets,
} from './mock/fixtures';
import { mapRedlines } from './mock/geometry';
import { playbackSteps } from './mock/playback';
import { sheetRedlines, sheetPins, sheets } from './mock/sheets';
import { packetsByProject, readinessByProject } from './mock/closeout';

const fixtureEngineReviewBundle = adaptV2ReviewerBundle(reviewerBundleFixture, brenhamRuns);
const fixtureEngineDesignStrokeArtifacts = adaptV2DesignStrokeArtifacts(
  designStrokeArtifactsFixture,
);

function configuredTl2ApiBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_TL2_API_BASE?.trim();
  if (!raw) return null;

  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_TL2_API_BASE must be an HTTP(S) URL');
  }
  return raw.replace(/\/+$/, '');
}

const tl2ApiBase = configuredTl2ApiBase();

async function fetchLiveV2(path: string): Promise<unknown> {
  if (!tl2ApiBase) {
    throw new Error('Live v2 fetch requested without NEXT_PUBLIC_TL2_API_BASE');
  }
  const response = await fetch(`${tl2ApiBase}${path}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Live v2 GET ${path} failed with HTTP ${response.status}`);
  }
  return response.json();
}

export const mockApi: TrueLineApi = {
  projects: {
    list: async () => projects,
    get: async (id) => projects.find((p) => p.id === id),
  },
  crews: {
    list: async () => crews,
    get: async (id) => crews.find((c) => c.id === id),
  },
  runs: {
    byProject: async (projectId) => runs.filter((r) => r.projectId === projectId),
    get: async (id) => runs.find((r) => r.id === id),
  },
  segments: {
    byRun: async (runId) => segments.filter((s) => s.runId === runId),
  },
  stations: {
    byRun: async (runId) => stations.filter((s) => s.runId === runId),
  },
  evidence: {
    byRun: async (runId) => evidenceItems.filter((e) => e.runId === runId),
    byProject: async (projectId) => evidenceItems.filter((e) => e.projectId === projectId),
    get: async (id) => evidenceItems.find((e) => e.id === id),
  },
  photos: {
    byEvidence: async (evidenceId) => photos.filter((p) => p.evidenceItemId === evidenceId),
  },
  tickets: {
    byRun: async (runId) => tickets.filter((t) => t.runId === runId),
    byProject: async (projectId) => tickets.filter((t) => t.projectId === projectId),
  },
  dailyLogs: {
    byProject: async (projectId) => dailyLogs.filter((d) => d.projectId === projectId),
  },
  issues: {
    byProject: async (projectId) => issues.filter((i) => i.projectId === projectId),
  },
  redlines: {
    mapPaths: async (projectId) => {
      const runIds = new Set(runs.filter((r) => r.projectId === projectId).map((r) => r.id));
      return mapRedlines.filter((p) => runIds.has(p.runId));
    },
    sheetPaths: async (sheetId) => sheetRedlines.filter((p) => p.surfaceId === sheetId),
  },
  reviews: {
    engineBundle: async () => {
      if (!tl2ApiBase) return fixtureEngineReviewBundle;
      const value = await fetchLiveV2('/v2/reviewer/bundle?mode=default_baseline');
      return adaptV2ReviewerBundle(value, brenhamRuns);
    },
    engineDesignStrokeArtifacts: async () => {
      if (!tl2ApiBase) return fixtureEngineDesignStrokeArtifacts;
      const value = await fetchLiveV2('/v2/reviewer/design-stroke/manifest');
      return adaptV2DesignStrokeArtifacts(value, { apiBaseUrl: tl2ApiBase });
    },
  },
  playback: {
    byRun: async (runId) =>
      playbackSteps.filter((s) => s.runId === runId).sort((a, b) => a.seq - b.seq),
  },
  sheets: {
    byProject: async (projectId) => sheets.filter((s) => s.projectId === projectId),
    get: async (id) => sheets.find((s) => s.id === id),
    pins: async (sheetId) => sheetPins.filter((p) => p.sheetId === sheetId),
  },
  closeout: {
    readiness: async (projectId) => readinessByProject[projectId],
    packet: async (projectId) => packetsByProject[projectId],
  },
  sync: {
    state: async () => syncState,
  },
};
