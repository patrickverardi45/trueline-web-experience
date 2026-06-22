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
