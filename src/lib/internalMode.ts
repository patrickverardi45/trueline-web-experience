// Single source of truth for the internal/dev tooling gate. Customer mode must stay clean: manual
// source-anchor drawing, hand-entered bore-log rows, raw engine diagnostics, and the product-direction
// panel are engineering/QA fallbacks and are shown ONLY when this flag is set. NEXT_PUBLIC_* is inlined
// by Next at build, so this is safe to call from client components and reads consistently everywhere.
export function internalToolingEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_FR_INTERNAL ?? '').trim() === '1';
}
