'use client';

// Upload panel for one product job. The customer first picks the TYPE of file with a clear button/card
// (Plan PDF · KMZ/KML route · Bore log · Photos) — the selected type is visually obvious — then chooses
// file(s), which are uploaded AS that type. The file picker is scoped to the type's extensions and each file
// is validated against it (so nothing is mis-filed). A failed upload shows an honest error — no mock
// fallback, no fake "processed" state.

import { useRef, useState } from 'react';
import { ClipboardCheck, FileText, ImageIcon, Map as MapIcon } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { fileToBase64, uploadProductFile } from '@/lib/api/productWrites';

type Kind = 'PLAN_PDF' | 'GIS_ROUTE' | 'BORE_LOG' | 'PHOTO';

type PanelState =
  | { phase: 'idle' }
  | { phase: 'uploading'; done: number; total: number }
  | { phase: 'error'; message: string }
  | { phase: 'done'; count: number };

interface KindDef {
  readonly kind: Kind;
  readonly label: string;
  readonly desc: string;
  readonly exts: readonly string[];
  readonly accept: string;
  readonly icon: typeof FileText;
}

// Order per Patrick: Plan PDF · KMZ/KML route · Bore log · Photos.
const KINDS: readonly KindDef[] = [
  { kind: 'PLAN_PDF', label: 'Plan PDF', desc: 'The construction plan', exts: ['.pdf'], accept: '.pdf', icon: FileText },
  { kind: 'GIS_ROUTE', label: 'KMZ / KML route', desc: 'Route for the map', exts: ['.kmz', '.kml'], accept: '.kmz,.kml', icon: MapIcon },
  { kind: 'BORE_LOG', label: 'Bore log', desc: 'Bore stations (.xlsx / .csv / .pdf)', exts: ['.pdf', '.csv', '.xlsx'], accept: '.pdf,.csv,.xlsx', icon: ClipboardCheck },
  { kind: 'PHOTO', label: 'Photos', desc: 'Stored for reference only', exts: ['.jpg', '.jpeg', '.png', '.webp'], accept: '.jpg,.jpeg,.png,.webp', icon: ImageIcon },
];

// Client-side per-file size cap (FR-AUDIT-004). Uploads are read fully into memory and base64-encoded
// (~33% inflation) before a single POST, so an oversize file can OOM the tab and produce an unbounded
// request body. Reject before encoding with an honest message. The server must enforce its own cap too.
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024; // 75 MB
function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}
function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function ProductUploadPanel({ jobId, onUploaded }: { jobId: string; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('PLAN_PDF');
  const [state, setState] = useState<PanelState>({ phase: 'idle' });
  const def = KINDS.find((k) => k.kind === kind)!;

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);

    // Every file must match the SELECTED type's extensions — the type is explicit (the chosen button), so
    // nothing is silently mis-filed.
    const wrong = picked.filter((f) => !def.exts.includes(extOf(f.name)));
    if (wrong.length > 0) {
      setState({
        phase: 'error',
        message: `These don’t match “${def.label}” (${def.exts.join(', ')}): ${wrong.map((f) => f.name).join(', ')}. Pick the matching type button, or choose the right files.`,
      });
      return;
    }

    const oversize = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversize.length > 0) {
      setState({
        phase: 'error',
        message: `File too large: ${oversize.map((f) => `${f.name} (${formatMb(f.size)})`).join(', ')}. The maximum is ${formatMb(MAX_UPLOAD_BYTES)} per file.`,
      });
      return;
    }

    // Content sniff for PDFs (FR-AUDIT-010): a .pdf must actually start with %PDF- (catches a mis-named file).
    for (const f of picked.filter((f) => extOf(f.name) === '.pdf')) {
      const sig = String.fromCharCode(...new Uint8Array(await f.slice(0, 5).arrayBuffer()));
      if (sig !== '%PDF-') {
        setState({
          phase: 'error',
          message: `${f.name} is not a valid PDF (its contents don’t match its .pdf name). Re-export it as a PDF and try again.`,
        });
        return;
      }
    }

    setState({ phase: 'uploading', done: 0, total: picked.length });
    try {
      let done = 0;
      for (const f of picked) {
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
      <h3 className="font-semibold text-ink">Upload your source package</h3>
      <p className="mt-1 text-sm text-ink-3">
        Choose what you’re uploading, then add the file(s). FieldRoute reads the plan, route, and bore log to
        place the redline; photos are stored for reference only — they don’t affect redlines yet.
      </p>

      {/* Type selector — clear buttons/cards, the selected one is obvious. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const selected = k.kind === kind;
          return (
            <button
              key={k.kind}
              type="button"
              onClick={() => { setKind(k.kind); setState({ phase: 'idle' }); if (inputRef.current) inputRef.current.value = ''; }}
              aria-pressed={selected}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                selected ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line hover:border-accent/50'
              }`}>
              <Icon className={`mt-0.5 size-5 shrink-0 ${selected ? 'text-accent-strong' : 'text-ink-3'}`} strokeWidth={1.75} />
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${selected ? 'text-accent-strong' : 'text-ink'}`}>{k.label}</span>
                <span className="block text-xs text-ink-3">{k.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* File picker scoped to the selected type. */}
      <div className="mt-3">
        <label className="block text-sm font-medium text-ink">
          Add {def.label} file(s)
          <span className="ml-1 font-normal text-ink-3">— accepted: {def.exts.join(' · ')}, up to {formatMb(MAX_UPLOAD_BYTES)} each</span>
        </label>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={def.accept}
          onChange={(e) => onPick(e.target.files)}
          disabled={state.phase === 'uploading'}
          className="mt-1.5 block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
        />
      </div>

      {kind === 'BORE_LOG' && (
        <p className="mt-2 text-xs text-ink-3">
          The bore log is <span className="font-medium">stored for your review, not auto-read</span> (no OCR) —
          you confirm its stations in the <span className="font-medium">Bore logs</span> step before the engine
          uses them. Upload multiple bore logs separately; each is reviewed on its own.
        </p>
      )}
      {kind === 'PHOTO' && (
        <p className="mt-2 text-xs text-ink-3">
          <span className="font-medium">Photos</span> are stored for reference only — they don’t affect redlines yet.
        </p>
      )}

      {state.phase === 'uploading' && (
        <p className="mt-2 text-sm text-ink-3">Uploading {state.done}/{state.total}…</p>
      )}
      {state.phase === 'done' && (
        <p className="mt-2 text-sm text-ink-3">Uploaded {state.count} file(s) — stored + queued.</p>
      )}
      {state.phase === 'error' && <p className="mt-2 text-sm text-red-600">{state.message}</p>}
    </Card>
  );
}
