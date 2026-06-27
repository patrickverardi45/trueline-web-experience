import { NextResponse, type NextRequest } from 'next/server';

import { rawToAlias } from '@/lib/jobLabels';

// Server-side normalization: if a request arrives at /intake with a raw internal store slug in ?job=
// (e.g. a bookmarked/typed "demo-*" URL), redirect to its NEUTRAL alias BEFORE the page renders — so the
// address bar AND the server-rendered hydration payload only ever carry the alias, never the raw slug.
// The app's own navigation already emits aliases (workspaceHref), so this only fires on direct raw URLs.
export function middleware(req: NextRequest) {
  const job = req.nextUrl.searchParams.get('job');
  const alias = job ? rawToAlias(job) : null;
  if (alias) {
    const url = req.nextUrl.clone();
    url.searchParams.set('job', alias);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: '/intake' };
