// Mock implementation of the TrueLine API contract. All reads come from
// local fixtures. No network, no engine coupling.

import type { TrueLineApi } from './types';
import {
  crews,
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
