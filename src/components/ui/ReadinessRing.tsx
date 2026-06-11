interface Props {
  /** 0–100. */
  score: number;
  size?: number;
  label?: string;
}

function ringColor(score: number): string {
  if (score >= 90) return 'var(--color-status-complete)';
  if (score >= 60) return 'var(--color-status-review)';
  return 'var(--color-status-blocked)';
}

export function ReadinessRing({ score, size = 56, label }: Props) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, score));
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox="0 0 56 56"
        role="img"
        aria-label={`Closeout readiness ${clamped}%`}>
        <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke={ringColor(clamped)}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 28 28)"
        />
        <text
          x="28"
          y="29"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-[var(--color-ink)] text-[13px] font-semibold">
          {clamped}
        </text>
      </svg>
      {label ? <div className="text-xs leading-tight text-ink-3">{label}</div> : null}
    </div>
  );
}
