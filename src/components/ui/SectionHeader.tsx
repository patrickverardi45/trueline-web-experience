import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  sub?: string;
  actionLabel?: string;
  actionHref?: string;
  right?: ReactNode;
}

export function SectionHeader({ title, sub, actionLabel, actionHref, right }: Props) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">{title}</h2>
        {sub ? <p className="mt-0.5 text-xs text-ink-3">{sub}</p> : null}
      </div>
      {right}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="text-xs font-semibold text-accent-strong hover:text-accent">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
