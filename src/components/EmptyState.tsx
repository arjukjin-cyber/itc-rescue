import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Shared zero-data empty state — tokens v0.1 contract:
 * icon 40 · heading · secondary body · one teal CTA. Max width 28rem.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  const showAction = Boolean(actionLabel && (actionHref || onAction));

  return (
    <div
      className={`mx-auto w-full max-w-md px-5 py-8 text-center sm:px-6 sm:py-10 ${className}`}
      style={{
        backgroundColor: "var(--color-bg)",
        border: "1px dashed var(--color-border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 1px 2px #0000000d",
      }}
    >
      <div
        className="mx-auto flex h-10 w-10 items-center justify-center"
        style={{
          backgroundColor: "var(--color-accent-soft)",
          color: "var(--color-accent)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <h2
        className="mt-3 text-lg font-semibold leading-7"
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
      {showAction && actionHref && !onAction && (
        <Link
          href={actionHref}
          className="btn-accent mt-4 inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold"
        >
          {actionLabel}
        </Link>
      )}
      {showAction && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-accent mt-4 inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
