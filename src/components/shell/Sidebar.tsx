'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderOpen, FolderPlus, Home } from 'lucide-react';

// Top-level product nav — intentionally simple: Home, New project, Projects. (New project + Projects both
// open the guided project workspace at /intake — create a project there, or pick an existing one.) The guided
// 6-step workflow has its OWN status rail inside the workspace body, so the sidebar stays a thin top-level
// nav and never duplicates the steps. The legacy contract-preview routes and the redline gallery are reachable
// by URL but intentionally NOT advertised here.
const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/intake?workspace=1', label: 'New project', icon: FolderPlus },
  { href: '/intake?workspace=1', label: 'Projects', icon: FolderOpen },
] as const;

const navLink = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active ? 'bg-navy-700 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-slate-200'
  }`;

function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
      {NAV.map(({ href, label, icon: Icon }) => {
        // 'Home' is exact-match; the query-bearing entries (New project / Projects) aren't highlighted by the
        // simple matcher — the in-workspace step rail shows the active position instead.
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
    </aside>
  );
}
