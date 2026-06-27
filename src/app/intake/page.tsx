import { Suspense } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { ProductIntake } from '@/components/ProductIntake';

export const metadata = { title: 'Projects' };

// Projects workspace. Renders the project list + the selected project's single-page workflow (upload →
// redline → review/correct → closeout → export). ProductIntake reads the query (?job=, ?section=) via
// useSearchParams, so it is wrapped in a Suspense boundary.
export default function IntakePage() {
  return (
    <div>
      <PageHeader
        title="Projects"
        sub="Create a project, upload your files, generate and review the redline, then assemble and download the closeout package."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-ink-3">Loading…</p>}>
        <ProductIntake />
      </Suspense>
    </div>
  );
}
