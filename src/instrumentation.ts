// Next.js instrumentation hook (standard seam; no added dependency).
//
// `register` is reserved for provider initialization (e.g. `Sentry.init`) when a deployment adds one — it is
// a no-op by default. `onRequestError` forwards server-side request errors to the DEFAULT-OFF observability
// seam, which only does anything when `FIELDROUTE_OBSERVABILITY_DSN` is set. Only the sanitized route path is
// passed on — never request headers, cookies, body, or tenant/session identity.

import type { Instrumentation } from 'next';

export function register(): void {
  // No-op by default. A deployment wiring a provider SDK initializes it here.
}

export const onRequestError: Instrumentation.onRequestError = async (err, _request, context) => {
  const { reportError } = await import('@/lib/observability');
  reportError(err, { route: context?.routePath, kind: 'request' });
};
