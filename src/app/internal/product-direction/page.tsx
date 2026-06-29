import { notFound } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

// INTERNAL-ONLY surface. Gated behind NEXT_PUBLIC_FR_INTERNAL=1; returns 404 in any customer build so it
// never appears to customers and is not linked from the product navigation. It summarizes the canonical
// product direction (docs/product/fieldroute_product_direction.md) and the current audit priorities
// (docs/audits/) so any future session — human or AI — builds toward the same vision. Generic names only.

export const metadata = { title: 'Internal · Product Direction' };

const INTERNAL_ENABLED = (process.env.NEXT_PUBLIC_FR_INTERNAL ?? '').trim() === '1';

const PRINCIPLES: readonly string[] = [
  'Upload once — never make the user re-key data the files already contain.',
  'Source-backed or nothing — abstain/flag when uncertain; never invent geometry or numbers.',
  'Ask only when uncertain — confident placements are shown, not re-confirmed.',
  'Simple beats clever — one project, one page, one primary action. If the UI grows, we failed.',
  'Honest states — no silent live→mock fallback; unavailable means unavailable.',
  'The engine is the moat — source-backed redline + proof; not a generic PM board.',
];

const WORKFLOW: readonly string[] = [
  'Create / open a project (workspace).',
  'Upload a source package: plan PDF, KMZ/KML, bore log, photos, notes.',
  'App auto-extracts route, redline candidates, source anchors, and uncertainty.',
  'App shows a simple map + source-backed proof view.',
  'User reviews / accepts / corrects only the uncertain items.',
  'App produces approved redlines, progress, and a closeout / export package.',
];

const NOT: readonly string[] = [
  'Not a developer console or dev board.',
  'Not a generic Kanban / project-management board.',
  'Not a manual data-entry tool (manual rows/anchors are dev fallback only).',
  'Not a field-capture app yet (planned separate surface).',
  'Not a clone of any competitor — we build equivalent outcomes with our own engine.',
];

const PRIORITIES: readonly { sev: string; items: readonly string[] }[] = [
  {
    sev: 'P0',
    items: [
      'FR-AUDIT-001 — internal codename in customer browser title / UI.',
      'FR-AUDIT-002 — no app-level auth; tenant isolation via client header + external gate.',
      'FR-AUDIT-003 — customer-reachable showcase leaks env-var names + jargon on error.',
      'FR-AUDIT-004 — unbounded base64 uploads; no size cap.',
    ],
  },
  {
    sev: 'P1',
    items: [
      'FR-AUDIT-005 — named demo checklist doc with personal path.',
      'FR-AUDIT-006/007 — legacy mock surfaces + settings hidden only by redirect.',
      'FR-AUDIT-008 — docs describe redirected surfaces / wrong brand.',
      'FR-AUDIT-009 — engine jargon in live customer copy.',
      'FR-AUDIT-010/011 — extension-only validation; dishonest status chrome.',
    ],
  },
];

const NEXT_SLICE = 'Source Package → Auto Context → Simple Map/Proof Review: upload one package, '
  + 'show extracted route context, map shows route + redline candidates, PDF proof shows the source-backed '
  + 'redline, review queue shows only uncertain items, manual entry stays a dev fallback.';

function List({ items, ordered }: { items: readonly string[]; ordered?: boolean }) {
  const cls = 'mt-2 space-y-1.5 text-sm leading-relaxed text-ink-2';
  return ordered ? (
    <ol className={`${cls} list-decimal pl-5`}>{items.map((t) => <li key={t}>{t}</li>)}</ol>
  ) : (
    <ul className={`${cls} list-disc pl-5`}>{items.map((t) => <li key={t}>{t}</li>)}</ul>
  );
}

export default function InternalProductDirectionPage() {
  // Hard gate: any build without the internal flag returns 404 — customers never see this surface.
  if (!INTERNAL_ENABLED) notFound();

  return (
    <div>
      <PageHeader
        title="Product Direction — Internal"
        sub="Internal/dev reference only — not part of the customer product. Canonical source: docs/product/fieldroute_product_direction.md."
      />

      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        Internal tooling, gated behind <span className="font-mono">NEXT_PUBLIC_FR_INTERNAL=1</span>. Do not link
        this from customer navigation. Use generic names only.
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-ink">Product principles</h3>
          <List items={PRINCIPLES} />
        </Card>
        <Card>
          <h3 className="font-semibold text-ink">Main workflow (the only one)</h3>
          <List items={WORKFLOW} ordered />
        </Card>
        <Card>
          <h3 className="font-semibold text-ink">What the app is NOT</h3>
          <List items={NOT} />
        </Card>
        <Card>
          <h3 className="font-semibold text-ink">Audit priorities</h3>
          {PRIORITIES.map((p) => (
            <div key={p.sev} className="mt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-accent-strong">{p.sev}</div>
              <List items={p.items} />
            </div>
          ))}
          <p className="mt-3 text-xs text-ink-3">Full register: docs/audits/fieldroute_issue_register.json</p>
        </Card>
      </div>

      <Card className="mt-4">
        <h3 className="font-semibold text-ink">Next product slice</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{NEXT_SLICE}</p>
      </Card>
    </div>
  );
}
