import { Clock } from "lucide-react";
import { inrParts } from "@/lib/format";
import { atRiskTotal, mismatchTotal } from "./RiskTable";
import type { Gstr3bDue } from "@/lib/filing";
import type { MatchResult, ReconSummary } from "@/lib/types";

function Money({ n, risk = false }: { n: number; risk?: boolean }) {
  const p = inrParts(n);
  return (
    <div className="kpi-v" style={risk ? { color: "var(--color-risk)" } : undefined}>
      {p.whole}
      <small>{p.paise}</small>
    </div>
  );
}

/**
 * KPI strip — ITC at risk · Value mismatch · Unclaimed in 2B · Matched ITC · (GSTR-3B due).
 * ITC at risk = itc_at_risk rows only; mismatch is its own cell and never added in.
 */
export function KpiStrip({
  results,
  summary,
  due,
}: {
  results: MatchResult[];
  summary: ReconSummary;
  due?: Gstr3bDue;
}) {
  const risk = results.filter((r) => r.category === "itc_at_risk");
  const mm = results.filter((r) => r.category === "value_mismatch");
  const un = results.filter((r) => r.category === "unclaimed");
  const matched = results.filter((r) => r.category === "matched");
  const unAmt = un.reduce((s, r) => s + (r.gstr2bTax || 0), 0);
  const matchedAmt = summary.matchedAmount ?? matched.reduce((s, r) => s + (r.booksTax || 0), 0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="kpis" style={{ ["--kpi-rest" as string]: due ? 4 : 3 }}>
      <div className="kpi">
        <div className="kpi-l">
          <span className="dot dot-risk" aria-hidden />
          ITC at risk
        </div>
        <Money n={atRiskTotal(results)} risk />
        <div className="kpi-s">{plural(risk.length, "invoice")} missing from GSTR-2B</div>
      </div>
      <div className="kpi">
        <div className="kpi-l">
          <span className="dot dot-warn" aria-hidden />
          Value mismatch
        </div>
        <Money n={mismatchTotal(results)} />
        <div className="kpi-s">{plural(mm.length, "invoice")} · tax differs</div>
      </div>
      <div className="kpi">
        <div className="kpi-l">Unclaimed in 2B</div>
        <Money n={unAmt} />
        <div className="kpi-s">{plural(un.length, "invoice")} not in books</div>
      </div>
      <div className="kpi">
        <div className="kpi-l">Matched ITC</div>
        <Money n={matchedAmt} />
        <div className="kpi-s">
          {matched.length} of {plural(summary.totalBooks, "invoice")}
        </div>
      </div>
      {due && (
        <div className="kpi" id="filing">
          <div className="kpi-l">
            <Clock size={13} strokeWidth={1.75} aria-hidden />
            GSTR-3B due
          </div>
          <div className="kpi-v">
            {due.daysLeft < 0 ? Math.abs(due.daysLeft) : due.daysLeft}{" "}
            <small>{due.daysLeft < 0 ? "days overdue" : due.daysLeft === 1 ? "day" : "days"}</small>
          </div>
          <div className="kpi-s">
            {due.dueLabel} · {inrParts(due.blocked).whole} blocked
          </div>
        </div>
      )}
    </div>
  );
}
