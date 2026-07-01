// Zero-dependency checks for the source-backed readiness / REVIEW-candidate adapter + status formatter (repo
// convention: plain-Node script, like check-live-product-read.mjs; no test-runner dependency).
// Run: `node scripts/check-review-readiness.mjs`.
//
// Exercises the pure compose + path/header building + no-mock-fallback of reviewReadiness.ts, and the
// all-statuses formatter of reviewReadinessStatus.ts. The imported .ts modules are JSON-free (self-contained),
// so Node strips their types and runs them directly.

import {
  composeReviewReadiness,
  fetchReviewReadiness,
  fetchReviewReadinessArtifactBlob,
  runReviewReadiness,
} from '../src/lib/api/reviewReadiness.ts';
import {
  KNOWN_READINESS_STATUSES,
  presentNextInput,
  presentReadinessStatus,
  REVIEW_CANDIDATE_LABEL,
} from '../src/lib/reviewReadinessStatus.ts';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}`);
  }
}

function setEnv(env) {
  for (const key of [
    'NEXT_PUBLIC_TL2_PRODUCT_API',
    'NEXT_PUBLIC_TL2_API_BASE',
    'NEXT_PUBLIC_TL2_TENANT',
    'NEXT_PUBLIC_TL2_JOB_ID',
  ]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
}

const realFetch = globalThis.fetch;

// A READY result (the shape the run/get endpoints return, with served artifact URLs + a candidate).
const READY_DOC = {
  is_review_candidate: true, performs_auto: false, performs_placement: false, promotes_status: false,
  readiness_status: 'READY_FOR_REVIEW_REDLINE', stage: 'READY', ready: true,
  recommended_next_input: null, draws_anything: false,
  review_candidate_status: 'REVIEW_CANDIDATE_READY', generated_visual: true, refusal_reason: null,
  candidate: {
    span_id: 'span-1', start_station: '0+00', end_station: '2+99',
    source_file: 'bore_log.xlsx', source_citation: 'row 1', source_kind: 'BORE_LOG', confidence: 0.9,
    candidate_status: 'REVIEW_CANDIDATE_READY',
    artifact_before: '/v2/product/jobs/job-x/review-readiness/artifacts/before.png',
    artifact_after: '/v2/product/jobs/job-x/review-readiness/artifacts/after.png',
    stroke_rgb: [220, 25, 25], evidence_chain: ['span', 'anchor', 'route'],
    is_auto: false, is_final_placement: false, is_promotion: false,
  },
  artifacts: [
    { role: 'before', filename: 'before.png', url: '/v2/product/jobs/job-x/review-readiness/artifacts/before.png' },
    { role: 'after', filename: 'after.png', url: '/v2/product/jobs/job-x/review-readiness/artifacts/after.png' },
  ],
  span_rows: [{
    span_id: 'span-1', start_station: '0+00', end_station: '2+99', footage: 299,
    start_structure: 'HH', end_structure: 'HH', source_file: 'bore_log.xlsx', source_page: 1,
    source_kind: 'BORE_LOG', confidence: 0.9, citation: 'row 1',
  }],
  anchor_bindings: [{
    span_id: 'span-1', start_station: '0+00', end_station: '2+99', bound: true, refusal: null,
    start_anchor: { status: 'ANCHOR_RESOLVED_TO_SYMBOL', method: 'symbol', xy: [1, 2] },
    end_anchor: { status: 'ANCHOR_RESOLVED_TO_SYMBOL', method: 'symbol', xy: [3, 4] },
  }],
  route_verifications: [{
    span_id: 'span-1', route_ready: true, evaluated: true, refusal: null,
    route_observer_status: 'PLAN_VIEW_RUN_CONNECTED', route_isolation_status: 'ROUTE_LINEWORK_ISOLATED',
    route_run_status: 'OK', main_run_status: 'MAIN_ROUTE_DISCRIMINATED', gap_bridge_status: null,
  }],
  notice: 'REVIEW candidate — human-reviewable; NOT AUTO, NOT final placement, NOT a status promotion',
  detail: {},
};

// A refusal result (no spine input): no candidate, no artifacts, a named blocker + next step.
const REFUSAL_DOC = {
  is_review_candidate: true, performs_auto: false, performs_placement: false, promotes_status: false,
  readiness_status: 'NO_SPINE_INPUT', stage: null, ready: false,
  recommended_next_input: 'upload a plan PDF and a bore log / span table', draws_anything: false,
  review_candidate_status: 'REVIEW_CANDIDATE_REFUSED', generated_visual: false,
  refusal_reason: 'no plan / bore-log / route upload with a stored payload to evaluate',
  candidate: null, artifacts: [], span_rows: [], anchor_bindings: [], route_verifications: [],
  notice: 'REVIEW candidate — human-reviewable; NOT AUTO, NOT final placement, NOT a status promotion', detail: {},
};

async function run() {
  // --- compose: a READY result parses spans/anchors/routes/artifacts/candidate + honesty invariants -----
  const ready = composeReviewReadiness(READY_DOC);
  check('READY: status + ready flag', ready.readinessStatus === 'READY_FOR_REVIEW_REDLINE' && ready.ready === true);
  check('READY: span row parsed (stations, footage, source, citation)',
    ready.spanRows.length === 1 && ready.spanRows[0].startStation === '0+00'
      && ready.spanRows[0].endStation === '2+99' && ready.spanRows[0].footage === 299
      && ready.spanRows[0].sourceFile === 'bore_log.xlsx' && ready.spanRows[0].citation === 'row 1');
  check('READY: anchor binding parsed (bound + endpoint statuses)',
    ready.anchorBindings.length === 1 && ready.anchorBindings[0].bound === true
      && ready.anchorBindings[0].startAnchor.status === 'ANCHOR_RESOLVED_TO_SYMBOL'
      && ready.anchorBindings[0].endAnchor.status === 'ANCHOR_RESOLVED_TO_SYMBOL');
  check('READY: route verification parsed (route_ready + statuses)',
    ready.routeVerifications.length === 1 && ready.routeVerifications[0].routeReady === true
      && ready.routeVerifications[0].mainRunStatus === 'MAIN_ROUTE_DISCRIMINATED');
  check('READY: artifacts parsed (before/after served urls)',
    ready.artifacts.length === 2 && ready.artifacts[0].role === 'before'
      && ready.artifacts[0].url === '/v2/product/jobs/job-x/review-readiness/artifacts/before.png'
      && ready.artifacts[1].role === 'after');
  check('READY: candidate present + honesty invariants are false (never AUTO/final/promotion)',
    ready.candidate !== null && ready.candidate.isAuto === false
      && ready.candidate.isFinalPlacement === false && ready.candidate.isPromotion === false
      && ready.candidate.candidateStatus === 'REVIEW_CANDIDATE_READY');
  check('READY: lane invariants false + generated visual true',
    ready.performsAuto === false && ready.performsPlacement === false && ready.promotesStatus === false
      && ready.drawsAnything === false && ready.generatedVisual === true);

  // --- compose: a refusal has NO candidate + NO artifacts, but a named blocker + next step --------------
  const refusal = composeReviewReadiness(REFUSAL_DOC);
  check('REFUSAL: no candidate, no artifacts, not ready',
    refusal.candidate === null && refusal.artifacts.length === 0 && refusal.ready === false);
  check('REFUSAL: named refusal reason + spans empty',
    refusal.refusalReason === 'no plan / bore-log / route upload with a stored payload to evaluate'
      && refusal.spanRows.length === 0);

  // --- compose: a malformed/empty 200 body degrades honestly (empty view, never throws) ----------------
  const empty = composeReviewReadiness({});
  check('EMPTY: honest-empty view (no candidate, empty arrays, no throw)',
    empty.candidate === null && empty.artifacts.length === 0 && empty.spanRows.length === 0
      && empty.readinessStatus === '');

  // --- status formatter: every one of the 11 statuses is mapped (never the fallback) -------------------
  check('formatter: 11 known statuses', KNOWN_READINESS_STATUSES.length === 11);
  const requiredStatuses = [
    'READY_FOR_REVIEW_REDLINE', 'MISSING_BORE_SPAN_SOURCE', 'NO_SOURCE_CONFIRMED_SPAN',
    'ANCHOR_BLOCKED', 'ROUTE_BLOCKED', 'NO_SPINE_INPUT', 'SPAN_SOURCE_FOUND',
    'PACKAGE_RECOGNIZED_CONTROL', 'PACKAGE_UNUSABLE_OCR_REQUIRED', 'KEEP_BLOCKED', 'SOURCE_UNRESOLVED',
  ];
  const validTones = new Set(['ready', 'blocked', 'progress', 'control', 'neutral']);
  let allMapped = true;
  for (const s of requiredStatuses) {
    const p = presentReadinessStatus(s);
    if (p.label === 'Unrecognized status' || !p.plainEnglish || !validTones.has(p.tone)) allMapped = false;
  }
  check('formatter: all 11 required statuses map to a real label/tone/copy', allMapped);
  check('formatter: READY uses the ready tone', presentReadinessStatus('READY_FOR_REVIEW_REDLINE').tone === 'ready');
  check('formatter: recognized-control uses the control tone',
    presentReadinessStatus('PACKAGE_RECOGNIZED_CONTROL').tone === 'control');
  check('formatter: unknown status -> safe fallback', presentReadinessStatus('ZZZ_NOPE').label === 'Unrecognized status');

  // --- next-input formatter ----------------------------------------------------------------------------
  check('next-input: known code -> plain english',
    presentNextInput('BORE_LOG_OR_BORE_SCHEDULE_NAMING_ONE_SPAN').includes('bore log'));
  check('next-input: null passes through', presentNextInput(null) === null);
  check('next-input: unknown code humanized (never dropped)', presentNextInput('SOME_NEW_CODE') === 'some new code');

  // --- fixed REVIEW-candidate label is honest (never AUTO/final) ----------------------------------------
  check('label: REVIEW candidate label is not AUTO/final',
    REVIEW_CANDIDATE_LABEL.includes('REVIEW candidate') && REVIEW_CANDIDATE_LABEL.includes('not AUTO')
      && REVIEW_CANDIDATE_LABEL.includes('not final placement'));

  // --- path/header building (capture a stubbed fetch) --------------------------------------------------
  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000/',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  let seenUrl = '';
  let seenInit = {};
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenInit = init || {};
    return { ok: true, json: async () => READY_DOC };
  };

  await runReviewReadiness('job-x');
  check('runReviewReadiness POSTs run path (?plan_sheet=1) + strips trailing slash + tenant header',
    seenUrl === 'http://localhost:8000/v2/product/jobs/job-x/review-readiness/run?plan_sheet=1'
      && seenInit.method === 'POST' && seenInit.headers['X-TL-Tenant'] === 'seed-project'
      && seenInit.headers['X-TL-Session'] === 'web-readonly');

  await runReviewReadiness('job-x', 3);
  check('runReviewReadiness carries an explicit plan_sheet',
    seenUrl === 'http://localhost:8000/v2/product/jobs/job-x/review-readiness/run?plan_sheet=3');

  await runReviewReadiness('job-x', 0);
  check('runReviewReadiness clamps an invalid plan_sheet to 1',
    seenUrl === 'http://localhost:8000/v2/product/jobs/job-x/review-readiness/run?plan_sheet=1');

  await fetchReviewReadiness('job-x');
  check('fetchReviewReadiness GETs review-readiness path + tenant header',
    seenUrl === 'http://localhost:8000/v2/product/jobs/job-x/review-readiness'
      && seenInit.headers['X-TL-Tenant'] === 'seed-project');

  const fakePng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
  let blobUrl = '';
  let blobHeaders = {};
  globalThis.fetch = async (url, init) => {
    blobUrl = String(url);
    blobHeaders = (init && init.headers) || {};
    return { ok: true, blob: async () => fakePng };
  };
  const blob = await fetchReviewReadinessArtifactBlob('/v2/product/jobs/job-x/review-readiness/artifacts/after.png');
  check('fetchReviewReadinessArtifactBlob GETs the served path + headers + Blob',
    blobUrl === 'http://localhost:8000/v2/product/jobs/job-x/review-readiness/artifacts/after.png'
      && blobHeaders['X-TL-Tenant'] === 'seed-project' && blobHeaders['X-TL-Session'] === 'web-readonly'
      && blob instanceof Blob && blob.type === 'image/png');

  // --- no mock fallback: a non-OK live read/run throws; a 404 carries "HTTP 404" (the panel's not-run cue)
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), blob: async () => fakePng });
  let notRunMessage = '';
  try {
    await fetchReviewReadiness('job-x');
  } catch (e) {
    notRunMessage = e instanceof Error ? e.message : '';
  }
  check('fetchReviewReadiness throws on 404 with an HTTP 404 message (drives not-run state)',
    /HTTP 404/.test(notRunMessage));

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), blob: async () => fakePng });
  let threwCount = 0;
  for (const fn of [
    () => runReviewReadiness('job-x'),
    () => fetchReviewReadiness('job-x'),
    () => fetchReviewReadinessArtifactBlob('/v2/product/jobs/job-x/review-readiness/artifacts/after.png'),
  ]) {
    try { await fn(); } catch { threwCount += 1; }
  }
  check('readiness run/read/artifact throw on non-OK (no mock fallback)', threwCount === 3);

  // --- missing env config throws a config error (never mock) -------------------------------------------
  setEnv({ NEXT_PUBLIC_TL2_PRODUCT_API: '1' });
  let threwConfig = false;
  try {
    await fetchReviewReadiness('job-x');
  } catch {
    threwConfig = true;
  }
  check('missing NEXT_PUBLIC_TL2_API_BASE throws config error', threwConfig === true);

  globalThis.fetch = realFetch;
  setEnv({});

  if (failures > 0) {
    console.error(`\nreview-readiness checks FAILED: ${failures} failure(s).`);
    process.exitCode = 1;
  } else {
    console.log('\nreview-readiness checks passed.');
  }
}

await run();
