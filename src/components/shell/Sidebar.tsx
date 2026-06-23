'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ImageIcon, Upload } from 'lucide-react';

// Demo nav = ONLY the demo-safe routes. The other contract-preview routes (map / plans / redlines /
// evidence / feed / closeout / packet / projects / settings) either SSR-fetch the Access-gated API (a 500
// behind the gate) or render placeholder/mock data, so they are intentionally hidden from the gated demo
// rather than shown as broken/junk click paths. They still exist by URL; they are just not advertised.
const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/showcase', label: 'Redline Showcase', icon: ImageIcon },
  { href: '/intake', label: 'Intake', icon: Upload },
] as const;

export function Sidebar() {
  const pathname = usePathname();
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
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((item) => {
          const { href, label, icon: Icon } = item;
          const base = 'match' in item && item.match ? item.match : href;
          const active =
            href === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-navy-700 text-white'
                  : 'text-slate-400 hover:bg-navy-800 hover:text-slate-200'
              }`}>
              <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
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
