// Web-local identity scaffold for the static Brenham v2 reviewer bundle.
// These are not production customer records and carry no placement claim.

import type { Project, Run } from '@/contracts';

import reviewerBundleFixture from '../fixtures/reviewer_bundle.v1.json';

export const BRENHAM_FIXTURE_PROJECT_ID = 'p-brenham-ph5';

const FIXTURE_TIMESTAMP = '2026-06-12T00:00:00-05:00';

function sourceBoreIds(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid Brenham fixture source: reviewer bundle root');
  }
  const bundle = (value as Record<string, unknown>).bundle;
  if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) {
    throw new Error('Invalid Brenham fixture source: reviewer bundle');
  }
  const payloads = (bundle as Record<string, unknown>).payloads;
  if (!Array.isArray(payloads)) {
    throw new Error('Invalid Brenham fixture source: reviewer payloads');
  }

  const ids = payloads.map((payload, index) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error(`Invalid Brenham fixture source: payloads[${index}]`);
    }
    const boreId = (payload as Record<string, unknown>).bore_id;
    if (typeof boreId !== 'string' || boreId.length === 0) {
      throw new Error(`Invalid Brenham fixture source: payloads[${index}].bore_id`);
    }
    return boreId;
  });

  if (new Set(ids).size !== ids.length) {
    throw new Error('Invalid Brenham fixture source: duplicate bore_id');
  }
  return ids;
}

const brenhamSourceBoreIds = sourceBoreIds(reviewerBundleFixture);

export const brenhamRuns: Run[] = brenhamSourceBoreIds.map((sourceBoreId) => ({
  id: `r-brenham-ph5-${sourceBoreId}`,
  projectId: BRENHAM_FIXTURE_PROJECT_ID,
  name: `Brenham PH5 ${sourceBoreId}`,
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

export const brenhamProject: Project = {
  id: BRENHAM_FIXTURE_PROJECT_ID,
  name: 'Brenham PH5',
  client: 'Local fixture - not a customer record',
  location: 'Brenham, TX',
  status: 'on-hold',
  startDate: '2026-06-12',
  targetDate: '2026-06-12',
  footagePlannedFt: 0,
  footagePlacedFt: 0,
  runIds: brenhamRuns.map((run) => run.id),
  crewIds: [],
  readinessScore: 0,
  openIssueCount: 0,
  lastActivityAt: FIXTURE_TIMESTAMP,
};
