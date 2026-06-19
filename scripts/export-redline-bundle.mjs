// Phase-2K static export: copy the engine's durable redline-manifest bundle into the web app.
//
// Read-only against the engine repo. Mirrors the durable store's read path
// (store_index.json -> latest_valid -> bundles/<id>/redline_manifest.json) and:
//   * copies store_index.json + redline_manifest.json VERBATIM into committed fixtures
//     (src/lib/api/fixtures/redline_store_index.v1.json + redline_manifest.v1.json);
//   * copies each FINAL_REDLINE_PNG into public/redline-bundle/<id>/<path> (gitignored,
//     regenerable, never committed) so the panel can serve real images locally.
//
// It refuses to export a mock/example bundle (mock_example must be false) and refuses any
// unsafe artifact path. No engine, no render, no network. Run: `npm run export:redline-bundle`.
//
// The engine store location defaults to the sibling TrueLine_Beta durable-store-proof path and
// can be overridden with TL2_REDLINE_STORE.

import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storeRoot = process.env.TL2_REDLINE_STORE
  ? resolve(process.env.TL2_REDLINE_STORE)
  : resolve(
      webRoot,
      '..',
      'TrueLine',
      'TrueLine_Beta',
      'data',
      'outputs',
      'redline_manifest_publish',
      'durable_store_proof',
      'store',
    );

const fixturesDir = resolve(webRoot, 'src', 'lib', 'api', 'fixtures');
const publicRoot = resolve(webRoot, 'public', 'redline-bundle');
// Same safe-relative artifact path the durable bundle uses; rejects traversal / URLs.
const ARTIFACT_PATH = /^artifacts\/[a-z0-9_]+\/[a-z0-9_]+\.png$/;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  let storeIndex;
  try {
    storeIndex = await readJson(join(storeRoot, 'store_index.json'));
  } catch {
    console.error(`Durable store not found at ${storeRoot}`);
    console.error('  Set TL2_REDLINE_STORE, or run the engine durable-store proof first.');
    console.error('  (Committed fixtures, if present, still drive availability-only mode.)');
    process.exitCode = 1;
    return;
  }

  const latest = storeIndex.latest_valid;
  if (!latest) throw new Error('store_index has no latest_valid pointer');
  const bundleDir = join(storeRoot, 'bundles', latest);
  const manifest = await readJson(join(bundleDir, 'redline_manifest.json'));
  if (manifest.mock_example !== false) {
    throw new Error('refusing to export a mock/example bundle (mock_example must be false)');
  }

  // Committed fixtures: verbatim copies (byte-identical to the durable bundle).
  await mkdir(fixturesDir, { recursive: true });
  await cp(join(storeRoot, 'store_index.json'), join(fixturesDir, 'redline_store_index.v1.json'));
  await cp(join(bundleDir, 'redline_manifest.json'), join(fixturesDir, 'redline_manifest.v1.json'));

  // Gitignored served PNGs: only FINAL_REDLINE_PNG, resolved by manifest path.
  let copied = 0;
  let bytes = 0;
  for (const log of manifest.logs) {
    for (const artifact of log.artifacts ?? []) {
      if (artifact.kind !== 'FINAL_REDLINE_PNG') continue;
      const rel = artifact.path;
      if (!ARTIFACT_PATH.test(rel)) throw new Error(`unsafe artifact path: ${rel}`);
      const dest = join(publicRoot, latest, rel);
      await mkdir(dirname(dest), { recursive: true });
      await cp(join(bundleDir, rel), dest);
      copied += 1;
      bytes += artifact.bytes ?? 0;
    }
  }

  const s = manifest.summary;
  console.log(`Exported durable bundle ${latest} (${s.frontier})`);
  console.log(`  fixtures: redline_store_index.v1.json + redline_manifest.v1.json (committed)`);
  console.log(`  served:   ${copied} FINAL_REDLINE_PNG -> public/redline-bundle/${latest}/ (${bytes} bytes, gitignored)`);
  console.log(`  set NEXT_PUBLIC_TL2_REDLINE_MANIFEST=1 (panel) and NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED=1 (images) to view.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
