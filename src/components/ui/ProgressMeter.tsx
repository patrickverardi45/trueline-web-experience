interface Props {
  /** 0 to 1. */
  value: number;
  /** CSS color for the fill; defaults to the safety-orange accent. */
  color?: string;
  className?: string;
}

export function ProgressMeter({ value, color = 'var(--color-accent)', className = '' }: Props) {
  const widthPct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`}>
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${widthPct}%`, backgroundColor: color }}
      />
    </div>
  );
}
