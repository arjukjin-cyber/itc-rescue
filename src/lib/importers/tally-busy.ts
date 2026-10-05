/**
 * Tally / Busy purchase-register importer.
 *
 * Pure, dependency-free helpers (no XLSX, no DOM) that take a sheet as an
 * array of rows (`unknown[][]`, i.e. `sheet_to_json(..., { header: 1 })`) and:
 *
 *  1. find the real header row inside the first ~15 rows (skipping company-name
 *     and period title rows),
 *  2. normalise headers (case, punctuation, spacing) and map synonyms onto the
 *     internal invoice fields,
 *  3. detect which tool produced the export: "tally" | "busy" | "template" | "generic",
 *  4. turn the data rows into InvoiceRecords while skipping blank, repeated-header
 *     and total/subtotal rows and normalising dates and amounts.
 *
 * The ITC Rescue template is still parsed by the legacy `rowToInvoice` path in
 * parseFile.ts; this module only tells parseFile which path to take.
 */

import { normalizeGstin, normalizeInvoiceNumber } from "../reconcile";
import { PHONE_HEADERS, normalizeIndianMobile } from "../phone";
import type { InvoiceRecord } from "../types";

export type ImportSource =
  | "tally"
  | "busy"
  | "template"
  | "generic"
  | "gstr2b_portal"
  | "gstr2b_portal_json";

export type ImportField =
  | "gstin"
  | "vendorName"
  | "invoiceNumber"
  | "voucherNumber"
  | "invoiceDate"
  | "voucherDate"
  | "taxableValue"
  | "igst"
  | "cgst"
  | "sgst"
  | "cess"
  | "totalTax"
  | "invoiceValue";

/** field -> column indexes (tax fields may sum several ledger columns) */
export type ColumnMap = Partial<Record<ImportField, number[]>>;

export interface ImportDetection {
  source: ImportSource;
  /** 0-based index of the header row within the rows passed in */
  headerRowIndex: number;
  /** normalised header cells */
  headers: string[];
  columns: ColumnMap;
  /** header rows used (2 for the GST portal's merged header); data starts after headerRowIndex */
  headerRowCount?: number;
}

/** How many leading rows to scan for the header row. */
export const HEADER_SCAN_ROWS = 15;

/**
 * Header synonyms, already in normalised form (see normalizeHeader).
 * Order matters: earlier entries win when several columns match one field.
 */
export const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  gstin: [
    "gstin",
    "gstin uin",
    "party gstin uin",
    "party gstin",
    "supplier gstin",
    "supplier gstin uin",
    "gstin of supplier",
    "vendor gstin",
    "gstin no",
    "gstin number",
    "party gst no",
    "gst no",
    "gst number",
    "gst in",
  ],
  vendorName: [
    "vendor name",
    "supplier name",
    "party name",
    "particulars",
    "party",
    "name of supplier",
    "trade legal name",
    "trade name",
    "legal name",
    "party a c name",
    "account name",
    "ledger name",
    "supplier",
    "vendor",
    "name",
  ],
  invoiceNumber: [
    "invoice number",
    "supplier invoice no",
    "supplier invoice number",
    "supplier inv no",
    "supplier bill no",
    "party bill no",
    "party inv no",
    "invoice no",
    "inv no",
    "invoice",
    "invoicenumber",
    "bill no",
    "bill number",
    "ref no",
    "reference no",
  ],
  voucherNumber: [
    "vch no",
    "voucher no",
    "voucher number",
    "vch number",
    "vch bill no",
  ],
  invoiceDate: [
    "invoice date",
    "supplier invoice date",
    "supplier inv date",
    "supplier bill date",
    "party bill date",
    "inv date",
    "bill date",
    "document date",
    "ref date",
    "reference date",
  ],
  voucherDate: ["date", "vch date", "voucher date"],
  taxableValue: [
    "taxable value",
    "taxable amt",
    "taxable amount",
    "taxable",
    "assessable value",
    "basic amount",
    "basic amt",
    "value",
  ],
  igst: [
    "igst",
    "igst amount",
    "igst amt",
    "integrated tax",
    "integrated tax amount",
    "integrated tax paid",
    "input igst",
  ],
  cgst: [
    "cgst",
    "cgst amount",
    "cgst amt",
    "central tax",
    "central tax amount",
    "central tax paid",
    "input cgst",
  ],
  sgst: [
    "sgst",
    "sgst amount",
    "sgst amt",
    "state tax",
    "state tax amount",
    "state ut tax",
    "state ut tax amount",
    "state ut tax paid",
    "sgst utgst",
    "utgst",
    "input sgst",
  ],
  cess: ["cess", "cess amount", "cess amt", "cess paid"],
  totalTax: [
    "total tax",
    "total tax amount",
    "tax amount",
    "tax amt",
    "total gst",
    "gst amount",
    "itc",
  ],
  invoiceValue: [
    "gross total",
    "net amt",
    "net amount",
    "invoice value",
    "bill amount",
    "bill amt",
    "total amount",
    "grand total",
    "total value",
  ],
};

/** Tax columns that may appear per ledger/rate, e.g. "Input CGST @9%". */
const FUZZY_TAX: Partial<Record<ImportField, RegExp>> = {
  igst: /\b(igst|integrated tax)\b/,
  cgst: /\b(cgst|central tax)\b/,
  sgst: /\b(sgst|utgst|state tax|state ut tax)\b/,
  cess: /\bcess\b/,
};

/** Headers that characterise each tool's export (normalised form). */
const TALLY_SIGNALS = [
  "particulars",
  "vch no",
  "vch type",
  "voucher no",
  "voucher type",
  "gstin uin",
  "party gstin uin",
  "supplier invoice no",
  "supplier invoice date",
  "integrated tax amount",
  "central tax amount",
  "state tax amount",
  "state ut tax amount",
  "gross total",
];
const BUSY_SIGNALS = [
  "party name",
  "bill no",
  "bill date",
  "taxable amt",
  "net amt",
  "igst amt",
  "cgst amt",
  "sgst amt",
  "tax amt",
  "vch bill no",
];
/** The ITC Rescue sample/template columns (public/samples/*.csv). */
const TEMPLATE_HEADERS = [
  "gstin",
  "vendor name",
  "invoice number",
  "invoice date",
  "taxable value",
  "cgst",
  "sgst",
  "igst",
  "total tax",
];

const ALL_FIELDS = Object.keys(HEADER_SYNONYMS) as ImportField[];

/**
 * Normalise a header cell: lower-case, "%" -> " pct ", "#" dropped,
 * every other non-alphanumeric run -> single space.
 *   "Party GSTIN/UIN" -> "party gstin uin", "Supplier Invoice No." -> "supplier invoice no"
 */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/%/g, " pct ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v).trim();
}

function isBlankRow(row: unknown[] | undefined): boolean {
  return !row || row.every((c) => cellText(c) === "");
}

/** Rate columns ("CGST %", "Tax Rate") must never be read as amounts. */
function isRateHeader(h: string): boolean {
  return /\b(rate|pct|percent)\b/.test(h) && !/\d/.test(h);
}

function exactField(h: string): ImportField | null {
  if (!h) return null;
  for (const f of ALL_FIELDS) {
    if (HEADER_SYNONYMS[f].includes(h)) return f;
  }
  return null;
}

function fuzzyTaxField(h: string): ImportField | null {
  if (!h || isRateHeader(h)) return null;
  for (const [f, re] of Object.entries(FUZZY_TAX) as [ImportField, RegExp][]) {
    if (re.test(h)) return f;
  }
  return null;
}

/** Build the field -> column(s) map for a normalised header row. */
export function mapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();

  // 1) exact synonyms; the earliest synonym in the list wins per field
  for (const f of ALL_FIELDS) {
    let best = -1;
    let bestRank = Infinity;
    headers.forEach((h, i) => {
      if (used.has(i)) return;
      const rank = HEADER_SYNONYMS[f].indexOf(h);
      if (rank >= 0 && rank < bestRank) {
        bestRank = rank;
        best = i;
      }
    });
    if (best >= 0) {
      map[f] = [best];
      used.add(best);
    }
  }

  // 2) per-ledger tax columns (Tally columnar registers: "Input CGST @9%", "Input CGST @6%")
  for (const f of Object.keys(FUZZY_TAX) as ImportField[]) {
    if (map[f]) continue;
    const cols: number[] = [];
    headers.forEach((h, i) => {
      if (!used.has(i) && fuzzyTaxField(h) === f) cols.push(i);
    });
    if (cols.length) {
      map[f] = cols;
      cols.forEach((i) => used.add(i));
    }
  }

  // 3) no explicit taxable column: Tally lists purchase ledgers as columns ("Purchase @18%")
  if (!map.taxableValue) {
    const cols: number[] = [];
    headers.forEach((h, i) => {
      if (!used.has(i) && /\bpurchases?\b/.test(h) && !isRateHeader(h)) cols.push(i);
    });
    if (cols.length) {
      map.taxableValue = cols;
      cols.forEach((i) => used.add(i));
    }
  }
  return map;
}

/** True when a normalised header maps to an internal field (exact synonym or per-ledger tax column). */
export function isKnownHeader(h: string): boolean {
  return (exactField(h) ?? fuzzyTaxField(h)) !== null;
}

/** True when a normalised header is an exact synonym (no fuzzy matching). */
export function isExactHeader(h: string): boolean {
  return exactField(h) !== null;
}

function headerScore(headers: string[]): number {
  const fields = new Set<ImportField>();
  for (const h of headers) {
    const f = exactField(h) ?? fuzzyTaxField(h);
    if (f) fields.add(f);
  }
  const hasId =
    fields.has("gstin") || fields.has("invoiceNumber") || fields.has("voucherNumber");
  return hasId ? fields.size : 0;
}

/** Index of the most header-like row among the first `maxScan` rows, or -1. */
export function findHeaderRow(rows: unknown[][], maxScan = HEADER_SCAN_ROWS): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;
    const score = headerScore(row.map(normalizeHeader));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  // need an id column plus at least two other recognised columns
  return bestScore >= 3 ? best : -1;
}

/** Classify a header row as Tally, Busy, the ITC Rescue template, or generic. */
export function detectSourceFromHeaders(headers: string[]): ImportSource {
  const present = headers.filter(Boolean);
  const set = new Set(present);

  const isTemplate =
    present.length >= 4 &&
    set.has("gstin") &&
    set.has("invoice number") &&
    present.every((h) => TEMPLATE_HEADERS.includes(h));
  if (isTemplate) return "template";

  const tally = TALLY_SIGNALS.filter((s) => set.has(s)).length;
  const busy = BUSY_SIGNALS.filter((s) => set.has(s)).length;
  if (tally < 2 && busy < 2) return "generic";
  if (tally === busy) return set.has("particulars") ? "tally" : "busy";
  return tally > busy ? "tally" : "busy";
}

/** Find the header row and work out source + column mapping. */
export function detectImport(rows: unknown[][]): ImportDetection | null {
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) return null;
  const headers = rows[headerRowIndex].map(normalizeHeader);
  return {
    source: detectSourceFromHeaders(headers),
    headerRowIndex,
    headers,
    columns: mapColumns(headers),
  };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

function fullYear(y: string): string {
  return y.length === 2 ? `20${y}` : y;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function excelSerialToIso(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(serial) * 86400000).toISOString().slice(0, 10);
}

/**
 * Normalise export dates to YYYY-MM-DD. Handles "1-Apr-2025", "1-Apr-25",
 * "01 Apr 2025", "Apr 1, 2025", "01/04/2025", "01-04-25", "01.04.2025",
 * "2025-04-01", Excel serial numbers (number or numeric string) and Date cells.
 * Returns "" for empty input and the trimmed text if it cannot be parsed.
 */
export function parseImportDate(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return "";
    // SheetJS may build local-midnight Dates; snap to the nearest UTC day so
    // IST (+5:30) and other |offset| < 12h zones don't shift the day.
    const day = Math.round(raw.getTime() / 86400000);
    return new Date(day * 86400000).toISOString().slice(0, 10);
  }
  if (typeof raw === "number") {
    return raw > 0 && raw < 2958466 ? excelSerialToIso(raw) : "";
  }
  const s = String(raw).trim();
  if (!s) return "";

  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n >= 20000 && n <= 80000) return excelSerialToIso(n); // 1954..2119
  }

  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T].*)?$/);
  if (m && isValidYmd(+m[1], +m[2], +m[3])) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  // D/M/Y (Indian default), optional trailing time
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    const y = fullYear(m[3]);
    if (isValidYmd(+y, +m[2], +m[1])) return `${y}-${pad2(m[2])}-${pad2(m[1])}`;
  }

  // 1-Apr-2025, 01 Apr 25, 1-April-2025, 1/Apr/2025
  m = s.match(/^(\d{1,2})[\s\-\/.]+([a-z]{3,9})[\s\-\/.,]+(\d{2}|\d{4})$/i);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    const y = fullYear(m[3]);
    if (mon && isValidYmd(+y, mon, +m[1])) return `${y}-${pad2(mon)}-${pad2(m[1])}`;
  }

  // Apr 1, 2025
  m = s.match(/^([a-z]{3,9})[\s\-.]+(\d{1,2}),?[\s\-.]+(\d{2}|\d{4})$/i);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase().slice(0, 4)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)];
    const y = fullYear(m[3]);
    if (mon && isValidYmd(+y, mon, +m[2])) return `${y}-${pad2(mon)}-${pad2(m[2])}`;
  }
  return s;
}

/**
 * Normalise export amounts: "1,23,456.50", "₹ 18,000", "Rs. 500", "45,000.00 Dr",
 * "1,200 Cr", "(1,500.00)", "-", "Nil". Dr/Cr only states the ledger side, so the
 * magnitude is used; parentheses or a leading minus make the value negative.
 */
export function parseImportAmount(raw: unknown): number {
  if (typeof raw === "number") return isFinite(raw) ? raw : 0;
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s
    .replace(/\b(dr|cr)\.?\s*$/i, "")
    .replace(/^(dr|cr)\.?\s+/i, "")
    .replace(/₹|\brs\.?|\binr\b/gi, "")
    .replace(/[,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!s || /^(nil|na|n\/a|-+|—)$/i.test(s)) return 0;
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

const TOTAL_LABEL =
  /^(grand\s*|sub\s*-?\s*|page\s*|net\s*)?totals?\b|^(opening|closing)\s+balance\b|^(carried|brought)\s+(over|forward)\b|^[cb]\/f\b/i;

function get(row: unknown[], cols: number[] | undefined): unknown {
  if (!cols) return undefined;
  for (const c of cols) {
    const v = row[c];
    if (cellText(v) !== "") return v;
  }
  return undefined;
}

function sum(row: unknown[], cols: number[] | undefined): number {
  if (!cols) return 0;
  return cols.reduce((s, c) => s + parseImportAmount(row[c]), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True for total / subtotal / balance rows that exports append. */
export function isTotalRow(row: unknown[], columns: ColumnMap): boolean {
  if (cellText(get(row, columns.gstin))) return false; // a real party row
  const inv = cellText(get(row, columns.invoiceNumber) ?? get(row, columns.voucherNumber));
  if (inv && !TOTAL_LABEL.test(inv)) return false; // e.g. unregistered "Total Solutions" with a bill no
  const firstText = row.map(cellText).find((t) => t !== "") ?? "";
  const candidates = [
    firstText,
    cellText(get(row, columns.vendorName)),
    cellText(get(row, columns.invoiceNumber)),
    cellText(get(row, columns.voucherNumber)),
  ];
  return candidates.some((t) => t && TOTAL_LABEL.test(t));
}

/**
 * Convert the data rows below the detected header into InvoiceRecords.
 * Skips blank rows, repeated header rows (page breaks), total/subtotal rows,
 * cancelled vouchers and rows with neither a GSTIN nor an invoice/voucher number.
 * `decorate` may enrich a record from its source row, or return null to drop it.
 */
export function mapRegisterRows(
  rows: unknown[][],
  detection: ImportDetection,
  recordSource: "books" | "gstr2b",
  decorate?: (record: InvoiceRecord, row: unknown[]) => InvoiceRecord | null
): InvoiceRecord[] {
  const { columns, headerRowIndex, headers } = detection;
  const out: InvoiceRecord[] = [];
  const phoneCol = PHONE_HEADERS.map((h) => headers.indexOf(h)).find((i) => i >= 0) ?? -1;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    if (row.map(normalizeHeader).join("|") === headers.join("|")) continue;
    if (isTotalRow(row, columns)) continue;

    const vendorRaw = cellText(get(row, columns.vendorName));
    if (/^\(?\s*cancell?ed\s*\)?$/i.test(vendorRaw)) continue;

    const gstin = normalizeGstin(cellText(get(row, columns.gstin)));
    const rawInv = cellText(get(row, columns.invoiceNumber) ?? get(row, columns.voucherNumber));
    if (!gstin && !rawInv) continue;

    // UX-04: vendor phone column (not an ImportField, so header detection is unchanged)
    const phone = phoneCol >= 0 ? normalizeIndianMobile(row[phoneCol]) : null;

    const igst = round2(sum(row, columns.igst));
    const cgst = round2(sum(row, columns.cgst));
    const sgst = round2(sum(row, columns.sgst));
    let totalTax = round2(sum(row, columns.totalTax));
    if (!totalTax) totalTax = round2(igst + cgst + sgst);

    const record: InvoiceRecord = {
      gstin: gstin || "UNKNOWN",
      vendorName: vendorRaw || "Unknown Vendor",
      invoiceNumber: normalizeInvoiceNumber(rawInv) || "UNKNOWN",
      rawInvoiceNumber: rawInv,
      invoiceDate: parseImportDate(get(row, columns.invoiceDate) ?? get(row, columns.voucherDate)),
      taxableValue: round2(sum(row, columns.taxableValue)),
      igst,
      cgst,
      sgst,
      totalTax,
      source: recordSource,
      ...(phone ? { phone } : {}),
    };
    const final = decorate ? decorate(record, row) : record;
    if (final) out.push(final);
  }
  return out;
}

/** Display names of the columns every register/2B file needs. */
export const REQUIRED_COLUMN_LABELS = {
  gstin: "GSTIN",
  invoiceNumber: "Invoice number",
  invoiceDate: "Invoice date",
} as const;

/** Required columns (GSTIN, invoice number, invoice date) missing from a column map. */
export function missingRequiredColumns(columns: ColumnMap): string[] {
  const missing: string[] = [];
  if (!columns.gstin) missing.push(REQUIRED_COLUMN_LABELS.gstin);
  if (!columns.invoiceNumber && !columns.voucherNumber) missing.push(REQUIRED_COLUMN_LABELS.invoiceNumber);
  if (!columns.invoiceDate && !columns.voucherDate) missing.push(REQUIRED_COLUMN_LABELS.invoiceDate);
  return missing;
}

/**
 * Header labels as written in the file (for error messages). With a two-row
 * header, the sub-header wins over the group label for each column.
 */
export function headerLabels(rows: unknown[][], headerRowIndex: number, headerRowCount = 1): string[] {
  const bottom = rows[headerRowIndex] ?? [];
  const top = headerRowCount > 1 ? rows[headerRowIndex - 1] ?? [] : [];
  const width = Math.max(bottom.length, top.length);
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const label = cellText(bottom[i]) || cellText(top[i]);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** Best guess at the header row when detection failed: first row with a known header. */
export function guessHeaderRow(rows: unknown[][], maxScan = HEADER_SCAN_ROWS): number {
  const limit = Math.min(rows.length, maxScan);
  let firstNonBlank = -1;
  for (let i = 0; i < limit; i++) {
    if (isBlankRow(rows[i])) continue;
    if (firstNonBlank < 0) firstNonBlank = i;
    if (rows[i].some((c) => isKnownHeader(normalizeHeader(c)))) return i;
  }
  return firstNonBlank;
}

/** "file.xlsx: couldn't find columns: A, B. Found: x, y, z, …" (at most 6 found headers). */
export function missingColumnsMessage(fileName: string, missing: string[], found: string[]): string {
  const shown = found.slice(0, 6).join(", ") + (found.length > 6 ? ", …" : "");
  return `${fileName}: couldn't find columns: ${missing.join(", ")}. Found: ${found.length ? shown : "no header row"}`;
}

/** One-line UI note for a detected source, or null when nothing is worth saying. */
export function describeImportSource(source: ImportSource): string | null {
  if (source === "tally") return "Detected Tally export";
  if (source === "busy") return "Detected Busy export";
  if (source === "gstr2b_portal") return "Detected GSTR-2B (portal) export";
  if (source === "gstr2b_portal_json") return "Detected GSTR-2B (portal JSON)";
  return null;
}
