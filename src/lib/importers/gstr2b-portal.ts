/**
 * GST portal GSTR-2B Excel importer (B2B sheet).
 *
 * The workbook downloaded from GST portal > Returns Dashboard > GSTR-2B > Download
 * Excel has sheets such as "Read me", "ITC Available", "ITC not available",
 * "B2B", "B2BA", "B2B-CDNR", ... Only B2B (invoices from registered suppliers)
 * is imported here. Its layout:
 *
 *   row 1   "Goods and Services Tax  - GSTR-2B"          <- title rows
 *   row 2-4 period / "Taxable inward supplies received from registered persons"
 *   row 5   GSTIN of supplier | Trade/Legal name | Invoice details (merged x4) |
 *           Place of supply | Supply Attract Reverse Charge | Rate(%) |
 *           Taxable Value (₹) | Tax Amount (merged x4) | GSTR-1/IFF/GSTR-5 Period |
 *           GSTR-1/IFF/GSTR-5 Filing Date | ITC Availability | Reason |
 *           Applicable % of Tax Rate | Source | IRN | IRN Date
 *   row 6   (sub-headers) Invoice number | Invoice type | Invoice Date |
 *           Invoice Value(₹) | Integrated Tax(₹) | Central Tax(₹) | State/UT Tax(₹) | Cess(₹)
 *   row 7+  one row per invoice *per tax rate*
 *
 * Pure: works on a row grid (`sheet_to_json(..., { header: 1 })`), no XLSX/DOM.
 */

import { normalizeReturnPeriod } from "../gstin";
import { mergeInvoiceRows } from "../reconcile";
import type { InvoiceRecord } from "../types";
import {
  cellText,
  isExactHeader,
  isKnownHeader,
  mapColumns,
  mapRegisterRows,
  normalizeHeader,
  type ImportDetection,
} from "./tally-busy";

/** How many leading rows to scan for the (two-row) header. */
export const GSTR2B_HEADER_SCAN_ROWS = 10;

/** Portal-only headers (normalised); combined with "gstin of supplier" to detect the file. */
const PORTAL_SIGNALS = [
  "trade legal name",
  "invoice details",
  "invoice type",
  "place of supply",
  "supply attract reverse charge",
  "supply attracts reverse charge",
  "tax amount",
  "gstr 1 iff gstr 5 period",
  "gstr 1 iff gstr 5 filing date",
  "itc availability",
  "applicable pct of tax rate",
  "irn",
  "irn date",
];

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i;

/** Name of the B2B sheet in a portal GSTR-2B workbook, or null when there isn't one. */
export function pickGstr2bSheet(sheetNames: string[]): string | null {
  return sheetNames.find((n) => n.trim().toUpperCase() === "B2B") ?? null;
}

function isBlank(row: unknown[] | undefined): boolean {
  return !row || row.every((c) => cellText(c) === "");
}

/** A second header row: only short text cells, no data values, and at least one known header. */
function looksLikeSubHeader(row: unknown[] | undefined): boolean {
  if (isBlank(row)) return false;
  let known = 0;
  for (const c of row!) {
    if (c == null || c === "") continue;
    if (typeof c !== "string") return false; // numbers / Date cells mean data
    const t = c.trim();
    if (!t) continue;
    if (t.length > 60 || GSTIN_RE.test(t) || /^[\d.,\-\/ ]+$/.test(t)) return false;
    if (isKnownHeader(normalizeHeader(t))) known++;
  }
  return known > 0;
}

/**
 * Flatten a merged two-row header into one normalised label per column.
 * A group label ("Invoice details", "Tax Amount") is carried across the columns
 * it spans. Per column: use "group + sub-header" when that combination is a known
 * synonym, otherwise the sub-header, otherwise the top cell.
 */
export function flattenHeaderRows(top: unknown[], sub?: unknown[]): string[] {
  const width = Math.max(top.length, sub?.length ?? 0);
  const out: string[] = [];
  let group = "";
  for (let i = 0; i < width; i++) {
    const t = normalizeHeader(top[i]);
    const s = sub ? normalizeHeader(sub[i]) : "";
    if (t) group = t;
    else if (!s) group = "";
    const g = t || (s ? group : "");
    if (!s) {
      out.push(g);
      continue;
    }
    const combined = g && g !== s ? `${g} ${s}` : s;
    out.push(isExactHeader(combined) ? combined : s);
  }
  return out;
}

function isPortalHeader(flat: string[], top: string[]): boolean {
  const all = new Set([...flat, ...top].filter(Boolean));
  if (!all.has("gstin of supplier")) return false;
  if (!flat.includes("invoice number")) return false;
  return PORTAL_SIGNALS.filter((s) => all.has(s)).length >= 2;
}

/** Find the portal B2B header (1 or 2 rows) in the first ~10 rows. */
export function detectGstr2bPortal(rows: unknown[][]): ImportDetection | null {
  const limit = Math.min(rows.length, GSTR2B_HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (isBlank(row)) continue;
    const next = rows[i + 1];
    const twoRow = looksLikeSubHeader(next);
    const headers = flattenHeaderRows(row, twoRow ? next : undefined);
    if (!isPortalHeader(headers, row.map(normalizeHeader))) continue;
    return {
      source: "gstr2b_portal",
      headerRowIndex: twoRow ? i + 1 : i,
      headerRowCount: twoRow ? 2 : 1,
      headers,
      columns: mapColumns(headers),
    };
  }
  return null;
}

function parseYesNo(v: unknown): boolean | undefined {
  const t = cellText(v).toLowerCase();
  if (t === "yes" || t === "y") return true;
  if (t === "no" || t === "n") return false;
  return undefined;
}

/**
 * Convert B2B data rows into InvoiceRecords.
 * - keeps "ITC Availability" = No rows (flagged via `itcAvailable: false`)
 * - drops GSTR-2A style "<invoice>-Total" summary rows
 * - merges the per-tax-rate rows of one invoice (GSTIN + normalised invoice no + FY,
 *   the same key reconcile() uses for books)
 */
export function mapGstr2bPortalRows(
  rows: unknown[][],
  detection: ImportDetection,
  recordSource: "books" | "gstr2b"
): InvoiceRecord[] {
  const itcCol = detection.headers.indexOf("itc availability");
  const records = mapRegisterRows(rows, detection, recordSource, (rec, row) => {
    if (/-\s*total$/i.test(rec.rawInvoiceNumber ?? "")) return null;
    const itc = itcCol >= 0 ? parseYesNo(row[itcCol]) : undefined;
    return itc === undefined ? rec : { ...rec, itcAvailable: itc };
  });

  // Same key as the books side (GSTIN + normalised invoice no + financial year).
  return mergeInvoiceRows(records).records;
}

// ---------- return period (header block) ----------

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "August" / "Aug" / "Sept" -> 1-12, else null. Whole-word month names only. */
function monthNumber(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\.$/, "");
  if (t.length < 3) return null;
  const i = MONTHS.findIndex((m) => m === t || m.slice(0, 3) === t || (t === "sept" && m === "september"));
  return i >= 0 ? i + 1 : null;
}

/** "2026-27" / "2026-2027" -> 2026 (FY start year), else null. */
function fyStartYear(raw: string): number | null {
  const m = /^(20\d{2})\s*[-\u2013/]\s*(\d{2}|20\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const start = Number(m[1]);
  return Number(m[2]) % 100 === (start + 1) % 100 ? start : null;
}

function labelKey(v: unknown): string {
  return cellText(v).toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

/** Value for a label in a key/value header block: "Label | value" or "Label: value". */
function findLabelValue(rows: unknown[][], labels: string[]): string | null {
  for (const row of rows) {
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const text = cellText(row[i]);
      if (!text || row[i] instanceof Date) continue;
      const colon = text.indexOf(":");
      if (colon > 0 && labels.includes(labelKey(text.slice(0, colon)))) {
        const v = text.slice(colon + 1).trim();
        if (v) return v;
      }
      if (!labels.includes(labelKey(text))) continue;
      for (let j = i + 1; j < row.length; j++) {
        if (row[j] instanceof Date) break;
        const v = cellText(row[j]);
        if (v) return v;
      }
    }
  }
  return null;
}

/**
 * Return period (YYYY-MM) from a portal GSTR-2B header block, or null.
 *
 * The portal workbook states the period as "Financial Year | 2026-27" and
 * "Tax Period | August" (month name). Each block is scanned in order; the first
 * one that yields a valid period wins. Accepted:
 * - Tax Period already in a form normalizeReturnPeriod accepts (MMYYYY, YYYY-MM)
 * - Tax Period "<Month> <YYYY>"
 * - Tax Period "<Month>" + Financial Year "YYYY-YY" (Apr-Dec -> start year,
 *   Jan-Mar -> start year + 1)
 * Never guessed from invoice dates.
 */
export function extractGstr2bPortalPeriod(blocks: unknown[][][]): string | null {
  for (const rows of blocks) {
    const period = findLabelValue(rows, ["tax period", "return period"]);
    if (!period) continue;
    const direct = normalizeReturnPeriod(period);
    if (direct) return direct;
    const withYear = /^([A-Za-z.]+)[\s,'\u2019-]*(20\d{2})$/.exec(period.trim());
    if (withYear) {
      const mm = monthNumber(withYear[1]);
      if (mm) {
        const p = normalizeReturnPeriod(`${withYear[2]}-${String(mm).padStart(2, "0")}`);
        if (p) return p;
      }
      continue;
    }
    const mm = monthNumber(period);
    const fyRaw = findLabelValue(rows, ["financial year"]);
    const fy = fyRaw ? fyStartYear(fyRaw) : null;
    if (!mm || fy == null) continue;
    const year = mm >= 4 ? fy : fy + 1;
    const p = normalizeReturnPeriod(`${year}-${String(mm).padStart(2, "0")}`);
    if (p) return p;
  }
  return null;
}
