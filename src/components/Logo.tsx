import Link from "next/link";

/** v1.0 mark: 26px ink square "IR" + wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex min-w-0 items-center gap-2 ${className}`} style={{ color: "var(--color-ink)" }}>
      <span
        className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[5px] text-[11px] font-bold tracking-[0.02em] text-white"
        style={{ backgroundColor: "var(--color-ink)" }}
      >
        IR
      </span>
      <span className="truncate text-[14px] font-semibold">ITC Rescue</span>
    </Link>
  );
}
