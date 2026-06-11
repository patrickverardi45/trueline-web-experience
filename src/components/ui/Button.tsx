'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

const VARIANTS: Record<NonNullable<Props['variant']>, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-strong focus-visible:outline-accent disabled:bg-accent/50',
  secondary:
    'border border-line bg-white text-ink hover:bg-canvas focus-visible:outline-navy-700 disabled:text-ink-3',
  ghost: 'text-ink-2 hover:bg-navy-900/5 focus-visible:outline-navy-700',
};

export function Button({ children, variant = 'primary', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
      } ${VARIANTS[variant]} ${className}`}>
      {children}
    </button>
  );
}
