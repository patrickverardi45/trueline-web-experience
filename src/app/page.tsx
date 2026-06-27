import Link from 'next/link';
import { ArrowRight, FolderPlus, ImageIcon } from 'lucide-react';

import { Card } from '@/components/ui/Card';

export const metadata = { title: 'FieldRoute — OSP redline & closeout' };

// Landing page. INTENTIONALLY static: it performs NO server-side data fetch, so it returns 200 even behind
// the Cloudflare Access gate (a server fetch to the gated API would receive the Access login HTML and crash
// with a 500). Every card links to a path whose data is read CLIENT-side (the browser carries the Access
// cookie same-origin).

interface LandingCard {
  readonly href: string;
  readonly title: string;
  readonly body: string;
  readonly icon: typeof ImageIcon;
  readonly cta: string;
}

const LANDING_CARDS: readonly LandingCard[] = [
  {
    href: '/intake?workspace=1',
    title: 'Start a new project',
    body: 'Create a project and upload your plan PDF, KMZ/KML route, bore log, and photos. Generate the redline, review or correct the placement, then assemble and download the closeout package.',
    icon: FolderPlus,
    cta: 'Open your projects',
  },
  {
    href: '/showcase',
    title: 'Finished redline gallery',
    body: 'Finished output quality — real drawn red redline strokes on real plan sheets, from deterministic redline data. This is what a completed package looks like.',
    icon: ImageIcon,
    cta: 'View finished redlines',
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <div className="rounded-2xl border border-line bg-gradient-to-br from-navy-900 to-navy-800 px-7 py-8 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-soft">FieldRoute</p>
        <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight">
          Automatic OSP redline handoff — from plan + bore log to drawn red strokes.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
          Upload a project’s plan, route, and bore log; FieldRoute places the redline from the real engine,
          flags any uncertain placement for your review, and assembles a closeout package you can download and
          print. Nothing is invented — an uncertain placement is flagged, never guessed.
        </p>
        <Link
          href="/intake?workspace=1"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
          Start a new project <ArrowRight className="size-4" />
        </Link>
      </div>

      {/* Entry cards */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {LANDING_CARDS.map((card) => {
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

      {/* How it works */}
      <Card className="mt-6">
        <h3 className="font-semibold text-ink">How FieldRoute works</h3>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-3">
          <li>
            <span className="font-semibold text-ink">Automatic redline</span> — for a recognized project, the
            proven engine redline is placed automatically.
          </li>
          <li>
            <span className="font-semibold text-ink">Review &amp; correct</span> — for an uploaded project, the
            engine proposes a redline candidate you accept, or correct on the plan when the placement is uncertain.
          </li>
          <li>
            The app <span className="font-semibold text-ink">does not guess</span> — when the source evidence is
            missing, it flags the placement for review or abstains instead of inventing geometry.
          </li>
          <li>
            <span className="font-semibold text-ink">Closeout package</span> — review everything on one page,
            then download the closeout PDF and data package.
          </li>
        </ul>
      </Card>
    </div>
  );
}
