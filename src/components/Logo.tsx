import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2 font-bold ${className}`}
      style={{ color: "var(--color-text)" }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center text-sm text-white shadow-sm"
        style={{
          backgroundColor: "var(--color-accent)",
          borderRadius: "var(--radius-md)",
        }}
      >
        IR
      </span>
      <span>
        ITC <span style={{ color: "var(--color-accent)" }}>Rescue</span>
      </span>
    </Link>
  );
}
