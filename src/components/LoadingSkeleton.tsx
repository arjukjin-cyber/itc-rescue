/**
 * Loading skeleton for screens fed by GET /api/recon and /api/chase (CPO must-fix: no
 * empty-state flash while data loads). v1.1 style: neutral grey blocks shaped like the
 * page header, KPI strip and a few table rows; 4–6px radius; a subtle opacity pulse that is
 * switched off under prefers-reduced-motion (see .skel in globals.css). The region carries
 * aria-busy="true"; the bars themselves are hidden from assistive tech.
 */
function Bar({ w, h = 10, md = false }: { w: number | string; h?: number; md?: boolean }) {
  return <span className="skel" data-r={md ? "md" : undefined} style={{ width: w, height: h }} aria-hidden />;
}

export function LoadingSkeleton({
  label,
  kpis = 0,
  rows = 5,
  cols = 5,
  actions = false,
}: {
  /** Accessible name of the busy region, e.g. "Loading dashboard". */
  label: string;
  /** Number of KPI cells (0 = no KPI strip). */
  kpis?: number;
  rows?: number;
  cols?: number;
  /** A button-shaped block right of the title (page actions). */
  actions?: boolean;
}) {
  const widths = ["70%", "55%", "45%", "60%", "40%", "50%"];
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite" aria-label={label} data-testid="loading-skeleton">
      <span className="sr-only">{label}</span>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Bar w={140} h={20} md />
          <Bar w={260} h={10} />
        </div>
        {actions && <Bar w={108} h={32} md />}
      </div>

      {kpis > 0 && (
        <div className="pt-1">
          <div className="kpis skel-kpis" style={{ ["--kpi-rest" as string]: Math.max(kpis - 1, 1) }} aria-hidden>
            {Array.from({ length: kpis }, (_, i) => (
              <div key={i} className="kpi flex flex-col gap-2.5">
                <Bar w={i === 0 ? 84 : 72} h={9} />
                <Bar w={i === 0 ? 128 : 96} h={18} md />
                <Bar w={i === 0 ? 150 : 110} h={8} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-scroll" aria-hidden>
        <table className="dt skel-table">
          <thead>
            <tr>
              {Array.from({ length: cols }, (_, c) => (
                <th key={c}>
                  <Bar w={c === 0 ? 64 : 48} h={8} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}>
                    <Bar w={c === cols - 1 ? 72 : widths[(r + c) % widths.length]} h={c === 0 ? 11 : 9} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
