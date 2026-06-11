import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webContract = resolve(webRoot, 'src', 'contracts', 'index.ts');
const mobileContract = resolve(webRoot, '..', 'trueline-field-mobile', 'src', 'contracts', 'index.ts');

const [webContents, mobileContents] = await Promise.all([
  readFile(webContract),
  readFile(mobileContract),
]);

if (!webContents.equals(mobileContents)) {
  console.error('Contract parity check failed: mobile contracts differ from the web source of truth.');
  console.error(`Web: ${webContract}`);
  console.error(`Mobile: ${mobileContract}`);
  process.exitCode = 1;
} else {
  console.log('Contract parity check passed: mobile contracts match the web source of truth.');
}
