'use client';

// Bore-log section for one selected job (product mode). SOURCE/REVIEW oriented — NOT a data-entry form.
// Main path: show the uploaded bore log's status + (when the project is engine-ready) the reviewed bore
// rows READ-ONLY; otherwise the EXTRACTION-first flow — "Extract bore rows from the uploaded file" runs a
// deterministic table read of the uploaded .xlsx/.csv (NOT OCR, no fabricated confidence, no geometry) into
// rows the operator reviews + confirms before placement. Hand-entry of rows is demoted to a collapsed
// "Advanced manual review (temporary fallback)" — never the primary workflow. No fake extraction, no fake
// rows: seeded/example jobs use their real pre-seeded reviewed rows.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { internalToolingEnabled } from '@/lib/internalMode';
import {
  addReviewedRows,
  createReviewedBoreLog,
  defineSegmentGroup,
  extractBoreLogRows,
  fetchReviewQueue,
  fetchReviewedBoreLog,
  reviewReviewedRow,
  setGroupingStatus,
  type ManualRowInput,
  type ReviewedBoreLogView,
  type ReviewQueueView,
  type SegmentRelation,
} from '@/lib/api/productWrites';

const RBL_ID = 'rbl-main';
const PASS = new Set(['CONFIRMED', 'CORRECTED']);

type Phase = 'loading' | 'absent' | 'ready' | 'error';

function is404(err: unknown): boolean {
  return err instanceof Error && /HTTP 404/.test(err.message);
}
function rid(): string {
  return 'row-' + Math.random().toString(36).slice(2, 8);
}
function gid(): string {
  return 'grp-' + Math.random().toString(36).slice(2, 8);
}

export function ProductReviewedBoreLogGate({
  jobId,
  boreLogUploads,
  onChanged,
}: {
  jobId: string;
  boreLogUploads: readonly { uploadId: string; filename: string }[];
  // Notify the workspace after an extract / confirm so engine-readiness re-reads and the Redline step unlocks.
  onChanged?: () => void;
}) {
  const [sourceUploadId, setSourceUploadId] = useState(boreLogUploads[0]?.uploadId ?? '');
  const [phase, setPhase] = useState<Phase>('loading');
  const [rbl, setRbl] = useState<ReviewedBoreLogView | null>(null);
  const [queue, setQueue] = useState<ReviewQueueView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startStation, setStartStation] = useState('0+00');
  const [endStation, setEndStation] = useState('2+99');
  const [note, setNote] = useState('');
  const [members, setMembers] = useState<Record<string, boolean>>({});
  const [relation, setRelation] = useState<SegmentRelation>('SEPARATE_BORE');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [record, q] = [await fetchReviewedBoreLog(jobId, RBL_ID), await fetchReviewQueue(jobId, RBL_ID)];
      setRbl(record);
      setQueue(q);
      setPhase('ready');
    } catch (e) {
      if (is404(e)) {
        setPhase('absent');
        return;
      }
      setError(e instanceof Error ? e.message : 'unavailable');
      setPhase('error');
    }
  }, [jobId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const boreLogIds = boreLogUploads.map((u) => u.uploadId).join('|');
  useEffect(() => {
    const ids = boreLogIds ? boreLogIds.split('|') : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSourceUploadId((prev) => (prev && ids.includes(prev) ? prev : (ids[0] ?? '')));
  }, [boreLogIds]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.(); // re-read engine-readiness in the workspace so the Redline step unlocks
    } catch (e) {
      setError(e instanceof Error ? e.message : 'action failed');
    } finally {
      setBusy(false);
    }
  }

  async function onAddRow() {
    if (!rbl || !startStation.trim() || !endStation.trim()) return;
    const row: ManualRowInput = {
      rowId: rid(),
      startStation: startStation.trim(),
      endStation: endStation.trim(),
      note: note.trim() || undefined,
    };
    await act(() => addReviewedRows(jobId, RBL_ID, rbl.sourceUploadId || sourceUploadId, [row]));
    setStartStation('');
    setEndStation('');
    setNote('');
  }

  async function onReject(rowId: string) {
    const reason = window.prompt('Reason for rejecting this row?')?.trim();
    if (!reason) return;
    await act(() => reviewReviewedRow(jobId, RBL_ID, rowId, { toStatus: 'REJECTED', reason }));
  }

  async function onCreateGroup() {
    const picked = Object.entries(members).filter(([, v]) => v).map(([k]) => k);
    if (picked.length === 0) return;
    await act(() => defineSegmentGroup(jobId, RBL_ID, gid(), picked, relation));
    setMembers({});
  }

  // Extraction-first main path: ensure a reviewed-bore-log exists, then deterministically extract the bore
  // rows from the uploaded file (TABLE_IMPORT, UNREVIEWED — a human reviews them next).
  async function onExtract() {
    if (!effectiveSourceUploadId) return;
    await act(async () => {
      if (phase === 'absent') await createReviewedBoreLog(jobId, RBL_ID, effectiveSourceUploadId);
      await extractBoreLogRows(jobId, RBL_ID);
    });
  }

  // Confirm the extracted rows and group them so the project becomes engine-ready — without diving into the
  // Advanced manual tooling. Groups all rows as separate bores (one bore span per uploaded file).
  async function onConfirmReady() {
    await act(async () => {
      for (const r of rows) {
        if (!PASS.has(r.reviewStatus)) {
          await reviewReviewedRow(jobId, RBL_ID, r.rowId, { toStatus: 'CONFIRMED' });
        }
      }
      const ids = rows.map((r) => r.rowId);
      if (ids.length > 0 && (rbl?.groups.length ?? 0) === 0) {
        const groupId = gid();
        await defineSegmentGroup(jobId, RBL_ID, groupId, ids, 'SEPARATE_BORE');
        await setGroupingStatus(jobId, RBL_ID, groupId, 'CONFIRMED');
      }
    });
  }

  const rows = rbl?.rows ?? [];
  const passedRows = rows.filter((r) => PASS.has(r.reviewStatus));
  const effectiveSourceUploadId = sourceUploadId || boreLogUploads[0]?.uploadId || '';
  const hasUpload = boreLogUploads.length > 0;
  const ready = !!queue?.engineReady;
  // Hand-entry / manual row review is an internal/QA fallback only — the customer workflow is automatic
  // extraction + confirm. The whole advanced block is gated behind the internal tooling flag so customers
  // are never asked to recreate bore-log rows by hand (FieldRoute product direction).
  const showAdvanced = internalToolingEnabled() && hasUpload && phase !== 'loading' && phase !== 'error';

  return (
    <div>
      <p className="text-sm text-ink-3">
        The uploaded bore log is the source the engine places the redline against. You review or correct it
        here — you don’t re-enter it by hand.
      </p>

      {/* Status pill (source/review oriented) */}
      {hasUpload && phase !== 'loading' && phase !== 'error' && (
        <div className="mt-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {ready ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {ready ? 'Bore log reviewed & ready' : rows.length > 0 ? 'Bore rows extracted — needs review' : 'Bore log uploaded — extract & review'}
          </span>
        </div>
      )}

      {/* ---- Main body by state ---- */}
      {!hasUpload ? (
        <Card className="mt-3">
          <p className="text-sm text-ink-3">
            Upload a bore log in the <span className="font-medium">Project files</span> section first — the
            redline is placed against the bore stations in your bore-log file.
          </p>
        </Card>
      ) : phase === 'loading' ? (
        <p className="mt-3 text-sm text-ink-3">Loading bore log…</p>
      ) : phase === 'error' ? (
        <Card className="mt-3">
          <p className="text-sm text-ink-3">
            Bore log temporarily unavailable — check your connection. No data is shown rather than
            placeholder values.{internalToolingEnabled() && <span className="font-mono text-xs"> ({error})</span>}
          </p>
        </Card>
      ) : ready ? (
        /* READY: show the reviewed bore rows READ-ONLY (trusted evidence). No entry form on the main path. */
        <Card className="mt-3">
          <h4 className="font-medium text-ink">Bore rows ({rows.length})</h4>
          <p className="mt-1 text-xs text-ink-3">
            These bore rows have been reviewed for this project — the engine uses them to place the redline.
            Generate the redline in the <span className="font-medium">Redline</span> section.
          </p>
          {rows.length > 0 && (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-3">
                  <th className="py-1.5 pr-3 font-medium">Start → End station</th>
                  <th className="py-1.5 font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowId} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-ink">{r.startStation} → {r.endStation}</td>
                    <td className="py-1.5 text-ink-2">{r.reviewStatus.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : rows.length === 0 ? (
        /* NOT READY, no rows yet: EXTRACTION is the main path (deterministic table read of the upload). */
        <Card className="mt-3">
          <h4 className="font-medium text-ink">Extract the bore rows from your uploaded file</h4>
          <p className="mt-1 text-sm text-ink-3">
            FieldRoute reads the bore stations directly from your uploaded bore-log file — a deterministic table
            read, not OCR, and nothing is guessed. You review the extracted rows before any redline is placed.
          </p>
          <button
            onClick={onExtract}
            disabled={busy || !effectiveSourceUploadId}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            {busy ? 'Extracting…' : 'Extract bore rows from the uploaded file'}
          </button>
          <p className="mt-2 text-xs text-ink-3">
            No rows are placed until you confirm them.
            {internalToolingEnabled() && (
              <span> Hand-entry remains available under <span className="font-medium">Advanced manual review</span> below.</span>
            )}
          </p>
        </Card>
      ) : (
        /* NOT READY, rows extracted: review + confirm them (no hand-entry on the main path). */
        <Card className="mt-3">
          <h4 className="font-medium text-ink">Extracted bore rows — review &amp; confirm ({rows.length})</h4>
          <p className="mt-1 text-xs text-ink-3">
            Extracted from your uploaded file (deterministic table read). Confirm them to enable redline
            placement — nothing is placed until you do.
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th className="py-1.5 pr-3 font-medium">Start → End station</th>
                <th className="py-1.5 pr-3 font-medium">Source</th>
                <th className="py-1.5 font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowId} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-ink">{r.startStation} → {r.endStation}</td>
                  <td className="py-1.5 pr-3 text-xs text-ink-3">
                    {r.extractionMethod === 'TABLE_IMPORT' ? 'extracted · needs review' : 'manual · needs review'}
                  </td>
                  <td className="py-1.5 text-ink-2">{r.reviewStatus.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onConfirmReady}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
              {busy ? 'Confirming…' : 'Confirm rows & mark reviewed'}
            </button>
            <button
              onClick={onExtract}
              disabled={busy || !effectiveSourceUploadId}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink disabled:opacity-50">
              Re-extract from file
            </button>
          </div>
        </Card>
      )}

      {/* ---- Advanced manual fallback (collapsed by default) — NOT the primary workflow ---- */}
      {showAdvanced && (
        <details className="mt-3 rounded-lg border border-line bg-paper px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-2">
            <Wrench className="size-4" /> Advanced manual review (temporary fallback) — enter / confirm bore rows by hand
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-ink-3">
              Internal/QA tool. Manually entered rows are recorded as a human sign-off, not OCR.
            </p>

            {phase === 'absent' ? (
              <Card>
                <p className="text-sm text-ink-3">No reviewed bore-log exists yet for this project.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-3">Source bore-log upload</label>
                  <select
                    value={effectiveSourceUploadId}
                    onChange={(e) => setSourceUploadId(e.target.value)}
                    className="rounded-md border border-line px-2 py-1 text-sm text-ink">
                    {boreLogUploads.map((u) => (
                      <option key={u.uploadId} value={u.uploadId}>{u.filename}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => effectiveSourceUploadId && act(() => createReviewedBoreLog(jobId, RBL_ID, effectiveSourceUploadId))}
                    disabled={busy || !effectiveSourceUploadId}
                    className="rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
                    Start manual review
                  </button>
                </div>
              </Card>
            ) : (
              <>
                {/* Rows + manual entry */}
                <Card>
                  <h4 className="font-medium text-ink">Reviewed rows</h4>
                  {rows.length === 0 ? (
                    <p className="mt-1 text-sm text-ink-3">No rows yet — add bore rows below.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-ink-3">
                          <th className="py-1.5 pr-3 font-medium">Start → End station</th>
                          <th className="py-1.5 pr-3 font-medium">Review</th>
                          <th className="py-1.5 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.rowId} className="border-b border-line/60 last:border-0">
                            <td className="py-1.5 pr-3 font-mono text-ink">{r.startStation} → {r.endStation}</td>
                            <td className="py-1.5 pr-3 text-ink-2">{r.reviewStatus.toLowerCase()}</td>
                            <td className="py-1.5">
                              <button
                                onClick={() => act(() => reviewReviewedRow(jobId, RBL_ID, r.rowId, { toStatus: 'CONFIRMED' }))}
                                disabled={busy}
                                className="mr-2 rounded border border-line px-2 py-0.5 text-xs text-ink-2 hover:text-ink disabled:opacity-50">
                                Confirm
                              </button>
                              <button
                                onClick={() => onReject(r.rowId)}
                                disabled={busy}
                                className="rounded border border-line px-2 py-0.5 text-xs text-ink-2 hover:text-red-600 disabled:opacity-50">
                                Reject
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                    <div>
                      <label className="block text-xs text-ink-3">Start station</label>
                      <input value={startStation} onChange={(e) => setStartStation(e.target.value)}
                        placeholder="0+00" className="mt-0.5 w-24 rounded-md border border-line px-2 py-1 font-mono text-sm text-ink" />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-3">End station</label>
                      <input value={endStation} onChange={(e) => setEndStation(e.target.value)}
                        placeholder="2+99" className="mt-0.5 w-24 rounded-md border border-line px-2 py-1 font-mono text-sm text-ink" />
                    </div>
                    <div className="min-w-0 grow">
                      <label className="block text-xs text-ink-3">Note (optional)</label>
                      <input value={note} onChange={(e) => setNote(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-line px-2 py-1 text-sm text-ink" />
                    </div>
                    <button onClick={onAddRow} disabled={busy || !startStation.trim() || !endStation.trim()}
                      className="rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
                      Add bore row
                    </button>
                  </div>
                </Card>

                {/* Groups */}
                <Card>
                  <h4 className="font-medium text-ink">Segment groups</h4>
                  {(rbl?.groups.length ?? 0) === 0 ? (
                    <p className="mt-1 text-sm text-ink-3">No groups yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line">
                      {rbl?.groups.map((g) => (
                        <li key={g.groupId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="font-mono text-xs text-ink-2">
                            {g.relation} · {g.groupingStatus} · {g.memberRowIds.length} row(s)
                          </span>
                          {g.groupingStatus !== 'CONFIRMED' && (
                            <button onClick={() => act(() => setGroupingStatus(jobId, RBL_ID, g.groupId, 'CONFIRMED'))}
                              disabled={busy}
                              className="rounded border border-line px-2 py-0.5 text-xs text-ink-2 hover:text-ink disabled:opacity-50">
                              Confirm group
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {passedRows.length > 0 && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-xs text-ink-3">New group from review-passed rows</p>
                      <div className="mt-1 flex flex-wrap gap-3">
                        {passedRows.map((r) => (
                          <label key={r.rowId} className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" checked={!!members[r.rowId]}
                              onChange={(e) => setMembers((m) => ({ ...m, [r.rowId]: e.target.checked }))} />
                            <span className="font-mono text-ink-2">{r.startStation}→{r.endStation}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <select value={relation} onChange={(e) => setRelation(e.target.value as SegmentRelation)}
                          className="rounded-md border border-line px-2 py-1 text-sm text-ink">
                          <option value="SEPARATE_BORE">Separate bores</option>
                          <option value="SAME_RUN_SEGMENTS">Segments of one run</option>
                        </select>
                        <button onClick={onCreateGroup} disabled={busy || !Object.values(members).some(Boolean)}
                          className="rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
                          Create group
                        </button>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Gate status */}
                {queue && (
                  <Card>
                    <div className="flex items-center gap-2">
                      {ready ? <CheckCircle2 className="size-4 text-ink" /> : <AlertTriangle className="size-4 text-ink-3" />}
                      <h4 className="font-medium text-ink">
                        Ready for redline: <span className="font-mono">{ready ? 'yes' : 'no'}</span>
                      </h4>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs xl:grid-cols-3">
                      <Stat label="review passed" v={queue.rowsReviewPassed.length} />
                      <Stat label="needing review" v={queue.rowsNeedingReview.length} />
                      <Stat label="rejected" v={queue.rowsRejected.length} />
                      <Stat label="engine-eligible" v={queue.engineEligibleRowIds.length} />
                      <Stat label="ungrouped" v={queue.ungroupedRows.length} />
                      <Stat label="unresolved groups" v={queue.unresolvedGroups.length} />
                    </dl>
                  </Card>
                )}
              </>
            )}
          </div>
        </details>
      )}

      {error && phase === 'ready' && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-mono text-ink">{v}</dd>
    </div>
  );
}
