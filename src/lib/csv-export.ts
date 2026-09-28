import type { MatchResult } from "./types";

const CATEGORY_LABEL: Record<string, string> = {
  matched: "Matched",
  itc_at_risk: "ITC at risk",
  unclaimed: "Unclaimed",
  value_mismatch: "Value mismatch",
};

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(","));
  // BOM so Excel opens UTF-8 (Hindi vendor names) correctly
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

const HEADERS = [
  "Category",
  "Vendor",
  "GSTIN",
  "Invoice",
  "Invoice Date",
  "Books Tax",
  "2B Tax",
  "Tax Diff",
  "Notes",
];

function row(r: MatchResult): unknown[] {
  return [
    CATEGORY_LABEL[r.category] ?? r.category,
    r.vendorName,
    r.gstin,
    r.invoiceNumber,
    r.invoiceDate,
    r.booksTax.toFixed(2),
    r.gstr2bTax.toFixed(2),
    r.taxDiff.toFixed(2),
    r.notes || "",
  ];
}

export function reconCsv(results: MatchResult[]): string {
  return toCsv(HEADERS, results.map(row));
}

export function atRiskResults(results: MatchResult[]): MatchResult[] {
  return results.filter((r) => r.category === "itc_at_risk");
}

export function atRiskCsv(results: MatchResult[]): string {
  const risk = atRiskResults(results);
  const total = risk.reduce((s, r) => s + (r.booksTax || 0), 0);
  const rows = risk.map(row);
  rows.push(["TOTAL ITC AT RISK", "", "", "", "", total.toFixed(2), "", "", `${risk.length} invoices`]);
  return toCsv(HEADERS, rows);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
