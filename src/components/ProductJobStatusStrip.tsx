'use client';

// Read-only v2 job-status strip. In product mode it reads the real, server-authoritative closeout /
// billing / export-package / KMZ-safety status for the configured job and renders it as-is. It NEVER
// synthesizes legacy per-run readiness, creates approval truth, or exposes a privileged transition. In
// offline/demo mode it renders nothing; on a failed read it shows an honest "unavailable" state (never
// mock).

import { useEffect, useState } from 'react';

import {
  productApiEnabled,
  fetchProductJobStatus,
  type ProductJobStatus,
} from '@/lib/api/liveV2Product';

type StripState =
  | { phase: 'off' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; status: ProductJobStatus };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}

export function ProductJobStatusStrip() {
  const [state, setState] = useState<StripState>(() =>
    productApiEnabled() ? { phase: 'loading' } : { phase: 'off' },
  );

  useEffect(() => {
    if (!productApiEnabled()) return;
    let active = true;
    fetchProductJobStatus()
      .then((status) => {
        if (active) setState({ phase: 'ready', status });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({ phase: 'error', message: err instanceof Error ? err.message : 'unavailable' });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.phase === 'off') return null;

  return (
    <div className="mt-8 rounded-lg border border-line p-4">
      <h3 className="font-semibold text-ink">v2 job status (server-authoritative)</h3>
      {state.phase === 'loading' && <p className="mt-2 text-sm text-ink-3">Reading live v2 product status…</p>}
      {state.phase === 'error' && (
        <p className="mt-2 text-sm text-ink-3">
          v2 job status unavailable — check the v2 product API connection / configuration
          (NEXT_PUBLIC_TL2_*). No data is shown rather than placeholder values. ({state.message})
        </p>
      )}
      {state.phase === 'ready' && (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm xl:grid-cols-4">
          <Field label="Closeout" value={state.status.closeoutStatus ?? '—'} />
          <Field
            label="Billing"
            value={
              state.status.billingFinalTotal
                ? `${state.status.billingStatus ?? '—'} · ${state.status.billingFinalTotal} ${state.status.billingCurrency ?? ''}`.trim()
                : (state.status.billingStatus ?? '—')
            }
          />
          <Field label="Export package" value={state.status.exportStatus ?? '—'} />
          <Field
            label="KMZ export"
            value={
              state.status.kmzStatus === 'BLOCKED'
                ? `unavailable (${state.status.kmzBlockers.join(', ') || 'blocked'})`
                : (state.status.kmzStatus ?? '—')
            }
          />
        </dl>
      )}
    </div>
  );
}
