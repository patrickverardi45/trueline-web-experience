import { Camera } from 'lucide-react';

interface Props {
  caption?: string;
  /** Mono-spaced station code shown under the caption. */
  stationCode?: string;
  className?: string;
}

/** Mock-mode stand-in for a field photo thumbnail. */
export function PhotoPlaceholder({ caption, stationCode, className = '' }: Props) {
  return (
    <figure className={`overflow-hidden rounded-lg border border-line bg-navy-900/[0.04] ${className}`}>
      <div className="flex aspect-[4/3] items-center justify-center">
        <Camera className="size-6 text-ink-3/60" strokeWidth={1.5} />
      </div>
      {caption || stationCode ? (
        <figcaption className="border-t border-line bg-white px-2 py-1.5">
          {caption ? <div className="truncate text-[11px] text-ink-2">{caption}</div> : null}
          {stationCode ? (
            <div className="font-mono text-[10px] text-ink-3">{stationCode}</div>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
