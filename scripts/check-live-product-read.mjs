// Zero-dependency checks for the live v2 product read adapter (repo convention: plain-Node script,
// like check-contract-parity.mjs; no test-runner dependency). Run: `node scripts/check-live-product-read.mjs`.
//
// Exercises the JSON-free product core: env-gated seam decision, tenant/session headers, no-silent-
// fallback on failure, manifest + job-status composition, and honest-empty product methods. The imported
// .ts module is JSON-free (type-only imports), so Node strips its types and runs it directly.

import {
  productApiEnabled,
  fetchProduct,
  composeRedlineManifestView,
  composeJobStatus,
  composeArtifactList,
  fetchProductArtifactBlob,
  createLiveV2ProductApi,
} from '../src/lib/api/liveV2Product.ts';
import {
  inferUploadKind,
  composeJobSummaries,
  composeJobDetail,
  createProductJob,
  uploadProductFile,
  listProductJobs,
  composeReviewedBoreLog,
  composeReviewQueue,
  createReviewedBoreLog,
  fetchReviewedBoreLog,
  addReviewedRows,
  reviewReviewedRow,
  defineSegmentGroup,
  setGroupingStatus,
  fetchReviewQueue,
  composeEngineHandoffReadiness,
  fetchEngineHandoffReadiness,
  composePlanPageMetadata,
  fetchPlanPageMetadata,
  fetchPlanPageRasterBlob,
  composeSourceAnchorResult,
  createSourceAnchor,
  composeSourceAnchorRenderResult,
  composeJobArtifacts,
  renderSourceAnchor,
  fetchJobArtifacts,
  fetchJobArtifactBlob,
  composeReviewCandidate,
  composeReviewCandidateReport,
  composeReviewCandidateList,
  generateReviewCandidate,
  listReviewCandidates,
  getReviewCandidate,
  acceptReviewCandidate,
  rejectReviewCandidate,
} from '../src/lib/api/productWrites.ts';

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

async function run() {
  // --- seam decision (productApiEnabled) -----------------------------------------------------------
  setEnv({});
  check('product mode OFF when env unset', productApiEnabled() === false);
  setEnv({ NEXT_PUBLIC_TL2_PRODUCT_API: '1' });
  check('product mode ON when flag = 1', productApiEnabled() === true);
  setEnv({ NEXT_PUBLIC_TL2_PRODUCT_API: '0' });
  check('product mode OFF when flag = 0', productApiEnabled() === false);

  // --- fetchProduct sends tenant/session headers + strips trailing slash ---------------------------
  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000/',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  let seenUrl = '';
  let seenHeaders = {};
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenHeaders = (init && init.headers) || {};
    return { ok: true, json: async () => ({ ok: true }) };
  };
  await fetchProduct('/v2/product/project');
  check('fetchProduct strips trailing slash + hits path', seenUrl === 'http://localhost:8000/v2/product/project');
  check('fetchProduct sends X-TL-Tenant', seenHeaders['X-TL-Tenant'] === 'seed-project');
  check('fetchProduct sends dev stand-in X-TL-Session', seenHeaders['X-TL-Session'] === 'web-readonly');

  // --- no silent fallback: a non-OK live read throws (never returns mock) --------------------------
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  let threw = false;
  try {
    await fetchProduct('/v2/product/jobs/seed-job-1/closeout');
  } catch {
    threw = true;
  }
  check('failed live read throws (no silent fallback)', threw === true);

  // --- missing env config throws (honest config error, not mock) -----------------------------------
  setEnv({ NEXT_PUBLIC_TL2_PRODUCT_API: '1' });
  let threwConfig = false;
  try {
    await fetchProduct('/v2/product/project');
  } catch {
    threwConfig = true;
  }
  check('missing NEXT_PUBLIC_TL2_API_BASE throws config error', threwConfig === true);

  // --- redline manifest composition (summary + artifacts -> view; empty per-log; real counts) ------
  const view = composeRedlineManifestView(
    {
      // the real backend returns the output-slot envelope: { ref: { summary_counts, bundle_id, ... }, ... }
      ref: {
        summary_counts: { total_logs: 58, drawn: 50, covered: 1, blocked: 7 },
        bundle_id: 'seed-project-c19b565-abeaf35b1848',
      },
      set_at: '2026-06-22T00:00:00+00:00',
      set_by: 'workflow-seed',
    },
    {
      bundle_id: 'seed-project-c19b565-abeaf35b1848',
      artifacts: [
        { log_id: 'log3', path: 'artifacts/log3/log3_s2_redline_stroke.png', sha256: 'a'.repeat(64), bytes: 258784, kind: 'FINAL_REDLINE_PNG' },
        { log_id: 'log3', path: 'artifacts/log3/log3_s3_redline_stroke.png', sha256: 'b'.repeat(64), bytes: 747976, kind: 'FINAL_REDLINE_PNG' },
      ],
    },
    'seed-project',
  );
  check('manifest totals are real', view.totals.total === 58 && view.totals.drawn === 50 && view.totals.blocked === 7);
  check('manifest frontier derived from real counts', view.frontier === '50/58');
  check('manifest artifact count + bytes real', view.artifactCount === 2 && view.artifactBytes === 1006760);
  check('manifest per-log body honestly empty (not fabricated)', view.logs.length === 0 && view.drawnLogs.length === 0);
  check('manifest bundle id surfaced', view.bundleId === 'seed-project-c19b565-abeaf35b1848');

  // adapter also tolerates an already-unwrapped (flat) descriptor — defensive; the backend sends the ref envelope
  const flatView = composeRedlineManifestView(
    { summary_counts: { total_logs: 1, drawn: 1, covered: 0, blocked: 0 } },
    { bundle_id: 'seed-project-c19b565-abeaf35b1848', artifacts: [] },
    'seed-project',
  );
  check('manifest tolerates flat (unwrapped) descriptor', flatView.frontier === '1/1' && flatView.totals.drawn === 1);

  // --- product artifact list + blob fetch (Slice 1B) -----------------------------------------------
  const artifactRefs = composeArtifactList({
    bundle_id: 'seed-project-c19b565-abeaf35b1848',
    artifacts: [
      { log_id: 'log3', path: 'artifacts/log3/log3_s2_redline_stroke.png', sha256: 'a'.repeat(64), bytes: 258784, kind: 'FINAL_REDLINE_PNG' },
      { log_id: 'log3', path: 'artifacts/log3/log3_s3_redline_stroke.png', sha256: 'b'.repeat(64), bytes: 747976, kind: 'FINAL_REDLINE_PNG' },
    ],
  });
  check('composeArtifactList parses 2 real artifact refs',
    artifactRefs.length === 2 &&
      artifactRefs[0].logId === 'log3' &&
      artifactRefs[0].path === 'artifacts/log3/log3_s2_redline_stroke.png' &&
      artifactRefs[0].bytes === 258784);
  check('composeArtifactList honest-empty for empty doc', composeArtifactList({}).length === 0);

  // fetchProductArtifactBlob: identity headers + doubled-artifacts serve path + Blob; throws on non-OK.
  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  const fakePng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
  let blobUrl = '';
  let blobHeaders = {};
  globalThis.fetch = async (url, init) => {
    blobUrl = String(url);
    blobHeaders = (init && init.headers) || {};
    return { ok: true, blob: async () => fakePng };
  };
  const blob = await fetchProductArtifactBlob('artifacts/log3/log3_s2_redline_stroke.png');
  check('fetchProductArtifactBlob hits doubled-artifacts serve path',
    blobUrl === 'http://localhost:8000/v2/product/jobs/seed-job-1/artifacts/artifacts/log3/log3_s2_redline_stroke.png');
  check('fetchProductArtifactBlob sends X-TL-Tenant', blobHeaders['X-TL-Tenant'] === 'seed-project');
  check('fetchProductArtifactBlob sends X-TL-Session', blobHeaders['X-TL-Session'] === 'web-readonly');
  check('fetchProductArtifactBlob returns a Blob', blob instanceof Blob && blob.type === 'image/png');

  globalThis.fetch = async () => ({ ok: false, status: 404, blob: async () => fakePng });
  let blobThrew = false;
  try {
    await fetchProductArtifactBlob('artifacts/log3/log3_s2_redline_stroke.png');
  } catch {
    blobThrew = true;
  }
  check('fetchProductArtifactBlob throws on non-OK (no mock fallback)', blobThrew === true);

  // --- job-status composition (real shapes; KMZ pixel-only -> blocked) -----------------------------
  const status = composeJobStatus(
    { status: 'READY_FOR_APPROVAL' },
    { status: 'COMPUTED', currency: 'USD', view: { final_total: '3122.50', currency: 'USD' } },
    { status: 'READY' },
    { status: 'BLOCKED', blockers: [{ code: 'UNSUPPORTED_PIXEL_ONLY', reason: 'pixel-only' }] },
  );
  check('closeout status read', status.closeoutStatus === 'READY_FOR_APPROVAL');
  check('billing status + total read', status.billingStatus === 'COMPUTED' && status.billingFinalTotal === '3122.50');
  check('export status read', status.exportStatus === 'READY');
  check('kmz pixel-only blocked', status.kmzStatus === 'BLOCKED' && status.kmzBlockers.includes('UNSUPPORTED_PIXEL_ONLY'));

  // --- honest-empty product methods (never mock truth) ---------------------------------------------
  const noopReviews = {
    engineBundle: async () => ({}),
    engineDesignStrokeArtifacts: async () => ({}),
    engineRunAssembly: async () => ({}),
    engineRedlineManifest: async () => ({}),
  };
  const apiUnderTest = createLiveV2ProductApi(noopReviews);
  check('projects.list honest-empty', (await apiUnderTest.projects.list()).length === 0);
  check('runs.byProject honest-empty', (await apiUnderTest.runs.byProject('x')).length === 0);
  check('closeout.readiness honest-undefined', (await apiUnderTest.closeout.readiness('x')) === undefined);
  check('sync.state honest offline', (await apiUnderTest.sync.state()).state === 'offline');

  // --- product WRITE/intake helpers (Slice A: create job + upload + list) --------------------------
  check('inferUploadKind: .pdf uses the selected category',
    inferUploadKind('plan.pdf', 'PLAN_PDF') === 'PLAN_PDF' && inferUploadKind('log.pdf', 'BORE_LOG') === 'BORE_LOG');
  check('inferUploadKind: csv/xlsx->BORE_LOG, kmz/kml->GIS_ROUTE, images->PHOTO',
    inferUploadKind('a.csv', 'PLAN_PDF') === 'BORE_LOG' &&
      inferUploadKind('a.xlsx', 'PLAN_PDF') === 'BORE_LOG' &&
      inferUploadKind('a.kmz', 'PLAN_PDF') === 'GIS_ROUTE' &&
      inferUploadKind('a.kml', 'PLAN_PDF') === 'GIS_ROUTE' &&
      inferUploadKind('a.png', 'PLAN_PDF') === 'PHOTO' &&
      inferUploadKind('a.jpeg', 'PLAN_PDF') === 'PHOTO');
  check('inferUploadKind: unsupported -> null (never guessed)', inferUploadKind('movie.mp4', 'PLAN_PDF') === null);

  check('composeJobSummaries parses tenant jobs', composeJobSummaries({
    jobs: [
      { job_id: 'job-1', status: 'CREATED', upload_count: 2, created_at: 't0', updated_at: 't1' },
      { job_id: 'job-2', status: 'UPLOADING', upload_count: 0 },
    ],
  }).length === 2);
  check('composeJobSummaries honest-empty for empty doc', composeJobSummaries({}).length === 0);
  check('composeJobDetail maps real uploads', (() => {
    const d = composeJobDetail({
      job_id: 'job-1', status: 'CREATED',
      uploads: [{ upload_id: 'up-abc', kind: 'PLAN_PDF', original_filename: 'p.pdf', bytes: 10,
                  sha256: 'a'.repeat(64), extraction_status: 'queued' }],
    });
    return d.jobId === 'job-1' && d.uploads.length === 1 && d.uploads[0].uploadId === 'up-abc'
      && d.uploads[0].kind === 'PLAN_PDF' && d.uploads[0].extractionStatus === 'queued';
  })());

  // write helpers: identity headers + POST path/body; GET list; throw on non-OK (no mock fallback)
  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  let wUrl = '';
  let wInit = {};
  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({ ok: true, jobs: [] }) };
  };

  await createProductJob('job-x');
  check('createProductJob POSTs /v2/product/jobs',
    wUrl === 'http://localhost:8000/v2/product/jobs' && wInit.method === 'POST');
  check('createProductJob sends X-TL-Tenant + X-TL-Session',
    wInit.headers['X-TL-Tenant'] === 'seed-project' && wInit.headers['X-TL-Session'] === 'web-intake');
  check('createProductJob body carries job_id', JSON.parse(wInit.body).job_id === 'job-x');

  await uploadProductFile('job-x', { kind: 'PLAN_PDF', filename: 'p.pdf', contentBase64: 'QQ==' });
  check('uploadProductFile POSTs the job uploads path',
    wUrl === 'http://localhost:8000/v2/product/jobs/job-x/uploads');
  check('uploadProductFile body has kind/filename/content_base64', (() => {
    const b = JSON.parse(wInit.body);
    return b.kind === 'PLAN_PDF' && b.filename === 'p.pdf' && b.content_base64 === 'QQ==';
  })());

  await listProductJobs();
  check('listProductJobs GETs /v2/product/jobs with tenant header',
    wUrl === 'http://localhost:8000/v2/product/jobs' && wInit.headers['X-TL-Tenant'] === 'seed-project');

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  let wThrew = false;
  try {
    await createProductJob('job-y');
  } catch {
    wThrew = true;
  }
  check('failed product write throws (no mock fallback)', wThrew === true);

  // --- Slice B: reviewed bore-log gate helpers ----------------------------------------------------
  check('composeReviewedBoreLog parses rows + groups', (() => {
    const v = composeReviewedBoreLog({
      reviewed_bore_log_id: 'rbl-main', source_upload_id: 'up-x',
      rows: [{ row_id: 'row-1', raw: { start_station: '0+00', end_station: '2+99' },
               normalized: { start_station: '0+00', end_station: '2+99' },
               extraction: { extraction_method: 'MANUAL_ENTRY' }, review: { status: 'CONFIRMED', reason: null } }],
      groups: [{ group_id: 'grp-1', member_row_ids: ['row-1'], relation: 'SEPARATE_BORE', grouping_status: 'CONFIRMED' }],
    });
    return v.rblId === 'rbl-main' && v.sourceUploadId === 'up-x' && v.rows.length === 1
      && v.rows[0].rowId === 'row-1' && v.rows[0].startStation === '0+00'
      && v.rows[0].reviewStatus === 'CONFIRMED' && v.rows[0].extractionMethod === 'MANUAL_ENTRY'
      && v.groups.length === 1 && v.groups[0].groupId === 'grp-1' && v.groups[0].memberRowIds[0] === 'row-1';
  })());
  check('composeReviewQueue parses gate fields', (() => {
    const q = composeReviewQueue({
      rows_needing_review: ['row-2'], rows_rejected: [], rows_review_passed: ['row-1'],
      engine_eligible_row_ids: ['row-1'], ungrouped_rows: ['row-2'], rows_in_multiple_groups: [],
      unresolved_groups: [], engine_ready: false,
    });
    return q.engineReady === false && q.rowsNeedingReview[0] === 'row-2'
      && q.rowsReviewPassed[0] === 'row-1' && q.engineEligibleRowIds[0] === 'row-1'
      && q.ungroupedRows[0] === 'row-2';
  })());

  // live reviewed-bore-log writes/reads: paths + bodies + identity headers (capture mock)
  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({}) };
  };
  const B = 'http://localhost:8000/v2/product/jobs/job-x/reviewed-bore-logs';

  await createReviewedBoreLog('job-x', 'rbl-main', 'up-1');
  check('createReviewedBoreLog POST path + body + tenant header',
    wUrl === B && JSON.parse(wInit.body).reviewed_bore_log_id === 'rbl-main'
      && JSON.parse(wInit.body).source_upload_id === 'up-1' && wInit.headers['X-TL-Tenant'] === 'seed-project');

  await addReviewedRows('job-x', 'rbl-main', 'up-1', [{ rowId: 'row-1', startStation: '0+00', endStation: '2+99' }]);
  check('addReviewedRows POST path + MANUAL_ENTRY body', (() => {
    const b = JSON.parse(wInit.body);
    return wUrl === `${B}/rbl-main/rows` && b.rows[0].row_id === 'row-1'
      && b.rows[0].source_upload_id === 'up-1' && b.rows[0].extraction_method === 'MANUAL_ENTRY'
      && b.rows[0].raw.start_station === '0+00' && b.rows[0].normalized.end_station === '2+99';
  })());

  await reviewReviewedRow('job-x', 'rbl-main', 'row-1', { toStatus: 'CONFIRMED' });
  check('reviewReviewedRow POST path + to_status',
    wUrl === `${B}/rbl-main/rows/row-1/review` && JSON.parse(wInit.body).to_status === 'CONFIRMED');

  await defineSegmentGroup('job-x', 'rbl-main', 'grp-1', ['row-1'], 'SEPARATE_BORE');
  check('defineSegmentGroup POST path + body', (() => {
    const b = JSON.parse(wInit.body);
    return wUrl === `${B}/rbl-main/groups` && b.group_id === 'grp-1'
      && b.member_row_ids[0] === 'row-1' && b.relation === 'SEPARATE_BORE';
  })());

  await setGroupingStatus('job-x', 'rbl-main', 'grp-1', 'CONFIRMED');
  check('setGroupingStatus POST path + to_status',
    wUrl === `${B}/rbl-main/groups/grp-1/status` && JSON.parse(wInit.body).to_status === 'CONFIRMED');

  await fetchReviewQueue('job-x', 'rbl-main');
  check('fetchReviewQueue GET path', wUrl === `${B}/rbl-main/review-queue`);

  await fetchReviewedBoreLog('job-x', 'rbl-main');
  check('fetchReviewedBoreLog GET path + tenant header',
    wUrl === `${B}/rbl-main` && wInit.headers['X-TL-Tenant'] === 'seed-project');

  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  let rblThrew = false;
  try {
    await fetchReviewedBoreLog('job-x', 'rbl-main');
  } catch {
    rblThrew = true;
  }
  check('failed reviewed-bore-log read throws (no mock fallback)', rblThrew === true);

  // --- Slice C: engine-handoff readiness ----------------------------------------------------------
  check('composeEngineHandoffReadiness parses status/runnable/checks/blockers', (() => {
    const v = composeEngineHandoffReadiness({
      status: 'BLOCKED', runnable: false,
      checks: { has_plan_pdf: true, has_engine_ready_reviewed_bore_log: false },
      blockers: [{ code: 'ENGINE_HANDOFF_NOT_IMPLEMENTED_FOR_UPLOADED_CORPUS', reason: 'x' },
                 { code: 'NO_ENGINE_READY_REVIEWED_BORE_LOG', reason: 'y' }],
    });
    return v.status === 'BLOCKED' && v.runnable === false && v.hasPlanPdf === true
      && v.hasEngineReadyReviewedBoreLog === false && v.blockers.length === 2
      && v.blockers[0].code === 'ENGINE_HANDOFF_NOT_IMPLEMENTED_FOR_UPLOADED_CORPUS';
  })());

  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({ status: 'BLOCKED', runnable: false, checks: {}, blockers: [] }) };
  };
  await fetchEngineHandoffReadiness('job-x');
  check('fetchEngineHandoffReadiness GET path + tenant header',
    wUrl === 'http://localhost:8000/v2/product/jobs/job-x/engine-handoff'
      && wInit.headers['X-TL-Tenant'] === 'seed-project');

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  let hThrew = false;
  try {
    await fetchEngineHandoffReadiness('job-x');
  } catch {
    hThrew = true;
  }
  check('failed engine-handoff read throws (no mock fallback)', hThrew === true);

  // --- M2 Slice 2: plan-page metadata + raster blob + source-anchor create ------------------------
  check('composePlanPageMetadata parses pages + display bounds', (() => {
    const m = composePlanPageMetadata({
      plan_upload_id: 'up-plan', page_count: 1,
      pages: [{ page_number: 1, bounds: { x0: 0, y0: 0, x1: 612, y1: 792 },
                width: 612, height: 792, zoom: 2, raster_width: 1224, raster_height: 1584 }],
    });
    return m.planUploadId === 'up-plan' && m.pageCount === 1 && m.pages.length === 1
      && m.pages[0].pageNumber === 1 && m.pages[0].bounds.x1 === 612 && m.pages[0].bounds.y1 === 792
      && m.pages[0].width === 612 && m.pages[0].rasterWidth === 1224;
  })());
  check('composePlanPageMetadata honest-empty for empty doc', composePlanPageMetadata({}).pages.length === 0);
  check('composeSourceAnchorResult parses status/renderable/provenance/blockers', (() => {
    const v = composeSourceAnchorResult({
      source_anchor_id: 'sa-1', status: 'REJECTED', renderable: false,
      provenance: 'HUMAN_CONFIRMED_CONTROL_POINTS', coordinate_space: 'pdf_display_space',
      blockers: [{ code: 'CONTROL_POINTS_TOO_FEW', reason: 'need >= 2' }],
    });
    return v.sourceAnchorId === 'sa-1' && v.status === 'REJECTED' && v.renderable === false
      && v.provenance === 'HUMAN_CONFIRMED_CONTROL_POINTS' && v.coordinateSpace === 'pdf_display_space'
      && v.blockers.length === 1 && v.blockers[0].code === 'CONTROL_POINTS_TOO_FEW';
  })());

  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({ plan_upload_id: 'up-plan', page_count: 1, pages: [] }) };
  };
  await fetchPlanPageMetadata('job-x', 'up-plan');
  check('fetchPlanPageMetadata GET path + tenant header',
    wUrl === 'http://localhost:8000/v2/product/jobs/job-x/plan-pages/up-plan'
      && wInit.headers['X-TL-Tenant'] === 'seed-project');

  const pagePng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
  let rUrl = '';
  let rHeaders = {};
  globalThis.fetch = async (url, init) => {
    rUrl = String(url);
    rHeaders = (init && init.headers) || {};
    return { ok: true, blob: async () => pagePng };
  };
  const pageBlob = await fetchPlanPageRasterBlob('job-x', 'up-plan', 1);
  check('fetchPlanPageRasterBlob GET raster path + tenant header + Blob',
    rUrl === 'http://localhost:8000/v2/product/jobs/job-x/plan-pages/up-plan/1/raster'
      && rHeaders['X-TL-Tenant'] === 'seed-project'
      && pageBlob instanceof Blob && pageBlob.type === 'image/png');

  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({ source_anchor_id: 'sa-1', status: 'VALIDATED', renderable: true,
      provenance: 'HUMAN_CONFIRMED_CONTROL_POINTS', coordinate_space: 'pdf_display_space', blockers: [] }) };
  };
  const saResult = await createSourceAnchor('job-x', {
    sourceAnchorId: 'sa-1', planUploadId: 'up-plan', reviewedBoreLogId: 'rbl-main', pageNumber: 1,
    controlPoints: [{ x: 100, y: 120 }, { x: 300, y: 340 }],
    startIdentity: { station: '0+00', structureLabel: 'HH' },
  });
  check('createSourceAnchor POST path + tenant header + body + validated result', (() => {
    const b = JSON.parse(wInit.body);
    return wUrl === 'http://localhost:8000/v2/product/jobs/job-x/source-anchors'
      && wInit.method === 'POST' && wInit.headers['X-TL-Tenant'] === 'seed-project'
      && b.source_anchor_id === 'sa-1' && b.plan_upload_id === 'up-plan'
      && b.reviewed_bore_log_id === 'rbl-main' && b.page_number === 1
      && b.control_points.length === 2 && b.control_points[0].x === 100
      && b.start_identity.station === '0+00' && b.start_identity.structure_label === 'HH'
      && saResult.status === 'VALIDATED' && saResult.renderable === true;
  })());
  check('createSourceAnchor identity is coordinate-free (no x/y keys)', (() => {
    const b = JSON.parse(wInit.body);
    return !('x' in b.start_identity) && !('y' in b.start_identity);
  })());

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), blob: async () => pagePng });
  let m2Threw = 0;
  for (const fn of [
    () => fetchPlanPageMetadata('job-x', 'up-plan'),
    () => fetchPlanPageRasterBlob('job-x', 'up-plan', 1),
    () => createSourceAnchor('job-x', { sourceAnchorId: 'sa-1', planUploadId: 'up-plan',
      reviewedBoreLogId: 'rbl-main', pageNumber: 1, controlPoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }),
  ]) {
    try { await fn(); } catch { m2Threw += 1; }
  }
  check('M2 plan-page + source-anchor reads/writes throw on non-OK (no mock fallback)', m2Threw === 3);

  // --- M2 Slice 3: render a validated source anchor + job-scoped artifact reads -------------------
  check('composeSourceAnchorRenderResult parses status/bundle/origin/artifacts', (() => {
    const v = composeSourceAnchorRenderResult({
      status: 'SUCCEEDED', bundle_id: 'cp-x-human-confirmed-source-anchor-abc123',
      bundle_origin: 'HUMAN_CONFIRMED_SOURCE_ANCHOR', artifact_count: 1,
      source_anchor_ids: ['sa-1'],
      artifacts: [{ log_id: 'sa-1', path: 'artifacts/sa-1/sa-1_s1_redline_stroke.png',
                    sha256: 'a'.repeat(64), bytes: 9933, kind: 'FINAL_REDLINE_PNG' }],
    });
    return v.status === 'SUCCEEDED' && v.bundleOrigin === 'HUMAN_CONFIRMED_SOURCE_ANCHOR'
      && v.artifactCount === 1 && v.sourceAnchorIds[0] === 'sa-1'
      && v.artifacts.length === 1 && v.artifacts[0].kind === 'FINAL_REDLINE_PNG'
      && v.artifacts[0].bytes === 9933;
  })());
  check('composeJobArtifacts honest-empty for empty doc', composeJobArtifacts({}).length === 0);

  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({ status: 'SUCCEEDED', bundle_id: 'b-1',
      bundle_origin: 'HUMAN_CONFIRMED_SOURCE_ANCHOR', artifact_count: 1, source_anchor_ids: ['sa-1'],
      artifacts: [] }) };
  };
  const rendered = await renderSourceAnchor('job-x', 'sa-1');
  check('renderSourceAnchor POST render path + tenant header + result', (() => {
    return wUrl === 'http://localhost:8000/v2/product/jobs/job-x/source-anchors/sa-1/render'
      && wInit.method === 'POST' && wInit.headers['X-TL-Tenant'] === 'seed-project'
      && rendered.status === 'SUCCEEDED' && rendered.bundleOrigin === 'HUMAN_CONFIRMED_SOURCE_ANCHOR';
  })());

  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({ bundle_id: 'b-1', artifacts: [
      { log_id: 'sa-1', path: 'artifacts/sa-1/sa-1_s1_redline_stroke.png', sha256: 'a'.repeat(64),
        bytes: 9933, kind: 'FINAL_REDLINE_PNG' }] }) };
  };
  const jobArts = await fetchJobArtifacts('job-x');
  check('fetchJobArtifacts GET job artifacts path + tenant header + parse',
    wUrl === 'http://localhost:8000/v2/product/jobs/job-x/artifacts'
      && wInit.headers['X-TL-Tenant'] === 'seed-project'
      && jobArts.length === 1 && jobArts[0].path === 'artifacts/sa-1/sa-1_s1_redline_stroke.png');

  const saPng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
  let jbUrl = '';
  let jbHeaders = {};
  globalThis.fetch = async (url, init) => {
    jbUrl = String(url);
    jbHeaders = (init && init.headers) || {};
    return { ok: true, blob: async () => saPng };
  };
  const jobBlob = await fetchJobArtifactBlob('job-x', 'artifacts/sa-1/sa-1_s1_redline_stroke.png');
  check('fetchJobArtifactBlob GET artifact path + tenant header + Blob',
    jbUrl === 'http://localhost:8000/v2/product/jobs/job-x/artifacts/artifacts/sa-1/sa-1_s1_redline_stroke.png'
      && jbHeaders['X-TL-Tenant'] === 'seed-project' && jobBlob instanceof Blob);

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), blob: async () => saPng });
  let s3Threw = 0;
  for (const fn of [
    () => renderSourceAnchor('job-x', 'sa-1'),
    () => fetchJobArtifacts('job-x'),
    () => fetchJobArtifactBlob('job-x', 'artifacts/sa-1/x.png'),
  ]) {
    try { await fn(); } catch { s3Threw += 1; }
  }
  check('M2 render + job-artifact reads throw on non-OK (no mock fallback)', s3Threw === 3);

  // --- Phase 6: REVIEW acceptance lane (engine candidate -> human accept/reject) ------------------
  check('composeReviewCandidate parses a REVIEW_CANDIDATE record', (() => {
    const v = composeReviewCandidate({
      candidate_id: 'rc-rbl-1', tier: 'REVIEW', status: 'REVIEW_CANDIDATE',
      provenance: 'ENGINE_GENERATED_REVIEW_CANDIDATE', placement_status: 'REVIEW',
      engine_reason: 'DRAWN_EXTENT_COVERS_SPAN_NOT_TIGHT', no_manual_geometry: true,
      referenced_sheets: [10, 11], render_sheets: [10, 11],
      caveats: ['CROSS_SHEET_CONTINUATION_REVIEW', 'MATCHLINE_CONTINUATION_UNVERIFIED'],
      matchline_continuity: 'UNVERIFIED',
      why_not_auto: { auto_blocked: true, blockers: ['NO_PER_BORE_TERMINI'], engine_reason: 'x' },
      blockers: [],
      bundle: { bundle_id: 'b-1', bundle_origin: 'UPLOADED_CORPUS_ENGINE', artifact_count: 2,
                artifacts: [{ log_id: 'rbl-1', path: 'artifacts/rbl-1/a.png', sha256: 'a'.repeat(64),
                             bytes: 100, kind: 'FINAL_REDLINE_PNG' }] },
    });
    return v.candidateId === 'rc-rbl-1' && v.tier === 'REVIEW' && v.status === 'REVIEW_CANDIDATE'
      && v.provenance === 'ENGINE_GENERATED_REVIEW_CANDIDATE' && v.noManualGeometry === true
      && v.renderSheets.length === 2 && v.caveats.includes('MATCHLINE_CONTINUATION_UNVERIFIED')
      && v.matchlineContinuity === 'UNVERIFIED' && v.whyNotAuto.blockers[0] === 'NO_PER_BORE_TERMINI'
      && v.bundle.bundleOrigin === 'UPLOADED_CORPUS_ENGINE' && v.bundle.artifacts.length === 1;
  })());
  check('composeReviewCandidate: accepted record keeps human-accepted provenance (not AUTO)', (() => {
    const v = composeReviewCandidate({ candidate_id: 'rc-rbl-1', tier: 'REVIEW', status: 'REVIEW_ACCEPTED',
      provenance: 'ENGINE_GENERATED_HUMAN_ACCEPTED_REVIEW', placement_status: 'REVIEW' });
    return v.status === 'REVIEW_ACCEPTED' && v.provenance === 'ENGINE_GENERATED_HUMAN_ACCEPTED_REVIEW'
      && v.provenance !== 'DETERMINISTIC_AUTO';
  })());
  check('composeReviewCandidateReport parses report with nested record', (() => {
    const r = composeReviewCandidateReport({ tier: 'REVIEW', runnable: true, candidate_id: 'rc-rbl-1',
      record: { candidate_id: 'rc-rbl-1', status: 'REVIEW_CANDIDATE' }, blockers: [] });
    return r.tier === 'REVIEW' && r.runnable === true && r.record && r.record.status === 'REVIEW_CANDIDATE';
  })());
  check('composeReviewCandidateReport: not-runnable report has no record + carries blockers', (() => {
    const r = composeReviewCandidateReport({ tier: null, runnable: false, candidate_id: null, record: null,
      blockers: [{ code: 'NO_PLAN_PDF_UPLOAD', reason: 'x' }] });
    return r.runnable === false && r.record === null && r.blockers[0].code === 'NO_PLAN_PDF_UPLOAD';
  })());
  check('composeReviewCandidateList parses + honest-empty',
    composeReviewCandidateList({ review_candidates: [{ candidate_id: 'rc-rbl-1', status: 'REVIEW_ACCEPTED' }] })
      .length === 1 && composeReviewCandidateList({}).length === 0);

  setEnv({
    NEXT_PUBLIC_TL2_PRODUCT_API: '1',
    NEXT_PUBLIC_TL2_API_BASE: 'http://localhost:8000',
    NEXT_PUBLIC_TL2_TENANT: 'seed-project',
    NEXT_PUBLIC_TL2_JOB_ID: 'seed-job-1',
  });
  globalThis.fetch = async (url, init) => {
    wUrl = String(url);
    wInit = init || {};
    return { ok: true, json: async () => ({ tier: 'REVIEW', runnable: true, candidate_id: 'rc-rbl-1',
      record: { candidate_id: 'rc-rbl-1', status: 'REVIEW_CANDIDATE' }, review_candidates: [], blockers: [] }) };
  };
  const RC = 'http://localhost:8000/v2/product/jobs/job-x/review-candidates';

  await generateReviewCandidate('job-x');
  check('generateReviewCandidate POSTs generate path + tenant header',
    wUrl === `${RC}/generate` && wInit.method === 'POST' && wInit.headers['X-TL-Tenant'] === 'seed-project');

  await listReviewCandidates('job-x');
  check('listReviewCandidates GETs path', wUrl === RC && wInit.headers['X-TL-Tenant'] === 'seed-project');

  await getReviewCandidate('job-x', 'rc-rbl-1');
  check('getReviewCandidate GETs candidate path', wUrl === `${RC}/rc-rbl-1`);

  await acceptReviewCandidate('job-x', 'rc-rbl-1');
  check('acceptReviewCandidate POSTs accept path', wUrl === `${RC}/rc-rbl-1/accept` && wInit.method === 'POST');

  await rejectReviewCandidate('job-x', 'rc-rbl-1', 'needs correction');
  check('rejectReviewCandidate POSTs reject path + reason body',
    wUrl === `${RC}/rc-rbl-1/reject` && JSON.parse(wInit.body).reason === 'needs correction');

  globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({}) });
  let p6Threw = 0;
  for (const fn of [
    () => generateReviewCandidate('job-x'),
    () => listReviewCandidates('job-x'),
    () => acceptReviewCandidate('job-x', 'rc-rbl-1'),
    () => rejectReviewCandidate('job-x', 'rc-rbl-1', 'r'),
  ]) {
    try { await fn(); } catch { p6Threw += 1; }
  }
  check('REVIEW acceptance reads/writes throw on non-OK (no mock fallback)', p6Threw === 4);

  globalThis.fetch = realFetch;
  setEnv({});

  if (failures > 0) {
    console.error(`\nlive product read checks FAILED: ${failures} failure(s).`);
    process.exitCode = 1;
  } else {
    console.log('\nlive product read checks passed.');
  }
}

await run();
