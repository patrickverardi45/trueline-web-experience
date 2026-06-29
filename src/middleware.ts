import { NextResponse, type NextRequest } from 'next/server';

import { rawToAlias } from '@/lib/jobLabels';

// The legacy contract-preview / mock surfaces (/map, /plans, /redlines, /closeout, /evidence, /feed,
// /packet, /projects, /settings) have been deleted — the product is the single /intake workspace, the
// landing page, and the finished-redline gallery. Middleware now only normalizes a raw internal store
// slug in ?job= to its neutral alias so the address bar and hydration payload never carry a "demo-*" slug.
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

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
  matcher: ['/intake'],
};
