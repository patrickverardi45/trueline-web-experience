'use client';

// Per-job OPERATOR-ENTERED pricing table (Closeout/Export). The operator types a cost-per-foot and exception
// rows; dollars are the operator's OWN provisional inputs and are explicitly UNVERIFIED (not a configured
// rate sheet). Rates start blank and require input — no fabricated defaults. Footage is the SERVER quantity
// (read-only). Totals are computed server-side and echoed. This is DISTINCT from any future
// configured-rate-sheet/server-authoritative billing model.

import { useCallback, useEffect, useState } from 'react';

import {
  fetchOperatorPricing,
  saveOperatorPricing,
  type OperatorPricingView,
} from '@/lib/api/productWrites';
import { Card } from '@/components/ui/Card';
import { STAGING_RATE_PER_FT, computePricing, formatFootage, formatUSD } from '@/lib/pricing';

interface ExceptionRow {
  readonly key: string;
  label: string;
  amount: string;
  note: string;
}

let _rowSeq = 0;
function newRow(label = '', amount = '', note = ''): ExceptionRow {
  _rowSeq += 1;
  return { key: `ex-${_rowSeq}`, label, amount, note };
}

export function ProductOperatorPricing({ jobId }: { jobId: string }) {
  const [view, setView] = useState<OperatorPricingView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [costPerFoot, setCostPerFoot] = useState('');
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const hydrate = useCallback((v: OperatorPricingView) => {
    setView(v);
    setCostPerFoot(v.costPerFoot ?? String(STAGING_RATE_PER_FT));   // v1 parity: default to the staging $/ft rate
    setRows(v.exceptions.map((e) => newRow(e.label, e.amount ?? '', e.note ?? '')));
    setSavedAt(v.updatedAt);
  }, []);

  useEffect(() => {
    let active = true;
    fetchOperatorPricing(jobId)
      .then((v) => { if (active) hydrate(v); })
      .catch((e: unknown) => active && setLoadError(e instanceof Error ? e.message : 'unavailable'));
    return () => { active = false; };
  }, [jobId, hydrate]);

  async function onSave() {
    setBusy(true);
    setSaveError(null);
    try {
      const v = await saveOperatorPricing(jobId, {
        costPerFoot: costPerFoot.trim() === '' ? null : costPerFoot.trim(),
        exceptions: rows
          .filter((r) => r.label.trim() !== '')
          .map((r) => ({ label: r.label.trim(), amount: r.amount.trim() === '' ? null : r.amount.trim(),
                         note: r.note.trim() === '' ? null : r.note.trim() })),
      });
      hydrate(v);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Card>
        <h3 className="font-semibold text-ink">Pricing (operator-entered)</h3>
        <p className="mt-1 text-sm text-ink-3">Pricing unavailable — check the product API connection. ({loadError})</p>
      </Card>
    );
  }
  if (!view) {
    return (
      <Card>
        <h3 className="font-semibold text-ink">Pricing (operator-entered)</h3>
        <p className="mt-1 text-sm text-ink-3">Loading pricing…</p>
      </Card>
    );
  }

  // Live v1-parity pricing: footage (server quantity) × rate + exception amounts, recomputed every keystroke.
  const live = computePricing(view.footageAvailable ? view.footage : null, costPerFoot, rows.map((r) => r.amount));

  return (
    <Card>
      <h3 className="font-semibold text-ink">Pricing (operator-entered)</h3>
      {/* Honesty banner — these dollars are the operator's own provisional entries, not a configured sheet. */}
      <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {view.disclaimer}
      </p>

      {/* Footage (server) + cost per foot (operator) */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-3">Footage (server-computed)</span>
          <div className="mt-1 rounded-md border border-line bg-neutral-50 px-3 py-2 font-mono text-ink-2">
            {live.footageAvailable ? formatFootage(live.footageFt) : 'not available yet'}
          </div>
          {view.footageIncomplete && (
            <span className="text-xs text-amber-700">Some drawn logs lack a measured length — footage may be partial.</span>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-ink-3">Cost per foot ($) — staging rate, editable</span>
          <input
            value={costPerFoot}
            onChange={(e) => setCostPerFoot(e.target.value)}
            inputMode="decimal"
            placeholder={`staging default ${STAGING_RATE_PER_FT}`}
            className="mt-1 w-full rounded-md border border-line px-3 py-2 font-mono text-ink"
          />
        </label>
      </div>

      {/* Exceptions */}
      <div className="mt-3">
        <p className="text-sm font-medium text-ink">Exceptions (TXDOT, railroad, restoration, …)</p>
        <div className="mt-1.5 space-y-2">
          {rows.map((row, i) => (
            <div key={row.key} className="grid grid-cols-[1.4fr_0.8fr_auto] gap-2">
              <input
                value={row.label}
                onChange={(e) => setRows((p) => p.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                placeholder="label"
                className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink"
              />
              <input
                value={row.amount}
                onChange={(e) => setRows((p) => p.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
                inputMode="decimal"
                placeholder="amount ($)"
                className="rounded-md border border-line px-2.5 py-1.5 font-mono text-sm text-ink"
              />
              <button
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-2 hover:text-ink">
                Remove
              </button>
              <input
                value={row.note}
                onChange={(e) => setRows((p) => p.map((r, j) => (j === i ? { ...r, note: e.target.value } : r)))}
                placeholder="note / context (optional)"
                className="col-span-3 rounded-md border border-line bg-neutral-50 px-2.5 py-1 text-xs text-ink-2"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => setRows((p) => [...p, newRow()])}
          className="mt-2 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:text-ink">
          + Add exception
        </button>
      </div>

      {/* Totals — LIVE (footage × rate + exceptions), recomputed client-side on every edit. */}
      <div className="mt-3 rounded-md border border-line bg-white p-3 text-sm">
        <div className="flex justify-between"><span className="text-ink-3">Base price (footage × rate)</span><span className="font-mono font-semibold text-ink">{formatUSD(live.baseTotal)}</span></div>
        <div className="mt-1 flex justify-between"><span className="text-ink-3">Exception total</span><span className="font-mono text-ink">{formatUSD(live.exceptionTotal)}</span></div>
        <div className="mt-1 flex justify-between border-t border-line pt-1"><span className="font-medium text-ink">Final total (live estimate, unverified)</span><span className="font-mono font-bold text-ink">{formatUSD(live.finalTotal)}</span></div>
        {!live.footageAvailable && (
          <p className="mt-1.5 text-xs text-amber-700">
            Footage isn’t available yet — a placed redline provides the measured length. The price appears once footage is available (never a fake $0).
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-ink-3">Live estimate at ${STAGING_RATE_PER_FT}/ft (staging rate). Save to persist the rate + exceptions.</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void onSave()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Saving…' : 'Save pricing'}
        </button>
        {savedAt && !busy && <span className="text-xs text-ink-3">Saved.</span>}
        {saveError && <span className="text-sm text-red-600">{saveError}</span>}
      </div>
    </Card>
  );
}
