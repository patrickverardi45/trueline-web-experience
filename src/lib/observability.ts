// Default-OFF error-observability seam (dependency-free).
//
// `reportError` is a no-op unless a server-side DSN is configured (`FIELDROUTE_OBSERVABILITY_DSN`). When
// enabled it emits a STRUCTURED, non-sensitive server log — the error name/message plus a fixed allowlist of
// context fields. It NEVER logs tenant/session ids, request bodies, upload contents, URLs with query
// strings, cookies, or headers. A deployment that wires a provider SDK (Sentry, etc.) replaces the body of
// `reportError`; the call sites and the sanitized shape stay identical, so nothing else has to change.
//
// The DSN env has no `NEXT_PUBLIC_` prefix on purpose: it is server-only and is never inlined into the
// client bundle. In a client context `observabilityEnabled()` is simply false and `reportError` is a no-op.

export function observabilityEnabled(): boolean {
  return (process.env.FIELDROUTE_OBSERVABILITY_DSN ?? '').trim() !== '';
}

/** Deliberately narrow, non-sensitive context. Do NOT widen this to carry tenant/session/body/url. */
export type ObservabilityContext = {
  route?: string;
  kind?: string;
};

export function reportError(error: unknown, context: ObservabilityContext = {}): void {
  if (!observabilityEnabled()) return;
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  // Fixed allowlist only — never url query, headers, cookies, tenant/session, or request/upload bodies.
  const record = {
    level: 'error',
    name,
    message,
    route: context.route ?? null,
    kind: context.kind ?? null,
  };
  console.error(`[observability] ${JSON.stringify(record)}`);
}
