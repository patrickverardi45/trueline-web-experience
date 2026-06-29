import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Customer-facing brand is FieldRoute. "TrueLine" is an internal engine codename and must never
  // appear in a customer surface (see docs/product/fieldroute_product_direction.md, FR-AUDIT-001).
  title: {
    default: 'FieldRoute — OSP redline & closeout',
    template: '%s · FieldRoute',
  },
  description:
    'Upload your plan, route, and bore log once; FieldRoute extracts the redline from the real engine, '
    + 'shows it on a clean map and source-backed proof view, and asks for review only when placement is uncertain.',
};

// Render every route dynamically (per-request), never at build time. In product mode the server-data
// pages call the live (Access-gated) product API, which can't be reached during static prerender — so a
// production build (`next build`) must NOT statically generate them. This segment config cascades to all
// nested routes. It also makes the production build viable, which is what gives us CONTENT-HASHED,
// immutable chunk URLs — the real fix for stale dev chunks behind the Cloudflare edge.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Sidebar />
        <div className="pl-60 print:pl-0">
          <div className="print:hidden">
            <Topbar />
          </div>
          <main className="mx-auto max-w-[1400px] p-6 print:max-w-none print:p-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
