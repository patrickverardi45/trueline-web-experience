import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Removes default padding for flush content (tables, maps). */
  flush?: boolean;
}

export function Card({ children, className = '', flush = false }: Props) {
  return (
    <div
      className={`rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(15,23,34,0.05)] ${
        flush ? '' : 'p-5'
      } ${className}`}>
      {children}
    </div>
  );
}
