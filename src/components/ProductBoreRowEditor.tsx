'use client';

// One bore-row's REVIEW/EDIT/CONFIRM surface (W3). Replaces the old plain read-only table row: a customer
// can see every canonical field with an honest absence state, edit any of them (nullable-aware — clearing a
// field submits null, never a blank-that-looks-confirmed), and confirm the row as-is or save corrections.
// Untouched confirms submit CONFIRMED; edited-and-saved rows submit CORRECTED with only the changed fields.
//
// Falls back gracefully: on a 404/405 from an older backend (submitRowReview's `notAvailable`), this shows
// "Per-row review not available on this server yet." and leaves the row otherwise inert — the caller's
// legacy bulk-confirm path still works.

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Image as ImageIcon, Pencil } from 'lucide-react';

import {
  fetchBorelogSourcePageBlob,
  handwrittenBorelogEnabled,
  submitRowReview,
  type ReviewedRowView,
} from '@/lib/api/productWrites';

const PASS = new Set(['CONFIRMED', 'CORRECTED']);

type FieldKind = 'text' | 'number';

interface FieldDef {
  readonly key: string;        // snake_case correction key (matches the pinned raw.* field name)
  readonly label: string;
  readonly kind: FieldKind;
  readonly get: (row: ReviewedRowView) => string | number | null;
}

const FIELDS: readonly FieldDef[] = [
  { key: 'bore_id', label: 'Bore ID', kind: 'text', get: (r) => r.boreId },
  { key: 'start_station', label: 'Start station', kind: 'text', get: (r) => r.startStation || null },
  { key: 'end_station', label: 'End station', kind: 'text', get: (r) => r.endStation || null },
  { key: 'footage_ft', label: 'Footage (ft)', kind: 'number', get: (r) => r.footageFt },
  { key: 'depth_ft', label: 'Depth (ft)', kind: 'number', get: (r) => r.depthFt ?? r.depthMinFt },
  { key: 'boc_ft', label: 'BOC (ft)', kind: 'number', get: (r) => r.bocFt ?? r.bocMinFt },
  { key: 'date', label: 'Date', kind: 'text', get: (r) => r.date },
  { key: 'crew', label: 'Crew', kind: 'text', get: (r) => r.crew },
  {
    key: 'print_raw', label: 'Plan sheet / print', kind: 'text',
    get: (r) => r.printRaw ?? (r.sheetRefs.length > 0 ? r.sheetRefs.join(', ') : null),
  },
  { key: 'notes', label: 'Notes', kind: 'text', get: (r) => r.notes },
];

function isEmpty(v: string | number | null): boolean {
  return v === null || v === undefined || v === '';
}

function toEditString(v: string | number | null): string {
  return isEmpty(v) ? '' : String(v);
}

const EXTRACTION_BADGE: Record<string, string> = {
  OCR: 'AI-extracted · unreviewed',
  TEXT_PARSE: 'Parsed from text · unreviewed',
};

const CONFIDENCE_TONE: Record<string, string> = {
  LOW: 'bg-amber-100 text-amber-800',
  MEDIUM: 'bg-sky-100 text-sky-800',
};

function Chip({ tone, title, children }: { tone: string; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {children}
    </span>
  );
}

/** Source-page raster preview (flag-gated: handwrittenBorelogEnabled()). ANY fetch failure — including the
 *  flag being off, no upload/page to preview, or a non-OK response — degrades to text, never a broken <img>. */
function SourcePagePreview({ jobId, uploadId, pageIndex }: { jobId: string; uploadId: string; pageIndex: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetchBorelogSourcePageBlob(jobId, uploadId, pageIndex)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jobId, uploadId, pageIndex]);

  if (failed) return <p className="text-xs italic text-ink-3">Source page preview unavailable.</p>;
  if (!url) return <p className="text-xs text-ink-3">Loading source page…</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`Source page ${pageIndex + 1}`} className="max-h-64 w-full rounded border border-line bg-white object-contain" />;
}

export function ProductBoreRowEditor({
  jobId, rblId, uploadId, uploadFilename, row, disabled, readOnly, onChanged,
}: {
  jobId: string;
  rblId: string;
  uploadId: string | null;
  // The ORIGINAL customer-uploaded filename for this row's source file (resolved by the caller from the
  // job's uploads list) — shown on the Source line in place of whatever internal name the backend stored
  // the bytes under (e.g. "payload.pdf"). Null degrades to the stored name, honestly.
  uploadFilename?: string | null;
  row: ReviewedRowView;
  disabled?: boolean;
  // Already-reviewed rows (engine-ready lane): show every field honestly but no Edit/Confirm actions — a
  // banked human review grade is never reopened from this read surface.
  readOnly?: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);

  const reviewed = PASS.has(row.reviewStatus);
  const badge = reviewed ? null : EXTRACTION_BADGE[row.extractionMethod] ?? null;
  const footage = row.footageFt;
  const derived = row.footageDerivation === 'DERIVED_FROM_STATIONS';

  function beginEdit() {
    const init: Record<string, string> = {};
    for (const f of FIELDS) init[f.key] = toEditString(f.get(row));
    setEdits(init);
    setEditing(true);
    setExpanded(true);
    setError(null);
  }

  async function submit(decision: Parameters<typeof submitRowReview>[3]) {
    setBusy(true);
    setError(null);
    try {
      const result = await submitRowReview(jobId, rblId, row.rowId, decision);
      if (!result.ok) {
        setNotAvailable(true);
        return;
      }
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'review failed');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    await submit({ status: 'CONFIRMED' });
  }

  async function onSaveCorrections() {
    const corrections: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const original = toEditString(f.get(row));
      const next = (edits[f.key] ?? '').trim();
      if (next === original) continue;
      if (f.kind === 'number') {
        if (next === '') { corrections[f.key] = null; continue; }
        const n = Number(next);
        if (!Number.isFinite(n)) {
          setError(`${f.label}: not a number`);
          return;
        }
        corrections[f.key] = n;
      } else {
        corrections[f.key] = next === '' ? null : next;
      }
    }
    if (Object.keys(corrections).length === 0) {
      setEditing(false);
      return;
    }
    await submit({ status: 'CORRECTED', corrections });
  }

  const previewPageIndex = row.sourceEvidence?.pageIndex ?? null;
  const showPreview = handwrittenBorelogEnabled() && !!uploadId && previewPageIndex !== null && expanded;

  return (
    <div className="border-b border-line/60 py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-sm font-medium text-ink hover:text-accent-strong">
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span className="font-mono">{row.startStation || '—'} → {row.endStation || '—'}</span>
        </button>
        {row.boreId && <span className="text-xs text-ink-3">bore {row.boreId}</span>}
        <span className="text-xs text-ink-2">
          {footage !== null ? `${footage} ft` : '—'}
          {derived && (
            <Chip tone="ml-1 bg-line text-ink-2" title="Computed from start/end stations — confirm or correct">
              derived
            </Chip>
          )}
        </span>
        {badge && <Chip tone="bg-indigo-100 text-indigo-800">{badge}</Chip>}
        {row.confidence && <Chip tone={CONFIDENCE_TONE[row.confidence]}>{row.confidence.toLowerCase()} confidence</Chip>}
        {row.warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700" title={row.warnings.join('; ')}>
            <AlertTriangle className="size-3.5" /> {row.warnings.length} warning{row.warnings.length === 1 ? '' : 's'}
          </span>
        )}
        <span className="text-xs text-ink-3">{row.reviewStatus.toLowerCase()}</span>
        <span className="ml-auto flex items-center gap-2">
          {!readOnly && !editing && (
            <>
              <button
                type="button"
                onClick={beginEdit}
                disabled={disabled || busy}
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs text-ink-2 hover:text-ink disabled:opacity-50">
                <Pencil className="size-3" /> Edit
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={disabled || busy}
                className="rounded border border-accent px-2 py-0.5 text-xs font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
                {busy ? 'Confirming…' : 'Confirm'}
              </button>
            </>
          )}
        </span>
      </div>

      {notAvailable && (
        <p className="mt-1 text-xs text-ink-3">Per-row review not available on this server yet.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {expanded && (
        <div className="mt-2 rounded-lg border border-line/60 bg-paper p-3">
          <div className={showPreview ? 'grid gap-3 md:grid-cols-2' : ''}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {FIELDS.map((f) => {
                const value = f.get(row);
                const evidence = row.cellEvidence[f.key];
                let chip: { label: string; tone: string; title?: string } | null = null;
                if (evidence) {
                  if (evidence.status === 'NOT_PRESENT') chip = { label: 'Not present', tone: 'bg-line text-ink-3' };
                  else if (evidence.status === 'UNREADABLE') chip = { label: 'Unreadable', tone: 'bg-amber-100 text-amber-800' };
                  else if (evidence.status === 'VARIED') {
                    chip = {
                      label: 'Varies across stations', tone: 'bg-sky-100 text-sky-800',
                      title: 'Readable per-station values disagree — see the readings below.',
                    };
                  }
                } else if (isEmpty(value)) {
                  chip = { label: 'Not present', tone: 'bg-line text-ink-3' };
                }
                return (
                  <div key={f.key}>
                    <dt className="text-[11px] text-ink-3">{f.label}</dt>
                    {editing ? (
                      <>
                        {/* The evidence status is ALSO shown as a visible chip while editing — an <input>
                            placeholder alone (greyed, non-selectable, invisible once typed into, and not
                            real textContent) is not an honest "distinct visible state" on its own. */}
                        {chip && <Chip tone={chip.tone} title={chip.title}>{chip.label}</Chip>}
                        <input
                          value={edits[f.key] ?? ''}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          placeholder={chip ? chip.label : undefined}
                          className="mt-0.5 w-full rounded-md border border-line px-1.5 py-0.5 font-mono text-xs text-ink" />
                      </>
                    ) : chip && isEmpty(value) ? (
                      <dd><Chip tone={chip.tone} title={chip.title}>{chip.label}</Chip></dd>
                    ) : (
                      <dd className="font-mono text-xs text-ink">{value}{chip && <span className="ml-1"><Chip tone={chip.tone} title={chip.title}>{chip.label}</Chip></span>}</dd>
                    )}
                    {evidence?.verbatim && (
                      <p className="mt-0.5 truncate text-[10px] italic text-ink-3" title={evidence.verbatim}>
                        “{evidence.verbatim}”
                      </p>
                    )}
                  </div>
                );
              })}
            </dl>

            {showPreview && previewPageIndex !== null && uploadId && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-[11px] text-ink-3"><ImageIcon className="size-3" /> Source page</p>
                <SourcePagePreview jobId={jobId} uploadId={uploadId} pageIndex={previewPageIndex} />
              </div>
            )}
          </div>

          {row.stationReadings.length > 0 && (
            <div className="mt-3 border-t border-line/60 pt-2">
              <p className="text-[11px] text-ink-3">Readings along the bore</p>
              <table className="mt-1 w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-3">
                    <th className="pr-3 font-medium">Station</th>
                    <th className="pr-3 font-medium">Depth</th>
                    <th className="pr-3 font-medium">BOC</th>
                    <th className="font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {row.stationReadings.map((sr, i) => (
                    <tr key={i} className="text-ink-2">
                      <td className="pr-3 font-mono">{sr.station ?? '—'}</td>
                      <td className="pr-3 font-mono">{sr.depthFt ?? '—'}</td>
                      <td className="pr-3 font-mono">{sr.bocFt ?? '—'}</td>
                      <td>{sr.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {row.sourceEvidence && (
            <p className="mt-2 text-[10px] text-ink-3">
              {/* Prefer the ORIGINAL uploaded filename (resolved by the caller from the job's uploads list)
                  over whatever internal name the backend stored the bytes under. */}
              Source: {uploadFilename ?? row.sourceEvidence.file ?? 'uploaded file'}
              {row.sourceEvidence.pageIndex !== null ? `, page ${row.sourceEvidence.pageIndex + 1}` : ''}
              {row.sourceEvidence.sha256 ? ` · ${row.sourceEvidence.sha256.slice(0, 8)}…` : ''}
            </p>
          )}

          {editing && (
            <div className="mt-3 flex items-center gap-2 border-t border-line/60 pt-2">
              <button
                type="button"
                onClick={onSaveCorrections}
                disabled={busy}
                className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                {busy ? 'Saving…' : 'Save corrections'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null); }}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1 text-xs text-ink-2 hover:text-ink disabled:opacity-50">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
