import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-bold text-slate-900 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-sm text-white shadow-sm">
        IR
      </span>
      <span>
        ITC <span className="text-teal-700">Rescue</span>
      </span>
    </Link>
  );
}
