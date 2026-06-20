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
  title: {
    default: 'TrueLine — OSP construction intelligence',
    template: '%s · TrueLine',
  },
  description:
    'Plans, bore logs, field evidence, redlines, and closeout in one clean workflow. Contract-first preview experience.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Sidebar />
        <div className="pl-60">
          <Topbar />
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs font-medium text-amber-800">
            Read-only v2 staging · no upload / live render yet · some panels are UI demo only
          </div>
          <main className="mx-auto max-w-[1400px] p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
