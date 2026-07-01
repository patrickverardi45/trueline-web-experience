// Zero-dependency checks for the pure pricing helper (repo convention: plain-Node script).
// Run: `node scripts/check-pricing.mjs`.
//
// Verifies v1-parity live pricing math + formatting: footage × $15, decimals, exceptions, and — critically —
// that a MISSING footage yields a null total (an honest missing state), never a fabricated "$0".

import {
  STAGING_RATE_PER_FT,
  computePricing,
  formatFootage,
  formatUSD,
  parseNonNegative,
  resolveBillableFootage,
} from '../src/lib/pricing.ts';

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}`); }
}

// --- single-source rate constant --------------------------------------------------------------------
check('rate constant is $15/ft (single source)', STAGING_RATE_PER_FT === 15);

// --- the canonical example: 150 ft × $15 = $2,250 ---------------------------------------------------
const p150 = computePricing('150', STAGING_RATE_PER_FT);
check('150 ft × $15 = 2250 (base + final)', p150.baseTotal === 2250 && p150.finalTotal === 2250);
check('150 ft × $15 formats as $2,250.00', formatUSD(p150.baseTotal) === '$2,250.00');
check('150 ft footage available', p150.footageAvailable === true && p150.footageFt === 150);

// --- decimal footage --------------------------------------------------------------------------------
const pDec = computePricing('100.5', 15);
check('decimal footage 100.5 × 15 = 1507.5', pDec.baseTotal === 1507.5);
check('formatUSD rounds cents', formatUSD(1507.5) === '$1,507.50');
check('formatFootage keeps decimals', formatFootage(100.5) === '100.5 ft');
check('formatFootage adds thousands sep', formatFootage(12345) === '12,345 ft');

// --- exceptions add to the final total --------------------------------------------------------------
const pEx = computePricing('150', 15, ['500', '250', '']);   // 2250 + 500 + 250 (blank ignored)
check('exceptions summed into final total', pEx.exceptionTotal === 750 && pEx.finalTotal === 3000);
check('base unchanged by exceptions', pEx.baseTotal === 2250);

// --- MISSING footage -> null totals (honest missing state, NEVER a fake $0) --------------------------
for (const missing of [null, undefined, '', 'abc']) {
  const pm = computePricing(missing, 15, ['500']);
  check(`missing footage (${JSON.stringify(missing)}) -> base/final null, not 0`,
    pm.baseTotal === null && pm.finalTotal === null && pm.footageAvailable === false);
}
check('missing footage formats as em-dash, not $0', formatUSD(computePricing(null, 15).baseTotal) === '—');

// footage = 0 (e.g. a generic render with no drawn length) -> treated as MISSING, never a fake $0
const pZero = computePricing('0', 15, ['500']);
check('footage 0 ft -> not available + base/final null (never a fake $0)',
  pZero.footageAvailable === false && pZero.baseTotal === null && pZero.finalTotal === null);
check('footage 0 ft price formats as em-dash (not $0.00)', formatUSD(pZero.baseTotal) === '—');

// --- invalid / negative footage refused safely ------------------------------------------------------
check('negative footage refused (null, not a negative price)', parseNonNegative('-5') === null);
check('negative footage -> null base', computePricing('-100', 15).baseTotal === null);
check('non-numeric footage refused', parseNonNegative('12ft') === null && parseNonNegative('  ') === null);
check('valid decimal parsed', parseNonNegative('3.5') === 3.5 && parseNonNegative(0) === 0);

// --- missing / invalid RATE also yields no fabricated total -----------------------------------------
const pNoRate = computePricing('150', '');       // footage present, rate blank
check('blank rate -> base null (no faked total)', pNoRate.baseTotal === null && pNoRate.ratePerFt === null);
check('negative rate refused', computePricing('150', '-3').baseTotal === null);

// --- formatting edge cases --------------------------------------------------------------------------
check('formatUSD(0) is a real $0.00 (only a real zero, never a stand-in)', formatUSD(0) === '$0.00');
check('formatUSD(null) is em-dash', formatUSD(null) === '—');
check('formatFootage(null) is honest missing label', formatFootage(null) === 'not available yet');

// --- billable footage resolution (measured drawn preferred; else source-span fallback, labeled) -----
check('billable footage prefers a measured drawn length', (() => {
  const b = resolveBillableFootage('320', 150);
  return b.footageFt === 320 && b.source === 'DRAWN';
})());
check('billable footage falls back to source span when drawn is 0 / missing', (() => {
  const b0 = resolveBillableFootage('0', 150);       // drawn 0 (generic render) -> source span
  const bn = resolveBillableFootage(null, 150);      // no manifest footage -> source span
  return b0.footageFt === 150 && b0.source === 'SOURCE_SPAN'
    && bn.footageFt === 150 && bn.source === 'SOURCE_SPAN';
})());
check('billable footage null when neither drawn nor span (no fake $0)', (() => {
  const b = resolveBillableFootage('0', null);
  return b.footageFt === null && b.source === null;
})());
check('source-span 150 ft × $15 = $2,250.00 end to end (the staging demo)', (() => {
  const b = resolveBillableFootage('0', 150);
  const p = computePricing(b.footageFt, STAGING_RATE_PER_FT);
  return b.source === 'SOURCE_SPAN' && p.baseTotal === 2250 && formatUSD(p.finalTotal) === '$2,250.00';
})());

if (failures > 0) { console.error(`\npricing checks FAILED: ${failures} failure(s).`); process.exitCode = 1; }
else console.log('\npricing checks passed.');
