'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ClipboardCheck, Download, FolderOpen, FolderPlus, Gauge, Home, LayoutDashboard, Lock,
  Map as MapIcon, PenLine, Upload, CheckCircle2,
} from 'lucide-react';

import { WORKSPACE_SECTIONS, sectionAnchorId, type WorkspaceSectionKey } from '@/lib/workspaceSections';
import { productApiEnabled } from '@/lib/api/liveV2Product';

// Top-level product nav. Simple and real: Home, New project, Projects. (New project + Projects both open the
// projects workspace at /intake — create from there, or pick an existing project.) The legacy contract-preview
// routes (map / plans / redlines / evidence / feed / closeout / packet / settings) and the redline gallery are
// reachable by URL but intentionally NOT advertised here — the nav stays product-clean.
const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/intake?workspace=1', label: 'New project', icon: FolderPlus },
  { href: '/intake?workspace=1', label: 'Projects', icon: FolderOpen },
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
};

const navLink = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active ? 'bg-navy-700 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-slate-200'
  }`;

/** The reactive nav body. In the internal workspace (/intake?workspace=1) the section links are SAME-PAGE
 *  anchors (the body renders all sections stacked on one page) with an IntersectionObserver scroll-spy for
 *  the active highlight; the simple top-level product nav is always shown above it. (useSearchParams -> wrapped in
 *  a Suspense boundary by the Sidebar shell.) */
function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspace = pathname === '/intake';   // the projects workspace (list + selected-project sections)
  const job = searchParams.get('job');

  const [activeKey, setActiveKey] = useState<WorkspaceSectionKey>('summary');

  // Scroll-spy: observe the body's <section id="ws-<key>"> elements (separate React tree -> read the DOM).
  // Retries until the sections mount (job detail loads after this nav).
  useEffect(() => {
    if (!workspace || !job) return;
    let observer: IntersectionObserver | null = null;
    let timer = 0;
    let tries = 0;
    const attach = () => {
      const els = WORKSPACE_SECTIONS
        .map((s) => document.getElementById(sectionAnchorId(s.key)))
        .filter((e): e is HTMLElement => e !== null);
      if (els.length === 0) {
        if (tries++ < 12) timer = window.setTimeout(attach, 300);
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible[0]) {
            const key = WORKSPACE_SECTIONS.find((s) => sectionAnchorId(s.key) === visible[0].target.id)?.key;
            if (key) setActiveKey(key);
          }
        },
        { rootMargin: '-25% 0px -65% 0px', threshold: [0, 0.5, 1] },
      );
      els.forEach((el) => observer!.observe(el));
    };
    timer = window.setTimeout(attach, 0);
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [workspace, job]);

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
      {/* Top-level product nav — always visible. */}
      {NAV.map(({ href, label, icon: Icon }) => {
        // 'Home' is exact-match; query-bearing entries (New project / Projects) aren't highlighted by the
        // simple matcher — the in-workspace section list below shows the active position instead.
        const active = href === '/' ? pathname === '/'
          : href.includes('?') ? false
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={label} href={href} className={navLink(active)}>
            <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}

      {/* Inside the projects workspace: the selected project's single-page section anchors (scroll-spy). */}
      {workspace && (
        <>
          <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Project workflow{job ? '' : ' · select a project'}
          </div>
          {WORKSPACE_SECTIONS.map(({ key, label }, i) => {
            const Icon = SECTION_ICON[key];
            if (!job) {
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
              <a
                key={key}
                href={`#${sectionAnchorId(key)}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveKey(key);
                  document.getElementById(sectionAnchorId(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={navLink(activeKey === key)}>
                <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
                <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
                {label}
              </a>
            );
          })}
        </>
      )}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-navy-900 print:hidden">
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
          FieldRoute
        </span>
      </Link>
      <Suspense fallback={<nav className="flex-1 px-3 pb-4" />}>
        <SidebarNav />
      </Suspense>
      <SidebarEnvironment />
    </aside>
  );
}

// Honest data-mode indicator: reflect whether the app is configured for the live product API or is
// rendering offline preview data, instead of a hardcoded "Live product API" claim (FR-AUDIT-011).
// productApiEnabled() reads a NEXT_PUBLIC_* flag, so it is inlined at build and safe in a client component.
function SidebarEnvironment() {
  const live = productApiEnabled();
  return (
    <div className="border-t border-navy-700 px-5 py-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        Environment
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
        <span className={`size-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-400'}`} />
        {live ? 'Live product API' : 'Preview data'}
      </div>
    </div>
  );
}
