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
      className={`mx-auto max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center sm:px-10 ${className}`}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        <Icon size={28} strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
