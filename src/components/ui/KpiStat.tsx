import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/Card';

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: 'default' | 'accent' | 'danger';
}

export function KpiStat({ label, value, sub, icon: Icon, tone = 'default' }: Props) {
  const iconClasses =
    tone === 'accent'
      ? 'bg-accent-soft text-accent-strong'
      : tone === 'danger'
        ? 'bg-red-50 text-red-600'
        : 'bg-navy-900/5 text-navy-700';
  return (
    <Card className="flex items-center gap-4">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClasses}`}>
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
        <div className="text-xl font-semibold text-ink">{value}</div>
        {sub ? <div className="truncate text-xs text-ink-3">{sub}</div> : null}
      </div>
    </Card>
  );
}
