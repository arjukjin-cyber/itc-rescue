/**
 * Per-GSTIN data scoping (pure; shared by API routes, db.ts and the client).
 *
 * A request may name the active company GSTIN (`?gstin=`). The rows that belong to it are those
 * whose company_gstin equals it, plus, for the PRIMARY GSTIN only, legacy rows saved before runs
 * were scoped (company_gstin '' / NULL). No `gstin` = unscoped (all of the user's rows), as before.
 */

/** company_gstin values a request covers; null = unscoped. */
export type GstinScope = string[] | null;

export function companyGstinScope(
  gstin: string | null | undefined,
  items: ReadonlyArray<{ gstin: string; isPrimary: boolean }>
): GstinScope {
  if (!gstin) return null;
  const primary = (items.find((g) => g.isPrimary) ?? items[0])?.gstin;
  return gstin === primary ? [gstin, ""] : [gstin];
}

/** True when a row's company_gstin (NULL/'' = legacy) falls in the scope. */
export function inGstinScope(companyGstin: string | null | undefined, scope: GstinScope): boolean {
  return scope === null || scope.includes(companyGstin || "");
}

/** Appends `?gstin=` (or `&gstin=`) when a GSTIN is selected. */
export function withGstinQuery(path: string, gstin: string | null | undefined): string {
  if (!gstin) return path;
  return `${path}${path.includes("?") ? "&" : "?"}gstin=${encodeURIComponent(gstin)}`;
}

/** GSTIN menu secondary text: the saved label when set, else the state name. */
export function gstinMenuLabel(label: string | null | undefined, stateName: string | null | undefined): string {
  const l = String(label || "").trim();
  return l || String(stateName || "");
}
