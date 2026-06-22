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

export function ProductUploadPanel({ jobId, onUploaded }: { jobId: string; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pdfCategory, setPdfCategory] = useState<UploadCategory>('PLAN_PDF');
  const [state, setState] = useState<PanelState>({ phase: 'idle' });

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);

    const unsupported = picked.filter((f) => inferUploadKind(f.name, pdfCategory) === null);
    if (unsupported.length > 0) {
      setState({
        phase: 'error',
        message: `Unsupported file type(s): ${unsupported.map((f) => f.name).join(', ')}. Allowed: PDF, CSV, XLSX, KMZ, KML, JPG, JPEG, PNG, WEBP.`,
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
      <h3 className="font-semibold text-ink">
        Upload files to job <span className="font-mono">{jobId}</span>
      </h3>
      <p className="mt-1 text-sm text-ink-3">
        PDF · CSV · XLSX · KMZ · KML · JPG · PNG · WEBP. Files are stored untrusted (no OCR, no parsing).
      </p>

      <fieldset className="mt-3">
        <legend className="text-xs text-ink-3">PDF category (applies to .pdf files)</legend>
        <div className="mt-1 flex gap-4 text-sm">
          {(['PLAN_PDF', 'BORE_LOG'] as UploadCategory[]).map((cat) => (
            <label key={cat} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="pdfcat"
                checked={pdfCategory === cat}
                onChange={() => setPdfCategory(cat)}
              />
              <span className="font-mono text-ink-2">{cat}</span>
            </label>
          ))}
        </div>
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
