// Web-local engine REVIEWER reads, shared by the fixture-default client (mockApi) and the live v2
// product client. These cover the engine reviewer surfaces (/v2/reviewer/*) plus the durable
// redline-manifest fixture view; they opt into the local v2 reviewer API only when
// NEXT_PUBLIC_TL2_API_BASE is set, and otherwise serve the committed fixtures.
//
// No mock PORTFOLIO data lives here — only the read paths over real v2 engine output. Extracted so both
// the offline client and the product client reuse one implementation (no duplicate reviewer logic).

import type { TrueLineApi } from './types';
import { adaptV2ReviewerBundle } from './adapters/v2Bundle';
import { adaptV2DesignStrokeArtifacts } from './adapters/v2Artifacts';
import { adaptV2RunAssembly } from './adapters/v2RunAssembly';
import { adaptV2RedlineManifest } from './adapters/v2RedlineManifest';
import reviewerBundleFixture from './fixtures/reviewer_bundle.v1.json';
import designStrokeArtifactsFixture from './fixtures/design_stroke_artifacts.v1.json';
import runAssemblyFixture from './fixtures/run_assembly_cards.v1.json';
import redlineManifestFixture from './fixtures/redline_manifest.v1.json';
import redlineStoreIndexFixture from './fixtures/redline_store_index.v1.json';
import { brenhamRuns } from './mock/fixtures';

const fixtureEngineReviewBundle = adaptV2ReviewerBundle(reviewerBundleFixture, brenhamRuns);
const fixtureEngineDesignStrokeArtifacts = adaptV2DesignStrokeArtifacts(designStrokeArtifactsFixture);
const fixtureRunAssembly = adaptV2RunAssembly(runAssemblyFixture);
// Served images exist only after `npm run export:redline-bundle` populates the gitignored
// public/redline-bundle tree; opt in with NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED=1.
const redlineManifestServed = process.env.NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED === '1';
const fixtureRedlineManifest = adaptV2RedlineManifest(redlineStoreIndexFixture, redlineManifestFixture, {
  served: redlineManifestServed,
});

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

export const reviewerReads: TrueLineApi['reviews'] = {
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
  engineRunAssembly: async () => {
    if (!tl2ApiBase) return fixtureRunAssembly;
    const value = await fetchLiveV2('/v2/reviewer/run-assembly');
    return adaptV2RunAssembly(value);
  },
  // Phase 2K: read-only static consume of the durable redline-manifest bundle (fixture-only here; the
  // product client overrides this with a live /v2/product read).
  engineRedlineManifest: async () => fixtureRedlineManifest,
};
