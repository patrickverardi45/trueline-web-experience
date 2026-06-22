// Presentational upload inventory + honest processing status for one product job. Renders the real
// stored uploads (from GET /jobs/{id}) and the EXACT named blockers for what is not automated yet. It
// never invents redlines, proof artifacts, or exports for an uploaded job.

import { AlertTriangle, FileText } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ProductJobDetail } from '@/lib/api/productWrites';

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// True today regardless of job state — uploaded files are stored, never processed.
const HONEST_BLOCKERS = [
  'OCR / automatic bore-log extraction is NOT implemented — uploaded files are stored, never parsed.',
  'Reviewed structured bore-log data is required before any engine handoff (a later slice).',
  'Engine handoff from an uploaded corpus is NOT implemented yet — no redlines are produced for uploaded jobs.',
  'KMZ / Google Earth export stays blocked unless verified geospatial geometry exists.',
];

export function ProductUploadInventory({ job }: { job: ProductJobDetail }) {
  return (
    <div className="mt-6">
      <h3 className="font-semibold text-ink">
        Upload inventory — job <span className="font-mono">{job.jobId}</span>
      </h3>
      <p className="mt-1 text-sm text-ink-3">
        Job status <span className="font-mono text-ink-2">{job.status}</span> · {job.uploads.length} file(s) stored
      </p>

      {job.uploads.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            icon={FileText}
            title="No files uploaded to this job yet"
            detail="Use the upload panel above to add PDFs, KMZ/KML, bore-log files, or photos."
          />
        </div>
      ) : (
        <Card className="mt-3 overflow-x-auto" flush>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th className="px-4 py-2 font-medium">File</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Upload id</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {job.uploads.map((u) => (
                <tr key={u.uploadId} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2 font-mono text-ink">{u.filename}</td>
                  <td className="px-4 py-2">
                    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-ink-2">{u.kind}</span>
                  </td>
                  <td className="px-4 py-2 text-ink-2">{humanSize(u.bytes)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-3">{u.uploadId}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-2">{u.extractionStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-4 rounded-lg border border-line bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <AlertTriangle className="size-4 text-ink-3" /> Honest processing status — not yet automated
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-ink-2">
          {HONEST_BLOCKERS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-3">
          Flow today: uploaded → stored → <span className="font-mono">queued</span>. No redlines, proof
          artifacts, or export files are invented for uploaded jobs.
        </p>
      </div>
    </div>
  );
}
