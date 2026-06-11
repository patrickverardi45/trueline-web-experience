import type { ReactNode } from 'react';

interface Props {
  title: string;
  sub?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, sub, actions }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-ink-3">{sub}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
