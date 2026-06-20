// Prebuild fetch for the v2 redline-manifest PNG bundle (staging artifact hosting).
//
// Downloads the immutable artifact archive (the durable bundle's `artifacts/` tree) from
// TL2_REDLINE_BUNDLE_URL, extracts it into public/redline-bundle/<bundleId>/, and verifies every
// PNG against the sha256 values already committed in src/lib/api/fixtures/redline_manifest.v1.json.
// PNGs are NEVER committed to git (public/redline-bundle/ is gitignored); this runs at build time so
// Vercel can serve them at /redline-bundle/<bundleId>/artifacts/<log>/<file>.png.
//
// No-op unless served mode is intended:
//   * runs only when NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED === '1' OR --force is passed;
//   * otherwise exits 0 immediately, so SERVED=0 builds and local `next dev` are untouched.
//
// Fails loudly (exit 1) on: TL2_REDLINE_BUNDLE_URL missing when served; download failure; unsafe
// archive entry (path escape / off-layout); artifact count != manifest count; any sha256 mismatch.
//
// URL forms: https?://... (fetched) | file://... or a local path (read from disk, for local/CI runs).
//
// Cross-platform note: tar is driven via `-f -` (archive on stdin), never `-f <path>`, so a Windows
// `C:` temp path is not misread as a remote host and no GNU-only `--force-local` flag is needed
// (works with both GNU tar on the Vercel Linux build image and bsdtar locally).

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = resolve(webRoot, 'src', 'lib', 'api', 'fixtures');
const publicRoot = resolve(webRoot, 'public', 'redline-bundle');

// The safe, layout-bound artifact path the adapter enforces (artifacts/<log>/<file>.png).
const ARTIFACT_ENTRY = /^artifacts\/[a-z0-9_]+\/[a-z0-9_]+\.png$/;
const DIR_ENTRY = /^artifacts\/([a-z0-9_]+\/)?$/;
const BUNDLE_ID = /^[a-z0-9][a-z0-9._-]*$/;

const FORCE = process.argv.includes('--force');
const SERVED = process.env.NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED === '1';

function fail(msg) {
  console.error(`[fetch-redline-bundle] ERROR: ${msg}`);
  process.exit(1);
}
function info(msg) {
  console.log(`[fetch-redline-bundle] ${msg}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Expected truth from the committed fixtures: bundle id + every FINAL_REDLINE_PNG path->sha256. */
async function loadExpected() {
  const storeIndex = await readJson(join(fixturesDir, 'redline_store_index.v1.json'));
  const bundleId = storeIndex.latest_valid;
  if (typeof bundleId !== 'string' || !BUNDLE_ID.test(bundleId)) {
    fail(`store_index latest_valid missing/unsafe: ${bundleId}`);
  }
  const manifest = await readJson(join(fixturesDir, 'redline_manifest.v1.json'));
  if (manifest.mock_example !== false) fail('manifest mock_example must be false');

  const expected = new Map();
  for (const log of manifest.logs ?? []) {
    for (const a of log.artifacts ?? []) {
      if (a.kind !== 'FINAL_REDLINE_PNG') continue;
      if (typeof a.path !== 'string' || !ARTIFACT_ENTRY.test(a.path)) {
        fail(`manifest artifact path unsafe/off-layout: ${a.path}`);
      }
      if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)) {
        fail(`manifest artifact sha256 invalid for ${a.path}`);
      }
      expected.set(a.path, a.sha256);
    }
  }
  if (expected.size === 0) fail('manifest declares zero FINAL_REDLINE_PNG artifacts');
  return { bundleId, expected };
}

async function download(url) {
  if (url.startsWith('file://')) return readFile(fileURLToPath(url));
  if (!/^https?:\/\//i.test(url)) {
    const local = resolve(url);
    if (!existsSync(local)) fail(`local bundle path not found: ${local}`);
    return readFile(local);
  }
  info(`downloading ${url}`);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return fail(`download failed: ${e?.message ?? e}`);
  }
  if (!res.ok) fail(`download failed: HTTP ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Run tar with the archive on stdin (`-f -`); capture stdout. Reject on non-zero exit. */
function tar(args, input) {
  return new Promise((res, rej) => {
    const child = spawn('tar', args);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', rej);
    child.on('close', (code) => (code === 0 ? res(stdout) : rej(new Error(`tar exit ${code}: ${stderr.trim()}`))));
    child.stdin.on('error', () => {}); // ignore EPIPE if tar exits before reading all input
    child.stdin.end(input);
  });
}

function assertSafeEntries(entries) {
  for (const entry of entries) {
    if (entry.includes('..') || entry.startsWith('/') || /^[A-Za-z]:/.test(entry) || entry.includes('\\')) {
      fail(`unsafe archive entry (path escape): ${entry}`);
    }
    const isDir = entry.endsWith('/');
    if (isDir ? !DIR_ENTRY.test(entry) : !ARTIFACT_ENTRY.test(entry)) {
      fail(`archive entry off-layout: ${entry}`);
    }
  }
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main() {
  // Always-on diagnostic (no secrets): the flag value is quoted to reveal stray whitespace or a
  // wrong value (e.g. "true"); the bundle URL is reported present/missing + length only — never the
  // URL itself, since a signed/private asset URL may carry a token.
  const servedRaw = process.env.NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED;
  const urlRaw = process.env.TL2_REDLINE_BUNDLE_URL;
  info(
    `env: NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED=${servedRaw === undefined ? '<unset>' : JSON.stringify(servedRaw)} ` +
      `(served=${SERVED}); TL2_REDLINE_BUNDLE_URL=${urlRaw ? `present(len=${urlRaw.length})` : '<missing>'}; force=${FORCE}`,
  );

  if (!SERVED && !FORCE) {
    info('served mode OFF — skipping artifact fetch (availability-only). Set NEXT_PUBLIC_TL2_REDLINE_MANIFEST_SERVED=1 to activate.');
    return;
  }

  const url = urlRaw;
  if (!url) fail('served mode requested but TL2_REDLINE_BUNDLE_URL is not set');

  const { bundleId, expected } = await loadExpected();
  const destBundleDir = join(publicRoot, bundleId);
  const destArg = destBundleDir.replace(/\\/g, '/'); // forward slashes are safe for tar -C on both OSes

  const archive = await download(url);
  info(`archive ${archive.length} bytes; validating entries`);

  const entries = (await tar(['-tz', '-f', '-'], archive)).split(/\r?\n/).filter(Boolean);
  assertSafeEntries(entries);
  const fileEntries = entries.filter((e) => !e.endsWith('/'));
  if (fileEntries.length !== expected.size) {
    fail(`archive has ${fileEntries.length} files but manifest declares ${expected.size}`);
  }

  // Clean + extract (idempotent).
  await rm(destBundleDir, { recursive: true, force: true });
  await mkdir(destBundleDir, { recursive: true });
  await tar(['-xz', '-f', '-', '-C', destArg], archive);

  // Verify every manifest artifact exists at the expected path with the expected sha256.
  let verified = 0;
  for (const [relPath, sha] of expected) {
    const file = join(destBundleDir, ...relPath.split('/'));
    if (!existsSync(file)) fail(`missing extracted artifact: ${relPath}`);
    const got = await sha256File(file);
    if (got !== sha) fail(`sha256 mismatch for ${relPath}\n  expected ${sha}\n  got      ${got}`);
    verified += 1;
  }

  info(`OK: ${verified}/${expected.size} FINAL_REDLINE_PNG verified -> public/redline-bundle/${bundleId}/artifacts/...`);
}

main().catch((e) => fail(e?.message ?? String(e)));
