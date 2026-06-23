import { Suspense } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { ProductIntake } from '@/components/ProductIntake';

export const metadata = { title: 'Demo workflows' };

// Guided demo intake. By default this is a "Choose a demo workflow" chooser; `?job=<demo>` opens a single
// minimal guided workflow; `?workspace=1` opens the internal upload workspace. ProductIntake reads the
// query via useSearchParams, so it is wrapped in a Suspense boundary.
export default function IntakePage() {
  return (
    <div>
      <PageHeader
        title="Demo workflows"
        sub="Run the engine on a prepared redline workflow. The raw upload workspace is available separately, off the guided path."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-ink-3">Loading…</p>}>
        <ProductIntake />
      </Suspense>
    </div>
  );
}
