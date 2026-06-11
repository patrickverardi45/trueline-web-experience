'use client';

import { useState } from 'react';

import { RUN_STATUS } from '@/lib/status';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EvidenceChain } from './EvidenceChain';
import { RunRail } from './RunRail';
import type { EvidenceRunBundle } from './types';

interface Props {
  bundles: EvidenceRunBundle[];
  initialRunId: string;
  crewNames: Record<string, string>;
}

export function ExplorerView({ bundles, initialRunId, crewNames }: Props) {
  const [selectedRunId, setSelectedRunId] = useState(initialRunId);
  const selected = bundles.find((b) => b.run.id === selectedRunId) ?? bundles[0];
  if (!selected) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Select a run">
        {bundles.map(({ run }) => {
          const meta = RUN_STATUS[run.status];
          const active = run.id === selected.run.id;
          return (
            <button
              key={run.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedRunId(run.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-line bg-white text-ink-2 hover:bg-canvas hover:text-ink'
              }`}>
              <span className={`size-2 rounded-full ${meta.dot}`} />
              {run.name}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionHeader
            title="The evidence chain"
            sub={`${selected.run.name} · every node cites where it came from`}
          />
          <EvidenceChain bundle={selected} crewNames={crewNames} />
        </div>
        <div>
          <SectionHeader title="Run summary" sub="Rollup, readiness, and jump-offs" />
          <RunRail bundle={selected} />
        </div>
      </div>
    </div>
  );
}
