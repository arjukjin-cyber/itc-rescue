import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Empty state — v1.0: bordered box, 32px icon tile, ONE sentence, ONE primary
 * button, optional quiet text link. No body paragraph (`description` is kept
 * only for backwards compatibility and should not be used on app screens).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
}) {
  return (
    <div className={`card flex w-full flex-col items-center px-6 py-12 text-center ${className}`}>
      <div className="icon-tile">
        <Icon size={16} strokeWidth={1.75} aria-hidden />
      </div>
      <p className="mt-3 text-[14px] font-medium" style={{ color: "var(--color-ink)" }}>
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px]" style={{ color: "var(--color-text-3)" }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn btn-pri btn-lg mt-4">
          {actionLabel}
        </button>
      )}
      {actionLabel && actionHref && !onAction && (
        <Link href={actionHref} className="btn btn-pri btn-lg mt-4">
          {actionLabel}
        </Link>
      )}
      {secondaryLabel && secondaryHref && (
        <Link href={secondaryHref} className="link-accent mt-3 text-[13px]">
          {secondaryLabel}
        </Link>
      )}
    </div>
  );
}
