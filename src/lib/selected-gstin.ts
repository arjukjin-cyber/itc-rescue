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

/**
 * Which GSTIN the switcher shows as selected: the user's pick when it is in the CURRENT user's
 * list, else primary, else first, else null (empty list: omit gstin). Pure.
 */
export function resolveSelectedGstin(
  items: ReadonlyArray<{ gstin: string; isPrimary: boolean }>,
  picked: string | null | undefined
): string | null {
  if (picked && items.some((g) => g.gstin === picked)) return picked;
  return (items.find((g) => g.isPrimary) ?? items[0])?.gstin ?? null;
}

/** localStorage key for a user's switcher pick (per signed-in email). */
export function pickedGstinKey(owner: string): string {
  return `itc-rescue:gstin:${owner.toLowerCase()}`;
}
