// Presentational upload inventory + honest processing status for one product job. Renders the real
// stored uploads (from GET /jobs/{id}) and the EXACT named blockers for what is not automated yet. It
// never invents redlines, proof artifacts, or exports for an uploaded job.

import { FileText } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ProductJobDetail } from '@/lib/api/productWrites';

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

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
    </div>
  );
}
