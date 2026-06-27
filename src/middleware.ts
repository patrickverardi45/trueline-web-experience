import { NextResponse, type NextRequest } from 'next/server';

import { rawToAlias } from '@/lib/jobLabels';

// Legacy contract-preview / mock routes. They render offline mock-portfolio data ("Demo Project", sample
// billing, etc.) that is NOT the product truth path and is never linked from product nav — but they are
// reachable if a URL is typed/bookmarked, which would expose demo/mock/sample language. Redirect them
// SERVER-SIDE to the real FieldRoute Projects workspace so no customer-openable page can show that data.
const LEGACY_PREVIEW_PREFIXES = [
  '/closeout', '/packet', '/map', '/plans', '/feed', '/evidence', '/redlines', '/projects', '/settings',
];

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // 1. Legacy contract-preview / mock routes -> the real Projects workspace.
  if (LEGACY_PREVIEW_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = '/intake';
    url.search = '';
    url.searchParams.set('workspace', '1');
    return NextResponse.redirect(url);
  }

  // 2. On /intake, normalize a raw internal store slug in ?job= to its NEUTRAL alias (so the address bar
  //    and the server-rendered hydration payload never carry the raw "demo-*" slug). The app's own
  //    navigation already emits aliases; this only fires on a directly-typed/bookmarked raw URL.
  if (pathname === '/intake') {
    const job = searchParams.get('job');
    const alias = job ? rawToAlias(job) : null;
    if (alias) {
      const url = req.nextUrl.clone();
      url.searchParams.set('job', alias);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/intake',
    '/closeout', '/packet', '/map', '/plans', '/feed', '/evidence', '/redlines', '/settings',
    '/projects/:path*',
  ],
};
