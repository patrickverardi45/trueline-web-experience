'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';

/**
 * Mock approve action — toggles an inline note instead of mutating anything.
 * The real approval workflow arrives with the backend.
 */
export function ApprovalNote() {
  const [showNote, setShowNote] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setShowNote((v) => !v)}>
        <ClipboardCheck className="size-4" strokeWidth={1.75} /> Review &amp; approve
      </Button>
      {showNote ? (
        <p className="absolute right-0 top-full z-10 mt-2 w-max max-w-xs rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-3 shadow-md">
          Mock — approval workflow lands with the backend.
        </p>
      ) : null}
    </div>
  );
}
