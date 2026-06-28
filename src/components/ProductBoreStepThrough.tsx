'use client';

// Multi-bore recognized step-through (Phase 3 Slice 3B). For a RECOGNIZED package it lists each engine-ready
// bore log and shows that bore's deterministic redline drawn on its correct plan sheet, with next/previous
// navigation and an honest per-bore geometry/source basis badge. Composed from existing reads only:
//   * fetchRecognizedCorpusHandoff -> the per-bore list (log + bore span + render sheets), and
//   * fetchJobArtifacts -> the placed FINAL_REDLINE_PNG(s), joined to each bore by log id.
// It renders NOTHING for a non-recognized job (no recognized bores) or before the redline is generated (no
// artifacts yet), so single-REVIEW / abstain jobs are unaffected. Honest by design: the redline is pixel-only
// on the plan sheet — there is NO georeferenced map projection, and the badge says so (no fake coordinates).

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import {
  fetchJobArtifactBlob,
  fetchJobArtifacts,
  fetchRecognizedCorpusHandoff,
  type JobArtifactRef,
} from '@/lib/api/productWrites';

interface BoreEntry {
  readonly logId: string;
  readonly span: string | null;          // "start → end" station, source-backed (never invented)
  readonly sheets: readonly number[];
  readonly artifacts: readonly JobArtifactRef[];
}

export function ProductBoreStepThrough({ jobId, refreshKey }: { jobId: string; refreshKey?: string }) {
  const [bores, setBores] = useState<readonly BoreEntry[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [handoff, artifacts] = await Promise.all([
        fetchRecognizedCorpusHandoff(jobId),
        fetchJobArtifacts(jobId),
      ]);
      const byLog = new Map<string, JobArtifactRef[]>();
      for (const a of artifacts) {
        const list = byLog.get(a.logId) ?? [];
        list.push(a);
        byLog.set(a.logId, list);
      }
      const entries: BoreEntry[] = handoff.recognizedLogs
        .map((b) => {
          const span = b.boreSpan?.label
            ?? (b.boreSpan?.startStation && b.boreSpan?.endStation
              ? `${b.boreSpan.startStation} → ${b.boreSpan.endStation}` : null);
          return { logId: b.logId, span, sheets: b.renderSheets, artifacts: byLog.get(b.logId) ?? [] };
        })
        .filter((e) => e.artifacts.length > 0);   // only bores whose redline is actually placed
      const refs = entries.flatMap((e) => e.artifacts);
      const pairs = await Promise.all(refs.map((r) =>
        fetchJobArtifactBlob(jobId, r.path)
          .then((b) => [r.path, URL.createObjectURL(b)] as const)
          .catch(() => [r.path, ''] as const)));
      setUrls(Object.fromEntries(pairs.filter(([, u]) => u)));
      setBores(entries);
      setSel(0);
    } catch {
      setBores([]);
      setUrls({});
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    return () => { for (const u of Object.values(urls)) URL.revokeObjectURL(u); };
  }, [urls]);

  if (loading || bores.length === 0) return null;   // not a recognized multi-bore job (or not generated yet)

  const cur = bores[Math.min(sel, bores.length - 1)];
  const sheetLabel = cur.sheets.length > 0 ? cur.sheets.join(', ') : '—';

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Placed redlines — step through each bore log</h3>
        <span className="text-xs text-ink-3">{bores.length} bore log{bores.length === 1 ? '' : 's'}</span>
      </div>
      <p className="mt-1 text-sm text-ink-3">
        Each bore log’s redline is drawn on its plan sheet. Click a bore to view its redline, or use the
        arrows to step through them.
      </p>

      <div className="mt-3 grid gap-4 md:grid-cols-[14rem_1fr]">
        {/* Bore list */}
        <ul className="space-y-1">
          {bores.map((b, i) => (
            <li key={b.logId}>
              <button
                onClick={() => setSel(i)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  i === sel ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-3'
                }`}>
                <span className="block text-sm font-medium text-ink">Bore {i + 1}</span>
                <span className="block font-mono text-xs text-ink-2">{b.span ?? '—'}</span>
                <span className="block text-[11px] text-ink-3">sheet {b.sheets.join(', ') || '—'}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Selected bore viewer */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-semibold text-ink">Bore {sel + 1}</span>
              <span className="ml-2 font-mono text-xs text-ink-2">{cur.span ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSel((s) => Math.max(0, s - 1))}
                disabled={sel === 0}
                aria-label="Previous bore"
                className="rounded border border-line p-1 text-ink-2 hover:text-ink disabled:opacity-40">
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setSel((s) => Math.min(bores.length - 1, s + 1))}
                disabled={sel >= bores.length - 1}
                aria-label="Next bore"
                className="rounded border border-line p-1 text-ink-2 hover:text-ink disabled:opacity-40">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Honest per-bore geometry / source basis badge (no fake map projection). */}
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
            <MapPin className="size-3.5" /> Pixel-only on plan sheet {sheetLabel} — not georeferenced
          </div>

          <div className="mt-2 space-y-3">
            {cur.artifacts.map((a) => (
              urls[a.path] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={a.path} src={urls[a.path]} alt={`Redline on plan sheet ${sheetLabel}`}
                  className="w-full rounded-lg border border-line bg-white" />
              ) : (
                <div key={a.path} className="rounded-lg border border-line bg-paper p-3 text-xs text-ink-3">
                  Redline image unavailable.
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
