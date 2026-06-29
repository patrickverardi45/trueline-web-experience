'use client';

// Multi-bore recognized step-through (Phase 3 Slice 3B + UX-parity). For a RECOGNIZED package it lists each
// engine-ready bore log; clicking one selects it and shows (a) a v1-style INFO CARD of the source-backed
// bore-log fields and (b) that bore's deterministic redline drawn on its correct plan sheet, with
// next/previous navigation and an honest per-bore geometry/source basis badge. Composed from existing reads:
//   * fetchRecognizedCorpusHandoff -> the per-bore list (log + bore span + render sheets + rbl id),
//   * fetchReviewedBoreLog        -> the source-backed bore-log fields (stations/span/print/depth/boc/date/crew),
//   * fetchJobArtifacts           -> the placed FINAL_REDLINE_PNG(s), joined to each bore by log id.
// Renders NOTHING for a non-recognized job or before the redline is generated. Honest by design: every field
// is source-backed (missing -> "not available", never invented); the redline is pixel-only on the PDF sheet
// (NO georeferenced map projection), and the badge says so.

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import {
  fetchJobArtifactBlob,
  fetchJobArtifacts,
  fetchRecognizedCorpusHandoff,
  fetchReviewedBoreLog,
  type JobArtifactRef,
  type ReviewedRowView,
} from '@/lib/api/productWrites';

interface BoreEntry {
  readonly logId: string;
  readonly reviewedBoreLogId: string | null;
  readonly startStation: string | null;
  readonly endStation: string | null;
  readonly span: string | null;          // "start → end" station, source-backed (never invented)
  readonly sheets: readonly number[];
  readonly artifacts: readonly JobArtifactRef[];
  readonly row: ReviewedRowView | null;  // source-backed bore-log fields for the info card
}

const EXTRACTION_LABEL: Record<string, string> = {
  TABLE_IMPORT: 'Uploaded file (table import)',
  MANUAL_ENTRY: 'Manual entry',
  OCR: 'OCR',
  TEXT_PARSE: 'Text parse',
};

export function ProductBoreStepThrough({ jobId, refreshKey, placed = false }: {
  jobId: string; refreshKey?: string; placed?: boolean;
}) {
  const [bores, setBores] = useState<readonly BoreEntry[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // No redline placed yet (not generated): nothing to step through, and the job has no artifact bundle, so
    // skip the reads entirely (avoids a benign-but-noisy 404 on the artifacts endpoint pre-Generate).
    if (!placed) { setBores([]); setUrls({}); setLoading(false); return; }
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
      const base = handoff.recognizedLogs
        .map((b) => {
          const span = b.boreSpan?.label
            ?? (b.boreSpan?.startStation && b.boreSpan?.endStation
              ? `${b.boreSpan.startStation} → ${b.boreSpan.endStation}` : null);
          return {
            logId: b.logId, reviewedBoreLogId: b.reviewedBoreLogId,
            startStation: b.boreSpan?.startStation ?? null, endStation: b.boreSpan?.endStation ?? null,
            span, sheets: b.renderSheets, artifacts: byLog.get(b.logId) ?? [],
          };
        })
        .filter((e) => e.artifacts.length > 0);   // only bores whose redline is actually placed
      // Source-backed bore-log fields per bore (one read per rbl; honest null if the rbl/row is unavailable).
      const entries: BoreEntry[] = await Promise.all(base.map(async (e) => {
        if (!e.reviewedBoreLogId) return { ...e, row: null };
        try {
          const rbl = await fetchReviewedBoreLog(jobId, e.reviewedBoreLogId);
          return { ...e, row: rbl.rows[0] ?? null };
        } catch {
          return { ...e, row: null };
        }
      }));
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
  }, [jobId, placed]);

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
  const row = cur.row;
  const ft = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v} ft`);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Placed redlines — step through each bore log</h3>
        <span className="text-xs text-ink-3">{bores.length} bore log{bores.length === 1 ? '' : 's'}</span>
      </div>
      <p className="mt-1 text-sm text-ink-3">
        Click a bore to see its bore-log details and its redline drawn on the correct plan sheet, or use the
        arrows to step through them. All fields come from your uploaded source — missing values say so.
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

        {/* Selected bore viewer: info card + redline proof */}
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

          {/* v1-style bore-log info card — every value source-backed; missing -> "not available". */}
          <div className="mt-2 rounded-lg border border-line bg-paper p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Bore-log details</h4>
            <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
              <InfoField label="Bore-log file" value={row?.sourceFile ?? null} />
              <InfoField label="Station start" value={cur.startStation ?? row?.startStation ?? null} />
              <InfoField label="Station end" value={cur.endStation ?? row?.endStation ?? null} />
              <InfoField label="Span / footage" value={ft(row?.footageFt)} />
              <InfoField label="Print (source)" value={row?.printRaw ?? null} />
              <InfoField label="Plan sheet(s)" value={sheetLabel === '—' ? null : sheetLabel} />
              <InfoField label="Date" value={row?.date ?? null} />
              <InfoField label="Crew" value={row?.crew ?? null} />
              <InfoField label="Depth (min)" value={ft(row?.depthMinFt)} />
              <InfoField label="BOC (min)" value={ft(row?.bocMinFt)} />
              <InfoField label="Review status" value={row ? row.reviewStatus.toLowerCase() : null} />
              <InfoField label="Extraction source"
                value={row ? (EXTRACTION_LABEL[row.extractionMethod] ?? row.extractionMethod) : null} />
              <InfoField label="Redline images" value={String(cur.artifacts.length)} />
            </dl>
          </div>

          {/* Honest per-bore geometry / source basis badge (no fake map projection). */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
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

/** One source-backed info field. A null/empty value renders an honest, muted "not available" — never an
 *  invented placeholder. */
function InfoField({ label, value }: { label: string; value: string | null }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className={missing ? 'truncate text-xs italic text-ink-3' : 'truncate text-sm text-ink'} title={missing ? 'not available' : value}>
        {missing ? 'not available' : value}
      </dd>
    </div>
  );
}
