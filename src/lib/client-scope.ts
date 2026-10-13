/**
 * Client data scope (pure): every client-side cache and every in-flight data request for recon,
 * vendor, chase or count data is tied to ONE (user, GSTIN) pair. Nothing renders or fetches until
 * that pair is known, and a response for any other pair is dropped (race guard).
 */

/**
 * Cache / request scope key: lowercased user email + active GSTIN ("" = the user has no GSTIN).
 * null = not resolved yet (no /me user, or the GSTIN list hasn't loaded): fetch nothing.
 */
export function dataScopeKey(
  email: string | null | undefined,
  gstinListReady: boolean,
  gstin: string | null | undefined
): string | null {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !gstinListReady) return null;
  return `${e}|${String(gstin || "").trim().toUpperCase()}`;
}

/** True only when a response fetched for `requested` still matches the current scope. */
export function isCurrentScope(requested: string | null, current: string | null): boolean {
  return requested !== null && current !== null && requested === current;
}

/**
 * Request-id guard: begin() for every request; accept() is true only for the LATEST request and
 * only while its scope is still the current one. Older or cross-scope responses are dropped.
 */
export function createRequestGuard(currentScope: () => string | null) {
  let seq = 0;
  return {
    begin(scope: string | null): { id: number; scope: string | null } {
      return { id: ++seq, scope };
    },
    accept(req: { id: number; scope: string | null }): boolean {
      return req.id === seq && isCurrentScope(req.scope, currentScope());
    },
    invalidate() {
      seq++;
    },
  };
}
