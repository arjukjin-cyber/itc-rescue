import type { CSSProperties } from "react";

const TONE_STYLE: Record<
  "default" | "danger" | "success" | "warn" | "info",
  CSSProperties
> = {
  default: {
    backgroundColor: "var(--color-bg)",
    borderColor: "var(--color-border)",
  },
  success: {
    backgroundColor: "var(--color-status-ok-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-ok-fg) 28%, transparent)",
    color: "var(--color-status-ok-fg)",
  },
  danger: {
    backgroundColor: "var(--color-status-risk-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-risk-fg) 28%, transparent)",
    color: "var(--color-status-risk-fg)",
  },
  warn: {
    backgroundColor: "var(--color-status-warn-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-warn-fg) 28%, transparent)",
    color: "var(--color-status-warn-fg)",
  },
  info: {
    backgroundColor: "var(--color-status-info-bg)",
    borderColor: "color-mix(in srgb, var(--color-status-info-fg) 28%, transparent)",
    color: "var(--color-status-info-fg)",
  },
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
        style={{ color: tone === "default" ? "var(--color-text)" : "inherit" }}
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
