import { ShieldCheck } from 'lucide-react';

// Minimal, honest top chrome. The previous topbar had a non-functional project switcher, a dead search
// box, and a "(mock)" signed-in avatar — all removed: they were dead click paths / mock junk, and there is
// no app-level auth behind the Access gate (P5 paused). Just the product name + a security indicator.
export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-white/90 px-6 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="size-2 rounded-full bg-emerald-500" />
        FieldRoute
      </div>
      <div className="ml-auto flex items-center gap-2 text-xs font-medium text-ink-3">
        <ShieldCheck className="size-4" strokeWidth={1.75} />
        Access-gated
      </div>
    </header>
  );
}
