'use client';

// Reviewed bore-log gate for one selected job (product mode). Lets a reviewer create a reviewed-bore-log
// over a BORE_LOG upload, add MANUAL (human-supplied, NOT OCR) structured rows, review them, group +
// confirm them, and see the derived engine-readiness gate + honest blockers. No OCR, no engine run, no
// redlines. A failed live read/write shows an honest error (no mock fallback).

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import {
  addReviewedRows,
  createReviewedBoreLog,
  defineSegmentGroup,
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
}: {
  jobId: string;
  boreLogUploads: readonly { uploadId: string; filename: string }[];
}) {
  const [sourceUploadId, setSourceUploadId] = useState(boreLogUploads[0]?.uploadId ?? '');
  const [phase, setPhase] = useState<Phase>('loading');
  const [rbl, setRbl] = useState<ReviewedBoreLogView | null>(null);
  const [queue, setQueue] = useState<ReviewQueueView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Initialize the row form to the default station span as REAL state (not just placeholder text). The Add
  // button is gated on non-empty start/end; the same-valued placeholders previously made the form LOOK
  // filled while controlled state stayed '' → the button was wrongly disabled until the reviewer happened
  // to type. These are normal editable defaults (the handler uses this same state, never a blank fallback).
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
    void load();
  }, [load]);

  // Keep the selected source bore-log upload valid as the upload inventory loads or the job changes. The
  // select's initial value was captured before the BORE_LOG upload arrived, which left `sourceUploadId`
  // blank (the select visually showed the first option, but state stayed '') and the create button wrongly
  // disabled. Re-sync to the first available upload whenever the upload-id set changes (stable string dep).
  const boreLogIds = boreLogUploads.map((u) => u.uploadId).join('|');
  useEffect(() => {
    const ids = boreLogIds ? boreLogIds.split('|') : [];
    setSourceUploadId((prev) => (prev && ids.includes(prev) ? prev : (ids[0] ?? '')));
  }, [boreLogIds]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
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

  const passedRows = (rbl?.rows ?? []).filter((r) => PASS.has(r.reviewStatus));
  // Explicit selection OR first available BORE_LOG upload — never a blank/stale id (the sync effect keeps
  // `sourceUploadId` valid; this also covers the first render before that effect runs).
  const effectiveSourceUploadId = sourceUploadId || boreLogUploads[0]?.uploadId || '';

  return (
    <div>
      <p className="text-sm text-ink-3">
        The bore stations the redline is placed against. Rows are reviewed (manual — not OCR) before the
        engine uses them. {queue && !queue.engineReady && 'Some rows still need review — see the rows below.'}
      </p>
      {queue && (
        <div className="mt-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${queue.engineReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {queue.engineReady ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {queue.engineReady ? 'Bore log reviewed & ready' : 'Bore log needs review'}
          </span>
        </div>
      )}

      {boreLogUploads.length === 0 ? (
        <Card className="mt-3">
          <p className="text-sm text-ink-3">
            Upload a <span className="font-mono">BORE_LOG</span> file to this job first — a reviewed
            bore-log is created over a bore-log upload.
          </p>
        </Card>
      ) : phase === 'loading' ? (
        <p className="mt-3 text-sm text-ink-3">Loading reviewed bore-log…</p>
      ) : phase === 'error' ? (
        <Card className="mt-3">
          <p className="text-sm text-ink-3">
            Reviewed bore-log unavailable — check the v2 product API connection. No data is shown rather
            than placeholder values. ({error})
          </p>
        </Card>
      ) : phase === 'absent' ? (
        <Card className="mt-3">
          <p className="text-sm text-ink-3">No reviewed bore-log yet for this job.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs text-ink-3">Source bore-log upload</label>
            <select
              value={effectiveSourceUploadId}
              onChange={(e) => setSourceUploadId(e.target.value)}
              className="rounded-md border border-line px-2 py-1 text-sm text-ink">
              {boreLogUploads.map((u) => (
                <option key={u.uploadId} value={u.uploadId}>
                  {u.filename} ({u.uploadId})
                </option>
              ))}
            </select>
            <button
              onClick={() => effectiveSourceUploadId && act(() => createReviewedBoreLog(jobId, RBL_ID, effectiveSourceUploadId))}
              disabled={busy || !effectiveSourceUploadId}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
              Create reviewed bore-log
            </button>
          </div>
        </Card>
      ) : (
        <>
          {/* Rows + review */}
          <Card className="mt-3">
            <h4 className="font-medium text-ink">Reviewed rows</h4>
            {(rbl?.rows.length ?? 0) === 0 ? (
              <p className="mt-1 text-sm text-ink-3">No rows yet — add manual reviewed rows below.</p>
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
                  {rbl?.rows.map((r) => (
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
                <label className="block text-xs text-ink-3">start_station</label>
                <input value={startStation} onChange={(e) => setStartStation(e.target.value)}
                  placeholder="0+00" className="mt-0.5 w-24 rounded-md border border-line px-2 py-1 font-mono text-sm text-ink" />
              </div>
              <div>
                <label className="block text-xs text-ink-3">end_station</label>
                <input value={endStation} onChange={(e) => setEndStation(e.target.value)}
                  placeholder="2+99" className="mt-0.5 w-24 rounded-md border border-line px-2 py-1 font-mono text-sm text-ink" />
              </div>
              <div className="min-w-0 grow">
                <label className="block text-xs text-ink-3">note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-line px-2 py-1 text-sm text-ink" />
              </div>
              <button onClick={onAddRow} disabled={busy || !startStation.trim() || !endStation.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                Add reviewed row
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-3">Manual reviewed/corrected input (extraction_method MANUAL_ENTRY) — not OCR.</p>
          </Card>

          <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-2">Review tools &amp; diagnostics (segment groups · engine-readiness)</summary>
          {/* Groups */}
          <Card className="mt-3">
            <h4 className="font-medium text-ink">Segment groups</h4>
            {(rbl?.groups.length ?? 0) === 0 ? (
              <p className="mt-1 text-sm text-ink-3">No groups yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {rbl?.groups.map((g) => (
                  <li key={g.groupId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="font-mono text-xs text-ink-2">
                      {g.groupId} · {g.relation} · {g.groupingStatus} · {g.memberRowIds.length} row(s)
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
                      <span className="font-mono text-ink-2">{r.rowId}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select value={relation} onChange={(e) => setRelation(e.target.value as SegmentRelation)}
                    className="rounded-md border border-line px-2 py-1 text-sm text-ink">
                    <option value="SEPARATE_BORE">SEPARATE_BORE</option>
                    <option value="SAME_RUN_SEGMENTS">SAME_RUN_SEGMENTS</option>
                  </select>
                  <button onClick={onCreateGroup} disabled={busy || !Object.values(members).some(Boolean)}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                    Create group
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* Gate status */}
          {queue && (
            <Card className="mt-3">
              <div className="flex items-center gap-2">
                {queue.engineReady ? (
                  <CheckCircle2 className="size-4 text-ink" />
                ) : (
                  <AlertTriangle className="size-4 text-ink-3" />
                )}
                <h4 className="font-medium text-ink">
                  Engine-readiness gate: <span className="font-mono">{queue.engineReady ? 'engine_ready: true' : 'engine_ready: false'}</span>
                </h4>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs xl:grid-cols-3">
                <Stat label="review passed" v={queue.rowsReviewPassed.length} />
                <Stat label="needing review" v={queue.rowsNeedingReview.length} />
                <Stat label="rejected" v={queue.rowsRejected.length} />
                <Stat label="engine-eligible" v={queue.engineEligibleRowIds.length} />
                <Stat label="ungrouped" v={queue.ungroupedRows.length} />
                <Stat label="unresolved groups" v={queue.unresolvedGroups.length} />
                <Stat label="rows in >1 group" v={queue.rowsInMultipleGroups.length} />
              </dl>
              {queue.engineReady && (
                <p className="mt-2 text-xs text-ink-3">
                  Ready — the redline can now be generated in the Redline section.
                </p>
              )}
            </Card>
          )}
          </details>
        </>
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
