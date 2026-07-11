'use client';

// Bore-log section for one selected job (product mode). SOURCE/REVIEW oriented — NOT a data-entry form.
// Handles MULTIPLE uploaded bore-log files honestly: every uploaded bore log is listed; you pick one to
// extract + review (each file has its own reviewed-bore-log), and the rows are labelled with the file they
// came from. The FIRST bore log ("primary") is the one the redline is placed from today — that is stated, not
// hidden. Main path is EXTRACTION-first ("Extract bore rows from the uploaded file" runs a deterministic
// table read of the .xlsx/.csv, NOT OCR, nothing guessed) then review + confirm. Hand-entry is demoted to a
// collapsed "Advanced manual review" gated behind the internal flag — never the primary workflow.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Wrench } from 'lucide-react';

import { ProductBoreRowEditor } from '@/components/ProductBoreRowEditor';
import { Card } from '@/components/ui/Card';
import { internalToolingEnabled } from '@/lib/internalMode';
import {
  addReviewedRows,
  createReviewedBoreLog,
  defineSegmentGroup,
  ensureGroupingConfirmed,
  extractBoreLogRows,
  fetchAggregateEngineReadiness,
  fetchReviewQueue,
  fetchReviewedBoreLog,
  probeHandwrittenFanOutIds,
  reviewReviewedRow,
  setGroupingStatus,
  type CreatedReviewedBoreLog,
  type ManualRowInput,
  type ReviewedBoreLogView,
  type ReviewedGroupView,
  type ReviewedRowView,
  type ReviewQueueView,
  type SegmentRelation,
} from '@/lib/api/productWrites';

const PASS = new Set(['CONFIRMED', 'CORRECTED']);

type Phase = 'loading' | 'absent' | 'ready' | 'error';

// One reviewed-bore-log per uploaded file. The first file is the canonical "rbl-main" the rest of the
// workflow (engine-readiness, single-bore placement) keys on; additional files get rbl-2, rbl-3, … (this
// matches how recognized multi-bore jobs are seeded).
function rblFor(i: number): string {
  return i === 0 ? 'rbl-main' : `rbl-${i + 1}`;
}

function is404(err: unknown): boolean {
  return err instanceof Error && /HTTP 404/.test(err.message);
}
function rid(): string {
  return 'row-' + Math.random().toString(36).slice(2, 8);
}
function gid(): string {
  return 'grp-' + Math.random().toString(36).slice(2, 8);
}

// probeHandwrittenFanOutIds (the bounded "rbl-hw-p{page}-r{run}" rediscovery probe) lives in
// productWrites.ts — ONE shared place, reused by fetchAggregateEngineReadiness's own probe too.

interface BoreCardData {
  readonly rblId: string;
  readonly label: string;
  readonly rbl: ReviewedBoreLogView;
  readonly queue: ReviewQueueView;
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
  // Which uploaded bore-log file is being reviewed (index into boreLogUploads). Defaults to the first.
  const [sel, setSel] = useState(0);
  const active = boreLogUploads[sel];
  const activeRbl = rblFor(sel);

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
  // Per-file engine-ready status for the file list badges (one light read per uploaded bore log).
  const [readyMap, setReadyMap] = useState<Record<number, boolean | null>>({});
  // Sibling reviewed-bore-logs fanned out from the SAME uploaded file (handwritten multi-bore packages).
  // Empty for every ordinary (non-fan-out) job — see probeHandwrittenFanOutIds.
  const [siblingBores, setSiblingBores] = useState<readonly BoreCardData[]>([]);
  // AUTHORITATIVE fan-out ids, per uploaded-file index, as reported by the extract call itself
  // (created_reviewed_bore_logs). Populated in onExtract(). `undefined` for an index means "not yet known
  // this session" OR "the backend's response didn't carry the field" — both fall back to the id probe. A
  // defined array (even []) means the backend authoritatively answered — no probe, ever, for that index.
  const [extractCreatedRbls, setExtractCreatedRbls] =
    useState<Record<number, readonly CreatedReviewedBoreLog[] | undefined>>({});

  // load() is defined below; ensureRblGroupedThenReload needs to call the LATEST load() without making
  // itself (and every row editor holding it) re-render/re-bind on every load() identity change — a ref
  // (kept current by the effect right after load's definition) breaks that circularity cleanly.
  const loadRef = useRef<() => Promise<void>>(async () => {});

  // Direct, SINGLE-RBL grouping-ensure — the editor's per-row-review SUCCESS callback uses this (not the
  // broader sweep below) so a review success on ONE RBL is never blocked by another RBL's fetch/grouping
  // trouble elsewhere. Best-effort: a failure here doesn't surface as an error — the self-heal sweep in
  // load() (below) retries it on the next visit/action regardless.
  const ensureRblGroupedThenReload = useCallback(async (rblId: string) => {
    try {
      const freshRbl = await fetchReviewedBoreLog(jobId, rblId);
      await ensureGroupingConfirmed(jobId, rblId, freshRbl.rows, freshRbl.groups);
    } catch {
      // best-effort — see comment above
    }
    await loadRef.current();
  }, [jobId]);

  const load = useCallback(async () => {
    if (!active) { setPhase('absent'); setSiblingBores([]); return; }
    setError(null);
    try {
      const record = await fetchReviewedBoreLog(jobId, activeRbl);
      let q = await fetchReviewQueue(jobId, activeRbl);
      // SELF-HEALING (a): idempotently ensure grouping the moment ALL of this RBL's rows are reviewed
      // (per-row review has no grouping step of its own) — a no-op for the (typically empty) primary in a
      // fan-out package. Never lets a grouping failure block rendering the primary's own data.
      try {
        if (await ensureGroupingConfirmed(jobId, activeRbl, record.rows, record.groups)) {
          q = await fetchReviewQueue(jobId, activeRbl);
        }
      } catch { /* best-effort — retried on the next load() */ }
      setRbl(record);
      setQueue(q);
      setPhase('ready');

      // Sibling ids: the backend's created_reviewed_bore_logs (from the last extract THIS session) is
      // AUTHORITATIVE the moment it's present, even if empty.
      let created = extractCreatedRbls[sel];
      if (created === undefined) {
        // SELF-HEALING (b), the critical case: a totally fresh page load has NO session memory of
        // created_reviewed_bore_logs (extraction happened in an earlier session) — and re-POSTing extract()
        // to rediscover it is NOT safe (the real backend rejects a redundant extract on an already
        // fanned-out RBL). Rediscover via the deterministic "rbl-hw-p{page}-r{run}" naming instead: bounded,
        // read-only, zero-cost for a non-fan-out job (one failed check, then stop). The result — even an
        // empty one — is cached into extractCreatedRbls so this only runs once per file per session.
        const discoveredIds = await probeHandwrittenFanOutIds(async (id) => {
          try { await fetchReviewQueue(jobId, id); return true; } catch { return false; }
        });
        created = discoveredIds.map((id) => ({
          reviewedBoreLogId: id, sourceUploadId: null, rowId: null, pageIndex: null, runIndex: null,
        }));
        setExtractCreatedRbls((prev) => ({ ...prev, [sel]: created }));
      }
      const backendSiblingIds = created
        .map((c) => c.reviewedBoreLogId)
        .filter((id): id is string => !!id && id !== activeRbl);

      // Sibling numbering follows CREATION order (both id sources below are already creation-ordered): when
      // the primary carries no rows (the ordinary fan-out shape), siblings are "Bore 1..N"; when the primary
      // itself carries rows too, it occupies "Bore 1" implicitly and siblings continue from "Bore 2".
      const primaryHasRows = record.rows.length > 0;
      const labelFor = (position: number) => `Bore ${primaryHasRows ? position + 2 : position + 1}`;

      const siblings: BoreCardData[] = [];
      for (const candidateId of backendSiblingIds) {
        try {
          // FETCH always pushes the card (so a sibling with reviewed-but-ungrouped rows stays VISIBLE,
          // never silently vanishes). Grouping-ENSURE is a separate best-effort step — its failure never
          // hides data.
          const srbl = await fetchReviewedBoreLog(jobId, candidateId);
          let squeue = await fetchReviewQueue(jobId, candidateId);
          try {
            if (await ensureGroupingConfirmed(jobId, candidateId, srbl.rows, srbl.groups)) {
              squeue = await fetchReviewQueue(jobId, candidateId);
            }
          } catch { /* best-effort — retried on the next load() */ }
          siblings.push({ rblId: candidateId, label: labelFor(siblings.length), rbl: srbl, queue: squeue });
        } catch { /* skip; independent known ids, not a sequential guess */ }
      }
      setSiblingBores(siblings);

      // File-level "reviewed & ready" (the per-file pill + this file's status pill): when fan-out siblings
      // carry rows, aggregate over THEM (all engine-ready) and exclude the — typically empty — primary. No
      // siblings carrying rows -> unchanged single-RBL behavior (the primary's own engineReady).
      const siblingsWithRows = siblings.filter((s) => s.rbl.rows.length > 0);
      const aggregateReady = siblingsWithRows.length > 0
        ? siblingsWithRows.every((s) => s.queue.engineReady)
        : q.engineReady;
      setReadyMap((prev) => ({ ...prev, [sel]: aggregateReady }));
    } catch (e) {
      if (is404(e)) {
        setPhase('absent');
        setReadyMap((prev) => ({ ...prev, [sel]: false }));
        setSiblingBores([]);
        return;
      }
      setError(e instanceof Error ? e.message : 'unavailable');
      setPhase('error');
    }
  }, [jobId, activeRbl, active, sel, extractCreatedRbls]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Clamp the selection if the upload set shrinks; pre-read each file's engine-ready for the list badges.
  const idsKey = boreLogUploads.map((u) => u.uploadId).join('|');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSel((prev) => (prev < boreLogUploads.length ? prev : 0));
    let active2 = true;
    (async () => {
      const entries = await Promise.all(
        boreLogUploads.map(async (_, i) => {
          // Aggregates over that file's own fan-out siblings (excluding its empty primary) when they carry
          // rows; falls back to the primary's own engineReady otherwise — same rule as load() above. The
          // rediscovery probe only runs when THIS file's fan-out state isn't already known this session
          // (extractCreatedRbls[i] undefined) — same absent-condition load() uses, so a file already
          // resolved (empty or with known ids) costs zero extra probe requests here.
          const probeAllowed = extractCreatedRbls[i] === undefined;
          try { return [i, await fetchAggregateEngineReadiness(jobId, rblFor(i), probeAllowed)] as const; }
          catch { return [i, false] as const; }
        }),
      );
      if (active2) setReadyMap(Object.fromEntries(entries));
    })();
    return () => { active2 = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, idsKey]);

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
    await act(() => addReviewedRows(jobId, activeRbl, rbl.sourceUploadId || effectiveSourceUploadId, [row]));
    setStartStation('');
    setEndStation('');
    setNote('');
  }

  async function onReject(rowId: string) {
    const reason = window.prompt('Reason for rejecting this row?')?.trim();
    if (!reason) return;
    await act(() => reviewReviewedRow(jobId, activeRbl, rowId, { toStatus: 'REJECTED', reason }));
  }

  async function onCreateGroup() {
    const picked = Object.entries(members).filter(([, v]) => v).map(([k]) => k);
    if (picked.length === 0) return;
    await act(() => defineSegmentGroup(jobId, activeRbl, gid(), picked, relation));
    setMembers({});
  }

  // Extraction-first main path for the SELECTED file: ensure its reviewed-bore-log exists, then
  // deterministically extract the bore rows from that file (TABLE_IMPORT, UNREVIEWED — a human reviews next).
  async function onExtract() {
    if (!effectiveSourceUploadId) return;
    await act(async () => {
      if (phase === 'absent') await createReviewedBoreLog(jobId, activeRbl, effectiveSourceUploadId);
      const result = await extractBoreLogRows(jobId, activeRbl);
      // Record the AUTHORITATIVE fan-out ids for THIS uploaded file (keyed by its index) so load() renders
      // sibling bore cards from them instead of the id-probe fallback.
      setExtractCreatedRbls((prev) => ({ ...prev, [sel]: result.createdReviewedBoreLogs }));
    });
  }

  // Bulk-confirm every not-yet-passed row of ONE reviewed-bore-log, then idempotently ensure its grouping
  // (the SAME shared helper the per-row review path uses via load()) so it becomes engine-ready — the
  // "Confirm all remaining" fallback for the plain-table lanes. Shared by the primary card and every
  // fan-out sibling bore card (each RBL confirms independently).
  async function confirmAllRemaining(
    targetRblId: string, targetRows: readonly ReviewedRowView[], targetGroups: readonly ReviewedGroupView[],
  ) {
    await act(async () => {
      for (const r of targetRows) {
        if (!PASS.has(r.reviewStatus)) {
          await reviewReviewedRow(jobId, targetRblId, r.rowId, { toStatus: 'CONFIRMED' });
        }
      }
      // Every targetRows entry is reviewed now (just confirmed above, or already was) — ensureGroupingConfirmed
      // re-derives the group membership from this post-confirm view and is a no-op if already grouped.
      const reviewedRows = targetRows.map((r) => (PASS.has(r.reviewStatus) ? r : { ...r, reviewStatus: 'CONFIRMED' }));
      await ensureGroupingConfirmed(jobId, targetRblId, reviewedRows, targetGroups);
    });
  }

  // Confirm the SELECTED (primary) file's extracted rows — without diving into the Advanced manual tooling.
  async function onConfirmReady() {
    await confirmAllRemaining(activeRbl, rows, rbl?.groups ?? []);
  }

  const rows = rbl?.rows ?? [];
  const passedRows = rows.filter((r) => PASS.has(r.reviewStatus));
  const effectiveSourceUploadId = active?.uploadId ?? '';
  const hasUpload = boreLogUploads.length > 0;
  // File-level "reviewed & ready" — aggregate over fan-out siblings that carry rows (excluding the
  // typically-empty primary rbl-main) when they exist; no siblings carrying rows -> the primary's own
  // engineReady, unchanged single-RBL behavior. Mirrors the same rule computed in load().
  const siblingBoresWithRows = siblingBores.filter((s) => s.rbl.rows.length > 0);
  const ready = siblingBoresWithRows.length > 0
    ? siblingBoresWithRows.every((s) => s.queue.engineReady)
    : !!queue?.engineReady;
  const showAdvanced = internalToolingEnabled() && hasUpload && phase !== 'loading' && phase !== 'error';

  return (
    <div>
      <p className="text-sm text-ink-3">
        The uploaded bore log is the source the engine places the redline against. You review or correct it
        here — you don’t re-enter it by hand.
      </p>

      {!hasUpload ? (
        <Card className="mt-3">
          <p className="text-sm text-ink-3">
            Upload a bore log in the <span className="font-medium">Upload package</span> step first — the
            redline is placed against the bore stations in your bore-log file.
          </p>
        </Card>
      ) : (
        <>
          {/* Uploaded bore-log files — pick one to extract + review. The first is used to place the redline. */}
          <Card className="mt-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-ink">Uploaded bore-log files ({boreLogUploads.length})</h4>
            </div>
            <ul className="mt-2 space-y-1.5">
              {boreLogUploads.map((u, i) => {
                const r = readyMap[i];
                const isSel = i === sel;
                return (
                  <li key={u.uploadId}>
                    <button
                      onClick={() => setSel(i)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                        isSel ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50'
                      }`}>
                      <FileText className="size-4 shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink" title={u.filename}>{u.filename}</span>
                      {i === 0 && (
                        <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-[10px] font-semibold text-ink-2" title="The redline is placed from the first bore log.">
                          Primary
                        </span>
                      )}
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        r === true ? 'bg-emerald-100 text-emerald-800' : r === false ? 'bg-amber-100 text-amber-800' : 'bg-line text-ink-3'
                      }`}>
                        {r === true ? 'Reviewed' : r === false ? 'Needs review' : '…'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {boreLogUploads.length > 1 && (
              <p className="mt-2 text-xs text-ink-3">
                The redline is placed from the <span className="font-medium">primary</span> (first) bore log.
                Review each file to confirm its bore rows — they’re labelled by file below.
              </p>
            )}
          </Card>

          {/* Status pill for the SELECTED file. */}
          {phase !== 'loading' && phase !== 'error' && active && (
            <div className="mt-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {ready ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                {ready ? 'Bore log reviewed & ready' : rows.length > 0 ? 'Bore rows extracted — needs review' : 'Bore log uploaded — extract & review'}
                <span className="font-normal opacity-80">· {active.filename}</span>
              </span>
            </div>
          )}

          {/* ---- Main body by state (for the selected file) ---- */}
          {phase === 'loading' ? (
            <p className="mt-3 text-sm text-ink-3">Loading bore log…</p>
          ) : phase === 'error' ? (
            <Card className="mt-3">
              <p className="text-sm text-ink-3">
                Bore log temporarily unavailable — check your connection. No data is shown rather than
                placeholder values.{internalToolingEnabled() && <span className="font-mono text-xs"> ({error})</span>}
              </p>
            </Card>
          ) : ready ? (
            /* READY: the reviewed bore rows are trusted evidence — every canonical field, honestly, but
               no Edit/Confirm actions (a banked human review grade is never reopened here). */
            <Card className="mt-3">
              <h4 className="font-medium text-ink">Bore rows from {active.filename} ({rows.length})</h4>
              <p className="mt-1 text-xs text-ink-3">
                These bore rows have been reviewed for this file — the engine uses them to place the redline.
                Generate the redline in the <span className="font-medium">Redline proof</span> step.
              </p>
              {rows.length > 0 && (
                <div className="mt-2">
                  {rows.map((r) => (
                    <ProductBoreRowEditor
                      key={r.rowId} jobId={jobId} rblId={activeRbl} uploadId={effectiveSourceUploadId || null}
                      uploadFilename={active?.filename ?? null} row={r} readOnly onChanged={load} />
                  ))}
                </div>
              )}
            </Card>
          ) : rows.length === 0 ? (
            /* NOT READY, no rows yet: EXTRACTION is the main path (deterministic table read of THIS file). */
            <Card className="mt-3">
              <h4 className="font-medium text-ink">Extract the bore rows from {active.filename}</h4>
              <p className="mt-1 text-sm text-ink-3">
                FieldRoute reads the bore stations directly from this bore-log file — a deterministic table
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
            /* NOT READY, rows extracted: per-row review — see every field, edit (nullable-aware), confirm
               each individually, or bulk-confirm the rest (no hand-entry on the main path). */
            <Card className="mt-3">
              <h4 className="font-medium text-ink">Extracted bore rows from {active.filename} — review &amp; confirm ({rows.length})</h4>
              <p className="mt-1 text-xs text-ink-3">
                Extracted from this file. Review each row — edit anything that&rsquo;s wrong, confirm what&rsquo;s
                right — to enable redline placement. Nothing is placed until you do.
              </p>
              <div className="mt-2">
                {rows.map((r) => (
                  <ProductBoreRowEditor
                    key={r.rowId} jobId={jobId} rblId={activeRbl} uploadId={effectiveSourceUploadId || null}
                    uploadFilename={active?.filename ?? null} row={r} disabled={busy}
                    onChanged={() => ensureRblGroupedThenReload(activeRbl)} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                <button
                  onClick={onConfirmReady}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                  {busy ? 'Confirming…' : 'Confirm all remaining'}
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

          {/* ---- Fan-out sibling bore cards — the SAME uploaded file split into several reviewed-bore-logs
               (handwritten multi-bore packages). Empty for every ordinary job/lane. ---- */}
          {phase !== 'loading' && phase !== 'error' && siblingBores.map((s) => (
            <SiblingBoreCard
              key={s.rblId} jobId={jobId} uploadId={effectiveSourceUploadId || null}
              uploadFilename={active?.filename ?? null} card={s}
              busy={busy} onConfirmAll={confirmAllRemaining} onRowChanged={ensureRblGroupedThenReload} />
          ))}

          {/* ---- Advanced manual fallback (collapsed by default) — NOT the primary workflow ---- */}
          {showAdvanced && (
            <details className="mt-3 rounded-lg border border-line bg-paper px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-2">
                <Wrench className="size-4" /> Advanced manual review (temporary fallback) — enter / confirm bore rows by hand ({active?.filename})
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-ink-3">
                  Internal/QA tool. Manually entered rows are recorded as a human sign-off, not OCR.
                </p>

                {phase === 'absent' ? (
                  <Card>
                    <p className="text-sm text-ink-3">No reviewed bore-log exists yet for {active?.filename}.</p>
                    <button
                      onClick={() => effectiveSourceUploadId && act(() => createReviewedBoreLog(jobId, activeRbl, effectiveSourceUploadId))}
                      disabled={busy || !effectiveSourceUploadId}
                      className="mt-2 rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-strong hover:bg-accent/10 disabled:opacity-50">
                      Start manual review
                    </button>
                  </Card>
                ) : (
                  <>
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
                                    onClick={() => act(() => reviewReviewedRow(jobId, activeRbl, r.rowId, { toStatus: 'CONFIRMED' }))}
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
                                <button onClick={() => act(() => setGroupingStatus(jobId, activeRbl, g.groupId, 'CONFIRMED'))}
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
        </>
      )}
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

// One fan-out sibling bore card: the SAME uploaded file, ANOTHER reviewed-bore-log (a distinct bore within
// a handwritten multi-bore package). Its own per-row editor + its own "Confirm all remaining" — a sibling's
// review state never affects the primary's.
function SiblingBoreCard({
  jobId, uploadId, uploadFilename, card, busy, onConfirmAll, onRowChanged,
}: {
  jobId: string;
  uploadId: string | null;
  uploadFilename: string | null;
  card: BoreCardData;
  busy: boolean;
  onConfirmAll: (rblId: string, rows: readonly ReviewedRowView[], groups: readonly ReviewedGroupView[]) => Promise<void>;
  // Fired by a row editor on a SUCCESSFUL confirm/correction — ensures grouping for THIS card's rblId
  // directly (not via the parent's broader sibling-discovery sweep) before reloading the whole gate.
  onRowChanged: (rblId: string) => Promise<void>;
}) {
  const rows = card.rbl.rows;
  const ready = card.queue.engineReady;
  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium text-ink">{card.label} — {rows.length} row(s)</h4>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {ready ? 'Reviewed' : 'Needs review'}
        </span>
      </div>
      <div className="mt-2">
        {rows.map((r) => (
          <ProductBoreRowEditor
            key={r.rowId} jobId={jobId} rblId={card.rblId} uploadId={uploadId}
            uploadFilename={uploadFilename} row={r} disabled={busy} readOnly={ready}
            onChanged={() => onRowChanged(card.rblId)} />
        ))}
      </div>
      {!ready && rows.length > 0 && (
        <div className="mt-3 border-t border-line/60 pt-3">
          <button
            onClick={() => onConfirmAll(card.rblId, rows, card.rbl.groups)}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            {busy ? 'Confirming…' : 'Confirm all remaining'}
          </button>
        </div>
      )}
    </Card>
  );
}
