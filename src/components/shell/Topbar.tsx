import { ChevronDown, HardHat, Search } from 'lucide-react';

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-white/90 px-6 backdrop-blur">
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
        title="Project switcher — TrueLine v2 staging (single demo project)">
        <span className="size-2 rounded-full bg-emerald-500" />
        Brenham PH5 — v2 staging
        <ChevronDown className="size-3.5 text-ink-3" />
      </button>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink-3 md:flex">
          <Search className="size-4" />
          <span className="pr-10">Search runs, stations, tickets…</span>
          <kbd className="rounded border border-line bg-white px-1.5 font-mono text-[10px] text-ink-3">
            /
          </kbd>
        </div>
        <div
          className="flex size-8 items-center justify-center rounded-full bg-navy-850 text-white"
          title="Signed in as Field Ops (mock)">
          <HardHat className="size-4" strokeWidth={1.75} />
        </div>
      </div>
    </header>
  );
}
