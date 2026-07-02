// Zero-dependency checks for the field-evidence read adapter + presentation copy (repo convention:
// plain-Node script like check-review-readiness.mjs; no test-runner dependency).
// Run: `node scripts/check-field-evidence-read.mjs`.
//
// Exercises the pure compose of src/lib/api/fieldEvidence.ts (mocked fetch: path/header building,
// no-mock-fallback, 404 signaling) and the plain-English presentation of src/lib/fieldEvidenceCopy.ts
// (statuses, missing-evidence derivation, vocabulary labels, no raw codes / no AUTO language).

import {
  composeFieldEvidenceList,
  composeFieldEvidencePackage,
  fetchFieldEvidenceList,
} from '../src/lib/api/fieldEvidence.ts';
import {
  FIELD_EVIDENCE_SUPPORT_LINE,
  missingEvidenceSummary,
  photoKindLabel,
  presentFieldEvidenceStatus,
  problemTypeLabel,
  readingMethodLabel,
} from '../src/lib/fieldEvidenceCopy.ts';

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name}`);
  }
}

const realFetch = globalThis.fetch;
process.env.NEXT_PUBLIC_TL2_API_BASE = 'http://127.0.0.1:8100';
process.env.NEXT_PUBLIC_TL2_TENANT = 'tenant-check';

// A submitted package as the backend stores it (photos bound, one documented problem, 4 readings on a
// deliberately non-exact ~50 ft cadence).
const SUBMITTED_PKG = {
  record_format: 'trueline-field-evidence-1',
  segment_id: 'seg-001',
  status: 'SUBMITTED_FOR_REVIEW',
  start_station: '0+00',
  end_station: '1+50',
  reviewed_bore_log_id: null,
  source_span_ref: null,
  notes: 'generic check package',
  photos: [
    { evidence_id: 'ph-start', kind: 'START_STATION', upload_id: 'up-1', station: '0+00' },
    { evidence_id: 'ph-end', kind: 'END_STATION', upload_id: 'up-2', station: '1+50' },
    { evidence_id: 'ph-prob', kind: 'PROBLEM_AREA', upload_id: 'up-3', offset_ft: 47 },
    { evidence_id: 'ph-opt', kind: 'OPTIONAL_CONTEXT', note: 'context only, unbound', upload_id: null },
  ],
  problems: [
    { problem_id: 'prob-1', type: 'utility_conflict', station: '0+47', offset_ft: 47, note: 'crossing line', photo_evidence_ids: ['ph-prob'] },
  ],
  readings: [
    { reading_id: 'rd-1', offset_ft: 0, depth_ft: 4.0, method: 'walkover_locator', problem: false },
    { reading_id: 'rd-2', offset_ft: 47, depth_ft: 6.5, method: 'walkover_locator', problem: false },
    { reading_id: 'rd-3', offset_ft: 103.5, depth_ft: 7.2, method: 'walkover_locator', problem: true, note: 'at the conflict' },
    { reading_id: 'rd-4', offset_ft: 149, depth_ft: 4.1, method: 'walkover_locator', problem: false },
  ],
  submitted_at: '2026-07-01T20:00:00+00:00',
  updated_at: '2026-07-01T20:00:00+00:00',
  review_support_only: true,
  creates_redline: false,
  performs_auto: false,
  performs_placement: false,
};

console.log('— compose: submitted package —');
const pkg = composeFieldEvidencePackage(SUBMITTED_PKG);
check('segment + stations mapped', pkg.segmentId === 'seg-001' && pkg.startStation === '0+00' && pkg.endStation === '1+50');
check('photos mapped with binding truth', pkg.photos.length === 4
  && pkg.photos[0].uploadId === 'up-1' && pkg.photos[3].uploadId === null);
check('problem mapped with photo refs', pkg.problems[0].type === 'utility_conflict'
  && pkg.problems[0].photoEvidenceIds.join(',') === 'ph-prob');
check('non-exact ~50 ft readings preserved on offset_ft axis',
  pkg.readings.map((r) => r.offsetFt).join(',') === '0,47,103.5,149');
check('doctrine flags surfaced', pkg.reviewSupportOnly === true && pkg.createsRedline === false
  && pkg.performsAuto === false && pkg.performsPlacement === false);
check('record format kept for diagnostics', pkg.recordFormat === 'trueline-field-evidence-1');

console.log('— compose: defensive/empty —');
check('empty list response → []', composeFieldEvidenceList({ field_evidence: [] }).length === 0);
check('malformed response → [] (never invented)', composeFieldEvidenceList({ nope: 1 }).length === 0);
const emptyPkg = composeFieldEvidencePackage({});
check('empty package coerces to honest nulls', emptyPkg.startStation === null && emptyPkg.photos.length === 0);

console.log('— presentation: statuses are plain English —');
const submitted = presentFieldEvidenceStatus(pkg);
check('submitted package presents as Submitted for review', submitted.label === 'Submitted for review' && submitted.tone === 'ready');
check('submitted package has nothing missing', missingEvidenceSummary(pkg).length === 0);

const draftMissing = composeFieldEvidencePackage({
  ...SUBMITTED_PKG,
  status: 'DRAFT',
  photos: [
    { evidence_id: 'ph-start', kind: 'START_STATION', upload_id: 'up-1' },
    // end slot claimed but UNBOUND — honestly missing
    { evidence_id: 'ph-end', kind: 'END_STATION', upload_id: null },
    // problem photo slot entirely absent
  ],
});
const missingPresent = presentFieldEvidenceStatus(draftMissing);
const missingLines = missingEvidenceSummary(draftMissing);
check('draft with unbound/missing slots presents as Missing required evidence',
  missingPresent.label === 'Missing required evidence' && missingPresent.tone === 'blocked');
check('missing summary names end photo + problem photo (start bound)',
  missingLines.length === 2
  && missingLines[0].includes('End station photo')
  && missingLines[1].toLowerCase().includes('problem area'));

const draftComplete = composeFieldEvidencePackage({ ...SUBMITTED_PKG, status: 'DRAFT' });
check('complete draft presents as Draft — not yet submitted',
  presentFieldEvidenceStatus(draftComplete).label === 'Draft — not yet submitted');

console.log('— presentation: vocabulary labels (no raw codes) —');
const TYPES = ['obstruction', 'utility_conflict', 'damage', 'station_mismatch', 'route_deviation', 'unclear_endpoint', 'blocked_access', 'other'];
check('every problem type has a label without underscores', TYPES.every((t) => {
  const label = problemTypeLabel(t);
  return label.length > 3 && !label.includes('_');
}));
check('unknown problem type is humanized, never raw', problemTypeLabel('sink_hole') === 'Sink hole');
check('reading methods labeled', readingMethodLabel('walkover_locator') === 'Walkover locator' && readingMethodLabel(null) === null);
check('photo kinds labeled', photoKindLabel('START_STATION') === 'Start station photo'
  && photoKindLabel('OPTIONAL_CONTEXT') === 'Context photo' && photoKindLabel('WEIRD') === 'Photo');

console.log('— doctrine copy —');
const allCopy = [
  FIELD_EVIDENCE_SUPPORT_LINE,
  submitted.label, submitted.plainEnglish,
  missingPresent.label, missingPresent.plainEnglish,
  ...missingLines,
  ...TYPES.map(problemTypeLabel),
];
check('support line states review-support / no final placement',
  FIELD_EVIDENCE_SUPPORT_LINE.includes('supports office review') && FIELD_EVIDENCE_SUPPORT_LINE.includes('does not create final placement'));
check('no raw backend status codes in copy', allCopy.every((c) => !/SUBMITTED_FOR_REVIEW|MISSING_START_STATION_PHOTO|MISSING_END_STATION_PHOTO|PROBLEM_PHOTO_REQUIRED|BLOCKED_MISSING_REQUIRED_EVIDENCE/.test(c)));
check('no AUTO/automatic-final language in copy', allCopy.every((c) => !/\bAUTO\b|automatic placement|final placement/.test(c) || c === FIELD_EVIDENCE_SUPPORT_LINE));

console.log('— live read plumbing (mocked fetch) —');
let seen = null;
globalThis.fetch = async (url, init) => {
  seen = { url: String(url), headers: init.headers, method: init.method };
  return { ok: true, status: 200, json: async () => ({ field_evidence: [SUBMITTED_PKG] }) };
};
const listed = await fetchFieldEvidenceList('job-x');
check('list fetch hits the field-evidence route with identity headers',
  seen.url === 'http://127.0.0.1:8100/v2/product/jobs/job-x/field-evidence'
  && seen.method === 'GET'
  && seen.headers['X-TL-Tenant'] === 'tenant-check'
  && seen.headers['X-TL-Session'] === 'web-readonly');
check('list fetch composes typed packages', listed.length === 1 && listed[0].segmentId === 'seg-001');

globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ detail: 'Not Found' }) });
let notEnabled = false;
try {
  await fetchFieldEvidenceList('job-x');
} catch (e) {
  notEnabled = /HTTP 404/.test(e.message);
}
check('404 throws an HTTP-404-tagged error (calm not-enabled signal, never mock)', notEnabled);

globalThis.fetch = async () => { throw new Error('network down'); };
let threw = false;
try {
  await fetchFieldEvidenceList('job-x');
} catch {
  threw = true;
}
check('network failure throws (no mock fallback)', threw);

globalThis.fetch = realFetch;

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('field-evidence read checks passed.');
