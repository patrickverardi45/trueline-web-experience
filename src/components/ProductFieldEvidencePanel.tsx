'use client';

// FIELD EVIDENCE review panel (display-only). Shows the segment evidence packages the field crew captured
// and submitted — start/end station photo slots, problem areas with their required photos, and digital
// bore-log readings — so the office can review what actually happened in the field.
//
// DOCTRINE: field evidence SUPPORTS office review; it creates no redline and implies nothing automatic or
// final. This panel renders stored evidence truthfully: a required photo slot counts only when a real photo
// file backs it, refusal states stay visible, and raw backend codes never reach the primary UI. No mock
// fallback — a failed live read degrades to an honest message; a 404 is the calm "not enabled" state.
// Photo THUMBNAILS are deliberately absent: uploads have no byte-serving product route yet, and this panel
// does not invent one — it shows attached/missing truth only.

import { useCallback, useEffect, useState } from 'react';

import {
  fetchFieldEvidenceList,
  type FieldEvidencePackage,
  type FieldEvidenceProblem,
  type FieldEvidenceReading,
} from '@/lib/api/fieldEvidence';
import {
  FIELD_EVIDENCE_SUPPORT_LINE,
  missingEvidenceSummary,
  photoKindLabel,
  presentFieldEvidenceStatus,
  problemTypeLabel,
  readingMethodLabel,
  type FieldEvidenceTone,
} from '@/lib/fieldEvidenceCopy';

const TONE_CHIP: Record<FieldEvidenceTone, string> = {
  ready: 'bg-emerald-100 text-emerald-800',
  progress: 'bg-sky-100 text-sky-800',
  blocked: 'bg-amber-100 text-amber-800',
  neutral: 'bg-gray-100 text-gray-700',
};

/** Small attached/missing chip for one required photo slot — bound-to-a-real-photo truth only. */
function PhotoSlot({ label, attached }: { label: string; attached: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-white px-2.5 py-1.5">
      <span className="truncate text-xs text-ink-2">{label}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          attached ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
        }`}>
        {attached ? 'Photo attached' : 'Photo missing'}
      </span>
    </div>
  );
}

function ProblemRow({ pkg, problem }: { pkg: FieldEvidencePackage; problem: FieldEvidenceProblem }) {
  const documented = problem.photoEvidenceIds.some((id) =>
    pkg.photos.some((p) => p.evidenceId === id && p.kind === 'PROBLEM_AREA' && p.uploadId !== null),
  );
  const where = problem.station ?? (problem.offsetFt !== null ? `${problem.offsetFt} ft` : null);
  return (
    <div className="rounded-md border border-line bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{problemTypeLabel(problem.type)}</span>
        {where && <span className="font-mono text-xs text-ink-3">{where}</span>}
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            documented ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
          {documented ? 'Photo attached' : 'Photo missing'}
        </span>
      </div>
      {problem.note && <p className="mt-1.5 text-xs text-ink-2">{problem.note}</p>}
    </div>
  );
}

/** Compact digital bore-log readings table: offset ft is the plotting axis (cadence is whatever the crew
 *  recorded — ~50 ft is nominal, never enforced). */
function ReadingsTable({ readings }: { readings: readonly FieldEvidenceReading[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-3">
            <th className="px-2.5 py-1.5 font-medium">Offset (ft)</th>
            <th className="px-2.5 py-1.5 font-medium">Station</th>
            <th className="px-2.5 py-1.5 font-medium">Depth (ft)</th>
            <th className="px-2.5 py-1.5 font-medium">Pitch (%)</th>
            <th className="px-2.5 py-1.5 font-medium">Method</th>
            <th className="px-2.5 py-1.5 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r) => (
            <tr key={r.readingId} className="border-b border-line/60 last:border-b-0">
              <td className="px-2.5 py-1.5 font-mono text-ink">{r.offsetFt ?? '—'}</td>
              <td className="px-2.5 py-1.5 font-mono text-ink-2">{r.station ?? '—'}</td>
              <td className="px-2.5 py-1.5 font-mono text-ink">{r.depthFt ?? '—'}</td>
              <td className="px-2.5 py-1.5 font-mono text-ink-2">{r.pitchPct ?? '—'}</td>
              <td className="px-2.5 py-1.5 text-ink-2">{readingMethodLabel(r.method) ?? '—'}</td>
              <td className="px-2.5 py-1.5 text-ink-2">
                {r.problem && (
                  <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    Problem
                  </span>
                )}
                {r.note ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PackageCard({ pkg }: { pkg: FieldEvidencePackage }) {
  const present = presentFieldEvidenceStatus(pkg);
  const missing = missingEvidenceSummary(pkg);
  const startAttached = pkg.photos.some((p) => p.kind === 'START_STATION' && p.uploadId !== null);
  const endAttached = pkg.photos.some((p) => p.kind === 'END_STATION' && p.uploadId !== null);
  const contextPhotos = pkg.photos.filter((p) => p.kind === 'OPTIONAL_CONTEXT');

  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-3">{pkg.segmentId}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CHIP[present.tone]}`}>
          {present.label}
        </span>
        <span className="flex-1" />
        <span className="text-sm text-ink">
          <span className="font-mono">{pkg.startStation ?? '—'}</span>
          <span className="mx-1 text-ink-3">→</span>
          <span className="font-mono">{pkg.endStation ?? '—'}</span>
        </span>
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{present.plainEnglish}</p>

      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PhotoSlot label={photoKindLabel('START_STATION')} attached={startAttached} />
        <PhotoSlot label={photoKindLabel('END_STATION')} attached={endAttached} />
      </div>

      {missing.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
          {missing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {pkg.problems.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-ink-2">Problem areas ({pkg.problems.length})</h4>
          <div className="mt-1.5 space-y-2">
            {pkg.problems.map((problem) => (
              <ProblemRow key={problem.problemId} pkg={pkg} problem={problem} />
            ))}
          </div>
        </div>
      )}

      {pkg.readings.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-ink-2">Digital bore readings ({pkg.readings.length})</h4>
          <div className="mt-1.5">
            <ReadingsTable readings={pkg.readings} />
          </div>
        </div>
      )}

      {contextPhotos.length > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          {contextPhotos.length} optional context photo{contextPhotos.length === 1 ? '' : 's'} recorded (never
          required).
        </p>
      )}

      {pkg.notes && <p className="mt-2 text-xs text-ink-2">Crew notes: {pkg.notes}</p>}
    </div>
  );
}

export function ProductFieldEvidencePanel({ jobId, refreshKey }: { jobId: string; refreshKey?: string }) {
  const [packages, setPackages] = useState<readonly FieldEvidencePackage[] | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPackages(await fetchFieldEvidenceList(jobId));
      setNotEnabled(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unavailable';
      // A 404 means the field-evidence lane is not enabled on this backend (or the job is gone) — a calm
      // state, not a loud error. Anything else is surfaced honestly.
      if (/HTTP 404/.test(message)) {
        setNotEnabled(true);
        setPackages(null);
      } else {
        setError(message);
        setPackages(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!jobId) return null;

  return (
    <section className="rounded-lg border border-line bg-paper p-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink">Field evidence</h3>
        <p className="mt-1 text-xs text-ink-3">{FIELD_EVIDENCE_SUPPORT_LINE}</p>
      </div>

      <div className="mt-3">
        {error ? (
          <p className="text-xs text-amber-800">Field evidence could not be read. ({error})</p>
        ) : notEnabled ? (
          <p className="text-xs text-ink-3">Field evidence is not enabled for this job.</p>
        ) : packages === null ? (
          <p className="text-xs text-ink-3">Loading field evidence…</p>
        ) : packages.length === 0 ? (
          <p className="text-xs text-ink-3">No field evidence submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <PackageCard key={pkg.segmentId} pkg={pkg} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
