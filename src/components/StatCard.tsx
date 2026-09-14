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
  const tones = {
    default: "border-slate-200 bg-white",
    danger: "border-red-200 bg-red-50",
    success: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-200 bg-amber-50",
    info: "border-sky-200 bg-sky-50",
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="text-meta font-medium uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-meta text-slate-600">{sub}</div>}
    </div>
  );
}
