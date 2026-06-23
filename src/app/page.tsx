import Link from 'next/link';
import { ArrowRight, CheckCircle2, ImageIcon, Layers, Upload } from 'lucide-react';

import { Card } from '@/components/ui/Card';

export const metadata = { title: 'FieldRoute — gated staging demo' };

// Demo-safe landing page. INTENTIONALLY static: it performs NO server-side data fetch, so it returns 200
// even behind the Cloudflare Access gate (a server fetch to the gated API would receive the Access login
// HTML and crash with a 500). Every card links to a path whose data is read CLIENT-side (the browser
// carries the Access cookie same-origin). No KPI fetch, no stale dashboard panels, no "nothing uploaded
// yet" copy — just a guided front door to the capabilities that exist today.

interface DemoCard {
  readonly href: string;
  readonly title: string;
  readonly body: string;
  readonly icon: typeof ImageIcon;
  readonly cta: string;
}

const DEMO_CARDS: readonly DemoCard[] = [
  {
    href: '/showcase',
    title: 'Completed Redline Showcase',
    body: 'Finished output quality — real drawn red redline strokes on real plan sheets, from deterministic redline data. This is what a completed package looks like.',
    icon: ImageIcon,
    cta: 'View the finished redlines',
  },
  {
    href: '/intake?job=demo-review-acceptance',
    title: 'Live REVIEW Acceptance Workflow',
    body: 'The engine generates a source-backed redline candidate from a job’s own plan + reviewed bore-log. You accept or reject it — no hand-drawing. REVIEW is a first-class output, never relabeled as automatic.',
    icon: CheckCircle2,
    cta: 'Generate → accept a candidate',
  },
  {
    href: '/intake?job=demo-cross-sheet-review',
    title: 'Cross-Sheet REVIEW Workflow',
    body: 'A bore that spans two plan sheets: the engine renders a REVIEW leg on each sheet with honest matchline caveats. Full coverage, still REVIEW — it does not claim automatic placement it cannot prove.',
    icon: Layers,
    cta: 'Generate a two-sheet candidate',
  },
  {
    href: '/intake',
    title: 'Upload Intake / Job Workspace',
    body: 'The full operator workspace: create a job, upload plans + bore logs, and run the reviewed-bore-log gate to engine-ready. This is where a real package starts.',
    icon: Upload,
    cta: 'Open the workspace',
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <div className="rounded-2xl border border-line bg-gradient-to-br from-navy-900 to-navy-800 px-7 py-8 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-soft">
          FieldRoute · gated staging preview
        </p>
        <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight">
          Automatic OSP redline handoff — from plan + bore log to drawn red strokes.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
          Pick a starting point below. Each one is a real proof of a capability that exists today — finished
          deterministic redlines, the live engine-REVIEW accept/reject workflow, and the operator intake
          workspace. Start with the showcase, then walk the live workflow.
        </p>
      </div>

      {/* Demo entry cards */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {DEMO_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <div className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink group-hover:text-accent-strong">{card.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-3">{card.body}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-strong">
                      {card.cta}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* How to read this demo */}
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">How to read this demo</h3>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-3">
          <li>
            <span className="font-semibold text-ink">Completed Redline Showcase</span> = finished output
            quality from real deterministic redline data.
          </li>
          <li>
            <span className="font-semibold text-ink">Live REVIEW Workflow</span> = an engine-generated
            redline candidate that a human accepts or rejects.
          </li>
          <li>
            <span className="font-semibold text-ink">REVIEW</span> means the engine found a source-backed
            candidate, but the source documents do not prove a full automatic placement.
          </li>
          <li>
            The app <span className="font-semibold text-ink">does not guess</span> when the source evidence
            is missing — it abstains or asks for review instead of inventing geometry.
          </li>
        </ul>
      </Card>
    </div>
  );
}
