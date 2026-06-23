import { PageHeader } from '@/components/ui/PageHeader';
import { ProductShowcaseGallery } from '@/components/ProductShowcaseGallery';

export const metadata = { title: 'Completed Redline Showcase' };

// Showcase route. The page itself does NO server-side fetch (so it returns 200 behind Cloudflare Access);
// the gallery reads the real artifacts client-side, where the browser carries the Access cookie.
export default function ShowcasePage() {
  return (
    <div>
      <PageHeader
        title="Completed Redline Showcase"
        sub="Finished output quality from real deterministic redline data — drawn red strokes on real plan sheets. Read-only."
      />
      <ProductShowcaseGallery />
    </div>
  );
}
