import type { MatchCategory, ChaseStatus } from "@/lib/types";

const CATEGORY_STYLES: Record<MatchCategory, string> = {
  matched: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  itc_at_risk: "bg-red-50 text-red-800 ring-red-200",
  unclaimed: "bg-sky-50 text-sky-800 ring-sky-200",
  value_mismatch: "bg-amber-50 text-amber-900 ring-amber-200",
};

const CATEGORY_LABELS: Record<MatchCategory, string> = {
  matched: "Matched",
  itc_at_risk: "ITC at risk",
  unclaimed: "Unclaimed",
  value_mismatch: "Value mismatch",
};

const STATUS_STYLES: Record<ChaseStatus, string> = {
  pending: "bg-amber-50 text-amber-900 ring-amber-200",
  fixed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  still_blocked: "bg-red-50 text-red-800 ring-red-200",
};

const STATUS_LABELS: Record<ChaseStatus, string> = {
  pending: "Pending",
  fixed: "Fixed",
  still_blocked: "Still blocked",
};

export function CategoryBadge({ category }: { category: MatchCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${CATEGORY_STYLES[category]}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function StatusBadge({ status }: { status: ChaseStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
