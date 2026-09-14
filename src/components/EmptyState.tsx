import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Shared zero-data empty state for app shell surfaces.
 * Keep copy calm and action-first for busy MSME ops.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-md px-6 py-10 text-center sm:px-8 sm:py-12 ${className}`}
      style={{
        backgroundColor: "var(--color-bg)",
        border: "1px dashed var(--color-border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 1px 2px #0000000d, 0 8px 24px #0f172a08",
      }}
    >
      <div
        className="mx-auto flex h-11 w-11 items-center justify-center"
        style={{
          backgroundColor: "var(--color-accent-soft)",
          color: "var(--color-accent)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <Icon size={22} strokeWidth={1.75} aria-hidden />
      </div>
      <h2
        className="mt-4 text-lg font-semibold sm:text-xl"
        style={{ color: "var(--color-text)" }}
      >
        {title}
      </h2>
      <p
        className="mx-auto mt-2 max-w-sm text-sm leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="btn-accent mt-6 inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
