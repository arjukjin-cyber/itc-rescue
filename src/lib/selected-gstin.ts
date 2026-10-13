/**
 * The GSTIN switcher's current selection, published by AppShell from its GET /api/gstins fetch
 * so screens (reconcile) don't fetch the list again. null = list empty, still loading, or error:
 * callers then omit `gstin` from POST /api/recon.
 */
let current: string | null = null;
export function setSelectedGstin(g: string | null) {
  current = g || null;
}
export function getSelectedGstin(): string | null {
  return current;
}
