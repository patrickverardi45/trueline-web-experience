'use client';

// Upload panel for one product job. Reads real Files, infers the upload kind from the extension (PDFs use
// the selected category since .pdf is ambiguous), base64-encodes the bytes, and POSTs them to the real
// /v2/product upload route. Unsupported types are rejected up front (never guessed). A failed upload shows
// an honest error — there is no mock fallback and no fake "processed" state.

import { useRef, useState } from 'react';

import { Card } from '@/components/ui/Card';
import {
  fileToBase64,
  inferUploadKind,
  uploadProductFile,
  type UploadCategory,
} from '@/lib/api/productWrites';

type PanelState =
  | { phase: 'idle' }
  | { phase: 'uploading'; done: number; total: number }
  | { phase: 'error'; message: string }
  | { phase: 'done'; count: number };

const ACCEPT = '.pdf,.csv,.xlsx,.kmz,.kml,.jpg,.jpeg,.png,.webp';
const CAT_LABEL: Record<UploadCategory, string> = { PLAN_PDF: 'Plan PDF', BORE_LOG: 'Bore log' };

// Client-side per-file size cap (FR-AUDIT-004). Uploads are read fully into memory and base64-encoded
// (~33% inflation) before a single POST, so an oversize file can OOM the tab and produce an unbounded
// request body. Reject before encoding with an honest message. The server must enforce its own cap too.
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024; // 75 MB
function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function ProductUploadPanel({ jobId, onUploaded }: { jobId: string; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pdfCategory, setPdfCategory] = useState<UploadCategory>('PLAN_PDF');
  const [state, setState] = useState<PanelState>({ phase: 'idle' });

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);

    // Mis-filing guard (W1): the single category applies to EVERY .pdf in a pick, so selecting a plan PDF and
    // a bore-log PDF together would silently file one as the wrong kind. Force one PDF per pick.
    const pdfCount = picked.filter((f) => f.name.toLowerCase().endsWith('.pdf')).length;
    if (pdfCount >= 2) {
      setState({
        phase: 'error',
        message: `You selected ${pdfCount} PDFs at once. The “${CAT_LABEL[pdfCategory]}” category applies to every PDF in a pick, so a plan + bore-log PDF would be mis-filed. Upload PDFs one at a time, choosing the right category for each.`,
      });
      return;
    }

    const unsupported = picked.filter((f) => inferUploadKind(f.name, pdfCategory) === null);
    if (unsupported.length > 0) {
      setState({
        phase: 'error',
        message: `Unsupported file type(s): ${unsupported.map((f) => f.name).join(', ')}. Allowed: PDF, CSV, XLSX, KMZ, KML, JPG, JPEG, PNG, WEBP.`,
      });
      return;
    }

    // Size guard (FR-AUDIT-004): reject oversize files before reading/encoding them into memory.
    const oversize = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversize.length > 0) {
      setState({
        phase: 'error',
        message: `File too large: ${oversize.map((f) => `${f.name} (${formatMb(f.size)})`).join(', ')}. The maximum is ${formatMb(MAX_UPLOAD_BYTES)} per file.`,
      });
      return;
    }

    setState({ phase: 'uploading', done: 0, total: picked.length });
    try {
      let done = 0;
      for (const f of picked) {
        const kind = inferUploadKind(f.name, pdfCategory);
        if (kind === null) continue; // already guarded above
        const contentBase64 = await fileToBase64(f);
        await uploadProductFile(jobId, { kind, filename: f.name, contentBase64 });
        done += 1;
        setState({ phase: 'uploading', done, total: picked.length });
      }
      if (inputRef.current) inputRef.current.value = '';
      setState({ phase: 'done', count: picked.length });
      onUploaded();
    } catch (err: unknown) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'upload failed' });
    }
  }

  return (
    <Card className="mt-4">
      <h3 className="font-semibold text-ink">Upload project files</h3>
      <p className="mt-1 text-sm text-ink-3">
        PDF · CSV · XLSX · KMZ · KML · JPG · PNG · WEBP. Files are stored untrusted (no OCR, no parsing).
      </p>

      <fieldset className="mt-3">
        <legend className="text-xs text-ink-3">When you upload a .pdf, file it as:</legend>
        <div className="mt-1 flex gap-4 text-sm">
          {(['PLAN_PDF', 'BORE_LOG'] as UploadCategory[]).map((cat) => (
            <label key={cat} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="pdfcat"
                checked={pdfCategory === cat}
                onChange={() => setPdfCategory(cat)}
              />
              <span className="text-ink-2">{CAT_LABEL[cat]}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-3">
          Upload the plan and the bore log in <span className="font-medium">separate picks</span> so each is
          filed correctly. The bore log is <span className="font-medium">stored for your review, not auto-read</span>
          {' '}(no OCR) — you confirm its stations in the <span className="font-medium">Bore logs</span> section
          before the engine uses them.
        </p>
      </fieldset>

      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => onPick(e.target.files)}
          disabled={state.phase === 'uploading'}
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
        />
      </div>

      {state.phase === 'uploading' && (
        <p className="mt-2 text-sm text-ink-3">
          Uploading {state.done}/{state.total}…
        </p>
      )}
      {state.phase === 'done' && (
        <p className="mt-2 text-sm text-ink-3">Uploaded {state.count} file(s) — stored + queued.</p>
      )}
      {state.phase === 'error' && <p className="mt-2 text-sm text-red-600">{state.message}</p>}
    </Card>
  );
}
