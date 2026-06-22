// Web-local identity scaffold for the static internal-demo v2 reviewer bundle.
// These are not production customer records and carry no placement claim.

import type { Project, Run } from '@/contracts';

import reviewerBundleFixture from '../fixtures/reviewer_bundle.v1.json';

const INTERNAL_DEMO_PROJECT_ID = 'demo-project-internal';

const FIXTURE_TIMESTAMP = '2026-06-12T00:00:00-05:00';

function sourceBoreIds(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid internal-demo fixture source: reviewer bundle root');
  }
  const bundle = (value as Record<string, unknown>).bundle;
  if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) {
    throw new Error('Invalid internal-demo fixture source: reviewer bundle');
  }
  const payloads = (bundle as Record<string, unknown>).payloads;
  if (!Array.isArray(payloads)) {
    throw new Error('Invalid internal-demo fixture source: reviewer payloads');
  }

  const ids = payloads.map((payload, index) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error(`Invalid internal-demo fixture source: payloads[${index}]`);
    }
    const boreId = (payload as Record<string, unknown>).bore_id;
    if (typeof boreId !== 'string' || boreId.length === 0) {
      throw new Error(`Invalid internal-demo fixture source: payloads[${index}].bore_id`);
    }
    return boreId;
  });

  if (new Set(ids).size !== ids.length) {
    throw new Error('Invalid internal-demo fixture source: duplicate bore_id');
  }
  return ids;
}

const internalDemoSourceBoreIds = sourceBoreIds(reviewerBundleFixture);

export const internalDemoRuns: Run[] = internalDemoSourceBoreIds.map((sourceBoreId) => ({
  id: `demo-run-${sourceBoreId}`,
  projectId: INTERNAL_DEMO_PROJECT_ID,
  name: `Internal demo ${sourceBoreId}`,
  fromStationCode: 'Source pending',
  toStationCode: 'Source pending',
  lengthFt: 0,
  placedFt: 0,
  method: 'bore',
  status: 'missing-evidence',
  lastActivityAt: FIXTURE_TIMESTAMP,
  segmentIds: [],
  planSheetIds: [],
  boreLogRef: {
    type: 'bore-log',
    refId: sourceBoreId,
    label: `v2 source bore ${sourceBoreId}`,
  },
  evidence: {
    hasStart: false,
    hasEnd: false,
    problemCount: 0,
    stationDropCount: 0,
    requiredCount: 2,
    capturedCount: 0,
  },
}));

/** Demo-only project container for honest local v2 bore-to-run identity mapping. */
export const internalDemoProject: Project = {
  id: INTERNAL_DEMO_PROJECT_ID,
  name: 'Internal demo project',
  client: 'Offline fixture — not a customer record',
  location: 'Internal demo (offline)',
  status: 'on-hold',
  startDate: '2026-06-12',
  targetDate: '2026-06-12',
  footagePlannedFt: 0,
  footagePlacedFt: 0,
  runIds: internalDemoRuns.map((run) => run.id),
  crewIds: [],
  readinessScore: 0,
  openIssueCount: 0,
  lastActivityAt: FIXTURE_TIMESTAMP,
};
