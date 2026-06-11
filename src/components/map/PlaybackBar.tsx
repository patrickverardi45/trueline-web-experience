'use client';

import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';

import type { RedlinePlaybackStep } from '@/contracts';
import { timeOnly } from '@/lib/format';

const KIND_LABEL: Record<RedlinePlaybackStep['kind'], string> = {
  mobilize: 'Mobilize',
  'start-evidence': 'Start evidence',
  advance: 'Advance',
  'station-drop': 'Station drop',
  problem: 'Problem',
  'end-evidence': 'End evidence',
  submit: 'Submitted',
  review: 'Review',
};

const KIND_DOT: Record<RedlinePlaybackStep['kind'], string> = {
  mobilize: 'bg-slate-400',
  'start-evidence': 'bg-emerald-500',
  advance: 'bg-slate-400',
  'station-drop': 'bg-orange-500',
  problem: 'bg-red-500',
  'end-evidence': 'bg-blue-500',
  submit: 'bg-blue-500',
  review: 'bg-emerald-500',
};

interface Props {
  runName: string;
  steps: RedlinePlaybackStep[];
  index: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (index: number) => void;
  onClose: () => void;
}

export function PlaybackBar({ runName, steps, index, playing, onTogglePlay, onSeek, onClose }: Props) {
  const step = steps[index];
  if (!step) return null;

  return (
    <div className="absolute inset-x-4 bottom-4 z-10 rounded-xl border border-navy-700 bg-navy-900/95 px-4 py-3 text-white shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause playback' : 'Play playback'}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-strong">
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
        <button
          type="button"
          onClick={() => onSeek(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label="Previous step"
          className="rounded-lg p-1.5 text-slate-300 hover:bg-navy-700 disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onSeek(Math.min(steps.length - 1, index + 1))}
          disabled={index === steps.length - 1}
          aria-label="Next step"
          className="rounded-lg p-1.5 text-slate-300 hover:bg-navy-700 disabled:opacity-30">
          <ChevronRight className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className={`size-2 shrink-0 rounded-full ${KIND_DOT[step.kind]}`} />
            <span className="font-semibold">{KIND_LABEL[step.kind]}</span>
            {step.stationCode ? (
              <span className="rounded bg-navy-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                {step.stationCode}
              </span>
            ) : null}
            <span className="text-slate-400">{timeOnly(step.at)}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">
              {runName} · step {index + 1}/{steps.length}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-300">{step.note}</p>
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            step={1}
            value={index}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Playback position"
            className="mt-2 w-full accent-[#F4640E]"
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Exit playback"
          className="rounded-lg p-1.5 text-slate-300 hover:bg-navy-700">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
