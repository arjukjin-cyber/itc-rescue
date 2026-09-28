import type { MatchCategory, MatchResult } from "./types";

/**
 * ITC filtered views of the latest recon (Drop 1, CTO): /reconcile?view=at-risk | mismatches |
 * unclaimed | matched. The sidebar shows At risk / Mismatches / Unclaimed (v3 frames); Matched
 * is reached from the Runs tabs. UI-only: filters the results GET /api/recon already returns.
 */
export type ItcView = "at_risk" | "mismatch" | "unclaimed" | "matched";

export interface ItcViewDef {
  key: ItcView;
  /** ?view= value on /reconcile */
  slug: string;
  /** Sidebar label */
  label: string;
  /** Page title */
  title: string;
  /** The one helper line on the view */
  helper: string;
  /** One-sentence empty state when the latest recon has no rows in this view */
  empty: string;
  category: MatchCategory;
  dot: "dot-risk" | "dot-warn" | "dot-info" | "dot-ok";
}

export const ITC_VIEWS: ItcViewDef[] = [
  {
    key: "at_risk",
    slug: "at-risk",
    label: "At risk",
    title: "ITC at risk",
    helper: "Invoices in your books that are missing from GSTR-2B.",
    empty: "No ITC at risk in the latest recon.",
    category: "itc_at_risk",
    dot: "dot-risk",
  },
  {
    key: "mismatch",
    slug: "mismatches",
    label: "Mismatches",
    title: "Value mismatches",
    helper: "Invoices where the tax in your books differs from GSTR-2B.",
    empty: "No value mismatches in the latest recon.",
    category: "value_mismatch",
    dot: "dot-warn",
  },
  {
    key: "unclaimed",
    slug: "unclaimed",
    label: "Unclaimed",
    title: "Unclaimed in 2B",
    helper: "Invoices in GSTR-2B that are not in your books.",
    empty: "Every GSTR-2B invoice is already in your books.",
    category: "unclaimed",
    dot: "dot-info",
  },
  {
    key: "matched",
    slug: "matched",
    label: "Matched",
    title: "Matched ITC",
    helper: "Invoices that match GSTR-2B on GSTIN, number, date and tax.",
    empty: "No invoices matched in the latest recon.",
    category: "matched",
    dot: "dot-ok",
  },
];

/** Accepts the slug (at-risk) and the older key form (at_risk) used by earlier ?view= links. */
export function viewFromSlug(slug: string | null | undefined): ItcView | null {
  if (!slug) return null;
  return ITC_VIEWS.find((d) => d.slug === slug || d.key === slug)?.key ?? null;
}

export function viewDef(v: ItcView): ItcViewDef {
  return ITC_VIEWS.find((d) => d.key === v)!;
}

export function viewHref(v: ItcView): string {
  return `/reconcile?view=${viewDef(v).slug}`;
}

export function viewCounts(results: MatchResult[]): Record<ItcView, number> {
  const c: Record<ItcView, number> = { at_risk: 0, mismatch: 0, unclaimed: 0, matched: 0 };
  for (const r of results) {
    const d = ITC_VIEWS.find((x) => x.category === r.category);
    if (d) c[d.key] += 1;
  }
  return c;
}
