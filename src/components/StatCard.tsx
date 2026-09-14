import type { CSSProperties } from "react";

/** Option B: status meaning via border + value fg only — no status bg fills. */
const TONE_STYLE: Record<
  "default" | "danger" | "success" | "warn" | "info",
  CSSProperties
> = {
  default: {
    backgroundColor: "var(--color-bg)",
    borderColor: "var(--color-border)",
  },
  success: {
    backgroundColor: "var(--color-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-ok-fg) 40%, var(--color-border))",
  },
  danger: {
    backgroundColor: "var(--color-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-risk-fg) 40%, var(--color-border))",
  },
  warn: {
    backgroundColor: "var(--color-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-warn-fg) 40%, var(--color-border))",
  },
  info: {
    backgroundColor: "var(--color-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-info-fg) 40%, var(--color-border))",
  },
};

const VALUE_FG: Record<"default" | "danger" | "success" | "warn" | "info", string> = {
  default: "var(--color-text)",
  success: "var(--color-status-ok-fg)",
  danger: "var(--color-status-risk-fg)",
  warn: "var(--color-status-warn-fg)",
  info: "var(--color-status-info-fg)",
};

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "danger" | "success" | "warn" | "info";
}) {
  const toneStyle = TONE_STYLE[tone];
  return (
    <div
      className="rounded-[var(--radius-md)] border p-4 shadow-sm"
      style={toneStyle}
    >
      <div
        className="text-meta font-medium uppercase tracking-wide"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </div>
      <div
        className="mt-1.5 text-2xl font-bold tabular-nums"
        style={{ color: VALUE_FG[tone] }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-meta" style={{ color: "var(--color-text-secondary)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
