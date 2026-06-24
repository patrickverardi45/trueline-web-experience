'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ClipboardCheck, Download, Gauge, Home, ImageIcon, LayoutDashboard, Lock, Map as MapIcon,
  PenLine, Receipt, Upload, CheckCircle2,
} from 'lucide-react';

import { WORKSPACE_SECTIONS, coerceSection, workspaceHref, type WorkspaceSectionKey } from '@/lib/workspaceSections';

// Demo nav = ONLY the demo-safe routes. The other contract-preview routes (map / plans / redlines /
// evidence / feed / closeout / packet / projects / settings) either SSR-fetch the Access-gated API (a 500
// behind the gate) or render placeholder/mock data, so they are intentionally hidden from the gated demo
// rather than shown as broken/junk click paths. They still exist by URL; they are just not advertised.
const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/showcase', label: 'Redline Showcase', icon: ImageIcon },
  { href: '/intake', label: 'Intake', icon: Upload },
] as const;

const SECTION_ICON: Record<WorkspaceSectionKey, typeof Home> = {
  summary: LayoutDashboard,
  uploads: Upload,
  map: MapIcon,
  borelogs: ClipboardCheck,
  redlines: PenLine,
  review: CheckCircle2,
  closeout: Gauge,
  exports: Download,
  billing: Receipt,
};

const navLink = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active ? 'bg-navy-700 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-slate-200'
  }`;

/** The reactive nav body. Reads the URL: in the internal workspace (/intake?workspace=1) it shows the job
 *  workflow sections; everywhere else it shows the simple public demo nav. (useSearchParams -> wrapped in a
 *  Suspense boundary by the Sidebar shell.) */
function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspace = pathname === '/intake' && searchParams.get('workspace') === '1';

  if (workspace) {
    const job = searchParams.get('job');
    const active = coerceSection(searchParams.get('section'));
    return (
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        <Link
          href="/intake"
          className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-navy-800 hover:text-slate-200">
          <ArrowLeft className="size-4 shrink-0" strokeWidth={1.75} /> Demo workflows
        </Link>
        <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Workspace{job ? '' : ' · select a job'}
        </div>
        {WORKSPACE_SECTIONS.map(({ key, label }, i) => {
          const Icon = SECTION_ICON[key];
          if (!job) {
            // Locked until a job is selected (sections need a job to show real data).
            return (
              <span
                key={key}
                aria-disabled="true"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600">
                <span className="font-mono text-[10px] text-slate-600">{i + 1}</span>
                <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
                {label}
                <Lock className="ml-auto size-3.5 shrink-0" strokeWidth={1.75} />
              </span>
            );
          }
          return (
            <Link key={key} href={workspaceHref(job, key)} className={navLink(active === key)}>
              <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
              <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={navLink(active)}>
            <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-navy-900">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <path
              d="M4 17 L11 10 L14 13 L20 7"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="20" cy="7" r="2" fill="white" />
          </svg>
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">
          TrueLine
          <span className="ml-1.5 rounded bg-navy-700 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-slate-300">
            Preview
          </span>
        </span>
      </Link>
      <Suspense fallback={<nav className="flex-1 px-3 pb-4" />}>
        <SidebarNav />
      </Suspense>
      <div className="border-t border-navy-700 px-5 py-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Environment
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Gated staging · product API
        </div>
      </div>
    </aside>
  );
}
