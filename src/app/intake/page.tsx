import { PageHeader } from '@/components/ui/PageHeader';
import { ProductIntake } from '@/components/ProductIntake';

export const metadata = { title: 'Intake — v2 product' };

// Real product intake (product mode). Create a job, upload real files, see honest stored status/blockers.
// Not a seed demo and NOT /redlines — this is the start of the real start-to-finish workflow.
export default function IntakePage() {
  return (
    <div>
      <PageHeader
        title="Project intake"
        sub="Create a job, upload real files (PDF / KMZ / KML / bore logs / photos), and see honest stored status. No OCR or engine run yet — uploads are stored, never parsed."
      />
      <ProductIntake />
    </div>
  );
}
