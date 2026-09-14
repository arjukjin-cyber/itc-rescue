import type { CSSProperties } from "react";
import type { MatchCategory, ChaseStatus } from "@/lib/types";

/** Status chips — colors from design tokens only (no invented hex). */
const CATEGORY_VARS: Record<
  MatchCategory,
  { bg: string; fg: string }
> = {
  matched: { bg: "var(--color-status-ok-bg)", fg: "var(--color-status-ok-fg)" },
  itc_at_risk: { bg: "var(--color-status-risk-bg)", fg: "var(--color-status-risk-fg)" },
  unclaimed: { bg: "var(--color-status-info-bg)", fg: "var(--color-status-info-fg)" },
  value_mismatch: { bg: "var(--color-status-warn-bg)", fg: "var(--color-status-warn-fg)" },
};

const CATEGORY_LABELS: Record<MatchCategory, string> = {
  matched: "Matched",
  itc_at_risk: "ITC at risk",
  unclaimed: "Unclaimed",
  value_mismatch: "Value mismatch",
};

const STATUS_VARS: Record<ChaseStatus, { bg: string; fg: string }> = {
  pending: { bg: "var(--color-status-warn-bg)", fg: "var(--color-status-warn-fg)" },
  fixed: { bg: "var(--color-status-ok-bg)", fg: "var(--color-status-ok-fg)" },
  still_blocked: { bg: "var(--color-status-risk-bg)", fg: "var(--color-status-risk-fg)" },
};

const STATUS_LABELS: Record<ChaseStatus, string> = {
  pending: "Pending",
  fixed: "Fixed",
  still_blocked: "Still blocked",
};

function chipStyle(bg: string, fg: string): CSSProperties {
  return {
    backgroundColor: bg,
    color: fg,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${fg} 22%, transparent)`,
    borderRadius: "var(--radius-sm)",
  };
}

export function CategoryBadge({ category }: { category: MatchCategory }) {
  const { bg, fg } = CATEGORY_VARS[category];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold"
      style={chipStyle(bg, fg)}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function StatusBadge({ status }: { status: ChaseStatus }) {
  const { bg, fg } = STATUS_VARS[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold"
      style={chipStyle(bg, fg)}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
