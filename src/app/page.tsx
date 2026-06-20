import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ImageIcon, Ruler, ShieldCheck } from 'lucide-react';

import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { KpiStat } from '@/components/ui/KpiStat';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Brenham PH5 — v2 staging' };

// Single-project, read-only v2 staging summary. Numbers come from the committed durable
// redline manifest (real engine truth), not from the mock portfolio fixtures.
export default async function DashboardPage() {
  const manifest = await api.reviews.engineRedlineManifest();
  const { totals, bundleId, renderCommit, frontier, artifactCount } = manifest;

  return (
    <div>
      <PageHeader
        title="Brenham PH5 — v2 staging"
        sub="Read-only v2 staging · no upload / live render yet"
        actions={
          <Link
            href="/redlines"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
            Open redline review →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiStat label="Bore logs" value={String(totals.total)} sub={`frontier ${frontier}`} icon={Ruler} tone="accent" />
        <KpiStat label="Drawn redlines" value={String(totals.drawn)} sub={`of ${totals.total} accounted`} icon={CheckCircle2} />
        <KpiStat label="Covered" value={String(totals.covered)} sub="already on the plan" icon={ShieldCheck} />
        <KpiStat label="Blocked" value={String(totals.blocked)} sub="owner / source-gated" icon={AlertTriangle} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Link href="/redlines" className="group lg:col-span-2">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-ink group-hover:text-accent-strong">
                  v2 durable redline manifest
                </h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-3">
                  Real engine output — {totals.drawn} drawn · {totals.covered} covered · {totals.blocked}{' '}
                  blocked of {totals.total} bore logs, {artifactCount} final redline artifacts. Read-only;
                  nothing is uploaded or live-rendered in this staging build.
                </p>
              </div>
              <ImageIcon className="size-6 shrink-0 text-accent" />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-ink-3">Bundle</dt>
                <dd className="truncate font-mono text-ink">{bundleId}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Render / source</dt>
                <dd className="font-mono text-ink">{renderCommit}</dd>
              </div>
            </dl>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-strong">
              Open the redline review →
            </span>
          </Card>
        </Link>

        <Card>
          <h3 className="font-semibold text-ink">What is real vs demo</h3>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-3">
            <li>
              <span className="font-semibold text-ink">Real:</span> the v2 durable redline manifest on{' '}
              <Link href="/redlines" className="font-medium text-accent-strong underline">
                /redlines
              </Link>{' '}
              (bundle <span className="font-mono">{bundleId}</span>, render{' '}
              <span className="font-mono">{renderCommit}</span>).
            </li>
            <li>
              <span className="font-semibold text-ink">UI demo only — not engine data:</span> map, field
              feed, evidence, plans, packet, closeout, and the review queue use placeholder data.
            </li>
            <li>No upload or live engine processing yet — that is a later backend / job-runner lane.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
