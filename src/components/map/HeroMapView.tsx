'use client';

import { useEffect, useMemo, useState } from 'react';
import { MousePointerClick } from 'lucide-react';

import type { Project, RunStatus } from '@/contracts';
import { RUN_STATUS } from '@/lib/status';
import { EvidencePanel } from './EvidencePanel';
import { MapCanvas } from './MapCanvas';
import { PlaybackBar } from './PlaybackBar';
import type { MapRunBundle } from './types';

const FILTERS: Array<RunStatus | 'all'> = [
  'all',
  'complete',
  'in-progress',
  'blocked',
  'needs-review',
  'missing-evidence',
];

const STEP_INTERVAL_MS = 1600;

interface Props {
  project: Project;
  bundles: MapRunBundle[];
  initialRunId: string | null;
}

export function HeroMapView({ project, bundles, initialRunId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(initialRunId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');
  const [playbackOn, setPlaybackOn] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const selected = useMemo(
    () => bundles.find((b) => b.run.id === selectedId) ?? null,
    [bundles, selectedId],
  );
  const steps = selected?.steps ?? [];

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setStepIndex((i) => {
        if (i >= steps.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, STEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, steps.length]);

  function selectRun(id: string | null) {
    setSelectedId(id);
    setPlaybackOn(false);
    setPlaying(false);
    setStepIndex(0);
  }

  function startPlayback() {
    if (!steps.length) return;
    setPlaybackOn(true);
    setStepIndex(0);
    setPlaying(true);
  }

  const playback =
    playbackOn && selected && steps.length > 0
      ? {
          runId: selected.run.id,
          progress: steps[stepIndex]?.progress ?? 0,
          steps: steps.slice(0, stepIndex + 1),
        }
      : null;

  const countByStatus = (status: RunStatus | 'all') =>
    status === 'all' ? bundles.length : bundles.filter((b) => b.run.status === status).length;

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[540px] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(15,23,34,0.05)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="mr-2">
          <div className="text-sm font-semibold text-ink">Hero Map</div>
          <div className="text-xs text-ink-3">{project.name}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = statusFilter === f;
            const label = f === 'all' ? 'All' : RUN_STATUS[f].label;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-navy-850 text-white'
                    : 'border border-line bg-white text-ink-2 hover:bg-canvas'
                }`}>
                {f !== 'all' ? (
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: RUN_STATUS[f].hex }} />
                ) : null}
                {label}
                <span className={active ? 'text-slate-300' : 'text-ink-3'}>{countByStatus(f)}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto hidden items-center gap-1.5 text-xs text-ink-3 lg:flex">
          <MousePointerClick className="size-3.5" />
          Click a run to open its evidence
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[#0A1220]">
          <MapCanvas
            bundles={bundles}
            selectedId={selectedId}
            hoveredId={hoveredId}
            statusFilter={statusFilter}
            playback={playback}
            onSelect={(id) => selectRun(id)}
            onHover={setHoveredId}
          />

          {/* Legend */}
          <div className="absolute left-4 top-4 rounded-lg border border-navy-700 bg-navy-900/90 px-3 py-2.5 backdrop-blur">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Run status
            </div>
            <ul className="space-y-1">
              {(Object.keys(RUN_STATUS) as RunStatus[]).map((status) => (
                <li key={status} className="flex items-center gap-2 text-[11px] text-slate-300">
                  <span
                    className="h-[3px] w-5 rounded-full"
                    style={{ backgroundColor: RUN_STATUS[status].hex }}
                  />
                  {RUN_STATUS[status].label}
                </li>
              ))}
            </ul>
          </div>

          {playback && selected ? (
            <PlaybackBar
              runName={selected.run.name}
              steps={steps}
              index={stepIndex}
              playing={playing}
              onTogglePlay={() => {
                // Pressing play at the end restarts the playback.
                if (!playing && stepIndex >= steps.length - 1) setStepIndex(0);
                setPlaying((p) => !p);
              }}
              onSeek={(i) => {
                setStepIndex(i);
                setPlaying(false);
              }}
              onClose={() => {
                setPlaybackOn(false);
                setPlaying(false);
              }}
            />
          ) : null}

          {!selected ? (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-navy-700 bg-navy-900/90 px-4 py-2 text-xs text-slate-300 backdrop-blur">
              Select a run to inspect evidence, readiness, and playback
            </div>
          ) : null}
        </div>

        {selected ? (
          <EvidencePanel
            bundle={selected}
            playbackAvailable={steps.length > 0}
            onStartPlayback={startPlayback}
            onClose={() => selectRun(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
