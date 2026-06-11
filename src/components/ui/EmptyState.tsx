import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  detail?: string;
}

export function EmptyState({ icon: Icon, title, detail }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <Icon className="size-7 text-ink-3/60" strokeWidth={1.5} />
      <div className="text-sm font-medium text-ink-2">{title}</div>
      {detail ? <div className="max-w-sm text-xs text-ink-3">{detail}</div> : null}
    </div>
  );
}
