import type { StatusMeta } from '@/lib/status';

interface Props {
  meta: StatusMeta;
  /** Compact variant for dense tables. */
  size?: 'sm' | 'md';
}

export function StatusPill({ meta, size = 'md' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${meta.chip} ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
