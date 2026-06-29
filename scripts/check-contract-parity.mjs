import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Verifies the mobile app's mirrored contracts match this repo's source of truth. The mobile repo lives
// outside this one, so its path is configurable (FIELDROUTE_MOBILE_CONTRACT or FIELDROUTE_MOBILE_ROOT);
// it defaults to a sibling checkout. When the mobile checkout isn't present (CI, a fresh clone, this
// environment) the check SKIPS with a clear warning instead of throwing ENOENT — a missing mirror is not
// a parity failure. (FR-AUDIT-013)
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webContract = resolve(webRoot, 'src', 'contracts', 'index.ts');

const mobileContract = process.env.FIELDROUTE_MOBILE_CONTRACT
  ? resolve(process.env.FIELDROUTE_MOBILE_CONTRACT)
  : resolve(
      process.env.FIELDROUTE_MOBILE_ROOT
        ? resolve(process.env.FIELDROUTE_MOBILE_ROOT)
        : resolve(webRoot, '..', 'trueline-field-mobile'),
      'src', 'contracts', 'index.ts',
    );

let mobileContents;
try {
  mobileContents = await readFile(mobileContract);
} catch (err) {
  if (err && err.code === 'ENOENT') {
    console.warn(`Contract parity check SKIPPED: no mobile contract at ${mobileContract}.`);
    console.warn('Set FIELDROUTE_MOBILE_CONTRACT or FIELDROUTE_MOBILE_ROOT to run the comparison.');
    process.exit(0);
  }
  throw err;
}

const webContents = await readFile(webContract);

if (!webContents.equals(mobileContents)) {
  console.error('Contract parity check failed: mobile contracts differ from the web source of truth.');
  console.error(`Web: ${webContract}`);
  console.error(`Mobile: ${mobileContract}`);
  process.exitCode = 1;
} else {
  console.log('Contract parity check passed: mobile contracts match the web source of truth.');
}
