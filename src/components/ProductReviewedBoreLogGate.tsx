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

const HONEST = [
  'Raw bore-log uploads are stored but NOT OCR’d or parsed.',
  'These reviewed rows are human-supplied / corrected structured input — not OCR.',
  'engine_ready means the review gate passed — it does NOT mean redlines were generated.',
  'Engine handoff from an uploaded corpus is not implemented in this slice (no redlines for uploaded jobs).',
  'KMZ export stays blocked unless verified geospatial geometry exists.',
];

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
  const [startStation, setStartStation] = useState('');
  const [endStation, setEndStation] = useState('');
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

  return (
    <div className="mt-8">
      <h3 className="font-semibold text-ink">Reviewed bore-log data (manual — not OCR)</h3>
      <p className="mt-1 text-sm text-ink-3">
        Human-supplied / corrected structured rows that must pass the review + grouping gate before the
        engine could ever consider them. Nothing here runs OCR or the engine.
      </p>

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
              value={sourceUploadId}
              onChange={(e) => setSourceUploadId(e.target.value)}
              className="rounded-md border border-line px-2 py-1 text-sm text-ink">
              {boreLogUploads.map((u) => (
                <option key={u.uploadId} value={u.uploadId}>
                  {u.filename} ({u.uploadId})
                </option>
              ))}
            </select>
            <button
              onClick={() => sourceUploadId && act(() => createReviewedBoreLog(jobId, RBL_ID, sourceUploadId))}
              disabled={busy || !sourceUploadId}
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
                    <th className="py-1.5 pr-3 font-medium">Row</th>
                    <th className="py-1.5 pr-3 font-medium">Start → End</th>
                    <th className="py-1.5 pr-3 font-medium">Method</th>
                    <th className="py-1.5 pr-3 font-medium">Review</th>
                    <th className="py-1.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rbl?.rows.map((r) => (
                    <tr key={r.rowId} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs text-ink-2">{r.rowId}</td>
                      <td className="py-1.5 pr-3 font-mono text-ink">{r.startStation} → {r.endStation}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-ink-3">{r.extractionMethod}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-ink-2">{r.reviewStatus}</td>
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
                  Gate passed — this does NOT mean redlines were generated. Engine handoff from an uploaded
                  corpus is not implemented in this slice.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      {error && phase === 'ready' && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 rounded-lg border border-line bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <AlertTriangle className="size-4 text-ink-3" /> Honest status — what this slice does and does not do
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-ink-2">
          {HONEST.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
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
