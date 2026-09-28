import type {
  InvoiceRecord,
  MatchCategory,
  MatchResult,
  ReconSummary,
} from "./types";
import { PHONE_ALIASES, firstPhoneByGstin, normalizeIndianMobile } from "./phone";

/** Normalize invoice numbers: strip spaces, dashes, slashes, dots, underscores, #; uppercase */
export function normalizeInvoiceNumber(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-\/\._#]/g, "");
}

export function normalizeGstin(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Parse dates into YYYY-MM-DD.
 * Prefer ISO and DD/MM/YYYY (India). Excel serial numbers supported.
 */
export function parseDate(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number") {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + raw * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();

  // Already ISO-ish YYYY-MM-DD (possibly with time)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY (India default)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function dayDiff(a: string, b: string): number {
  if (!a || !b) return 999;
  const da = new Date(a + "T12:00:00Z").getTime();
  const db = new Date(b + "T12:00:00Z").getTime();
  return Math.abs(Math.round((da - db) / 86400000));
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    lower[k.toLowerCase().trim().replace(/\s+/g, "_")] = v;
  }
  for (const key of keys) {
    const k = key.toLowerCase().replace(/\s+/g, "_");
    if (lower[k] != null && lower[k] !== "") return lower[k];
  }
  return undefined;
}

export function rowToInvoice(
  row: Record<string, unknown>,
  source: "books" | "gstr2b"
): InvoiceRecord | null {
  const gstin = normalizeGstin(
    String(
      pick(row, ["gstin", "supplier_gstin", "vendor_gstin", "gstin_of_supplier"]) ?? ""
    )
  );
  const rawInv = String(
    pick(row, [
      "invoice_number",
      "invoice_no",
      "inv_no",
      "invoice#",
      "invoicenumber",
      "voucher_number",
      "bill_no",
    ]) ?? ""
  );
  if (!gstin && !rawInv) return null;

  const igst = num(pick(row, ["igst", "igst_amount", "integrated_tax"]));
  const cgst = num(pick(row, ["cgst", "cgst_amount", "central_tax"]));
  const sgst = num(pick(row, ["sgst", "sgst_amount", "state_tax"]));
  let totalTax = num(pick(row, ["total_tax", "tax_amount", "itc", "total_gst"]));
  if (!totalTax) totalTax = igst + cgst + sgst;

  const taxable = num(
    pick(row, ["taxable_value", "taxable", "taxable_amount", "net_amount", "amount"])
  );

  // UX-04: first valid vendor mobile among the phone aliases, "91XXXXXXXXXX"
  let phone: string | undefined;
  for (const key of PHONE_ALIASES) {
    const p = normalizeIndianMobile(pick(row, [key]));
    if (p) {
      phone = p;
      break;
    }
  }

  return {
    gstin: gstin || "UNKNOWN",
    vendorName: String(
      pick(row, [
        "vendor_name",
        "supplier_name",
        "party_name",
        "trade_name",
        "name",
        "vendor",
      ]) ?? "Unknown Vendor"
    ).trim(),
    invoiceNumber: normalizeInvoiceNumber(rawInv) || "UNKNOWN",
    rawInvoiceNumber: rawInv,
    invoiceDate: parseDate(
      pick(row, ["invoice_date", "inv_date", "date", "bill_date", "document_date"])
    ),
    taxableValue: taxable,
    igst,
    cgst,
    sgst,
    totalTax,
    source,
    ...(phone ? { phone } : {}),
  };
}

/** Standard GST rates (%) used to classify a row's effective rate. */
const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

/** Effective GST rate of a row (tax / taxable), snapped to the nearest standard rate. */
export function deriveGstRate(taxable: number, tax: number): number {
  if (!taxable) return 0;
  const pct = (Math.abs(tax) / Math.abs(taxable)) * 100;
  return GST_RATES.reduce((best, r) => (Math.abs(r - pct) < Math.abs(best - pct) ? r : best), 0);
}

export const DUPLICATE_BOOKS_NOTE = "Possible duplicate entry in books";

/**
 * Indian financial year (April–March) of a YYYY-MM-DD date, e.g.
 * 2025-03-31 -> "2024-25", 2025-04-01 -> "2025-26". Null if the date is missing
 * or not an ISO date.
 */
export function financialYear(isoDate: string | undefined | null): string | null {
  const m = String(isoDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const start = month >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Merge key: GSTIN + normalised invoice number + financial year.
 * GST only requires invoice numbers to be unique per FY (many suppliers restart
 * at INV/001 every April), so the same number in two FYs stays two invoices.
 * Rows with a missing/unparseable date fall into a "no FY" bucket keyed on
 * GSTIN + invoice number only. Rows without an invoice number are never merged;
 * unregistered suppliers (GSTIN "UNKNOWN") are additionally keyed on vendor name.
 */
export function invoiceMergeKey(inv: InvoiceRecord): string | null {
  const no = normalizeInvoiceNumber(inv.invoiceNumber);
  if (!no || no === "UNKNOWN") return null;
  const party =
    inv.gstin && inv.gstin !== "UNKNOWN"
      ? inv.gstin
      : `UNKNOWN:${String(inv.vendorName || "").trim().toUpperCase()}`;
  return `${party}|${no}|${financialYear(inv.invoiceDate) ?? "no-fy"}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Merge rows that belong to one invoice (e.g. one row per tax rate) into a single
 * record: taxable value, IGST, CGST, SGST and total tax are summed; the FIRST row's
 * raw invoice number, date and vendor are kept for display, plus the first valid
 * vendor phone among the rows.
 *
 * `possibleDuplicates` holds merged records where 2+ source rows had the same
 * effective rate AND identical taxable/tax amounts (they are still summed).
 */
export function mergeInvoiceRows(rows: InvoiceRecord[]): {
  records: InvoiceRecord[];
  possibleDuplicates: Set<InvoiceRecord>;
} {
  const records: InvoiceRecord[] = [];
  const byKey = new Map<string, { merged: InvoiceRecord; seen: Set<string>; dup: boolean }>();

  for (const row of rows) {
    const key = invoiceMergeKey(row);
    if (!key) {
      records.push({ ...row });
      continue;
    }
    const rate = deriveGstRate(row.taxableValue, row.totalTax);
    const sig = [rate, row.taxableValue, row.igst, row.cgst, row.sgst, row.totalTax].join("|");
    const group = byKey.get(key);
    if (!group) {
      const merged = { ...row };
      byKey.set(key, { merged, seen: new Set([sig]), dup: false });
      records.push(merged);
      continue;
    }
    const m = group.merged;
    if (group.seen.has(sig)) group.dup = true;
    group.seen.add(sig);
    m.taxableValue = round2(m.taxableValue + row.taxableValue);
    m.igst = round2(m.igst + row.igst);
    m.cgst = round2(m.cgst + row.cgst);
    m.sgst = round2(m.sgst + row.sgst);
    m.totalTax = round2(m.totalTax + row.totalTax);
    if (m.itcAvailable !== undefined || row.itcAvailable !== undefined) {
      m.itcAvailable = (m.itcAvailable ?? true) && (row.itcAvailable ?? true);
    }
    // UX-04: keep the first valid vendor phone among the merged rows
    if (!normalizeIndianMobile(m.phone)) {
      const p = normalizeIndianMobile(row.phone);
      if (p) m.phone = p;
    }
  }

  const possibleDuplicates = new Set<InvoiceRecord>();
  for (const g of byKey.values()) if (g.dup) possibleDuplicates.add(g.merged);
  return { records, possibleDuplicates };
}

/** Prepend so the note stays visible in the truncated Notes cell on /reconcile. */
function withNote(existing: string | undefined, note: string): string {
  return existing ? `${note} · ${existing}` : note;
}

function makeId(parts: string[]): string {
  return parts.join("|");
}

const TAX_TOLERANCE = 1; // ₹1 tolerance for rounding

/**
 * Match books vs GSTR-2B:
 * - First, rows of the same invoice (GSTIN + normalised invoice# + FY) are merged on
 *   each side (see mergeInvoiceRows); identical repeated books rows get a
 *   "Possible duplicate entry in books" note.
 * - Key: GSTIN + normalized invoice# + date (±1 day) + same financial year
 *   (FY only checked when both dates parse).
 * - Categories: matched, itc_at_risk (books only), unclaimed (2B only), value_mismatch
 */
export function reconcile(
  allBooks: InvoiceRecord[],
  gstr2bRows: InvoiceRecord[]
): { results: MatchResult[]; summary: ReconSummary } {
  // Purchases from unregistered dealers have no GSTIN and carry no ITC, so they
  // can't be matched against GSTR-2B. Leave them out and report the count.
  const isUnregistered = (b: InvoiceRecord) => !b.gstin || b.gstin === "UNKNOWN";
  const booksRows = allBooks.filter((b) => !isUnregistered(b));
  const unregisteredSkipped = allBooks.length - booksRows.length;
  // Then merge the rows of each invoice (GSTIN + invoice no + FY) on both sides.
  const { records: books, possibleDuplicates } = mergeInvoiceRows(booksRows);
  const { records: gstr2b } = mergeInvoiceRows(gstr2bRows);
  const used2b = new Set<number>();
  const results: MatchResult[] = [];

  for (const book of books) {
    const bookFy = financialYear(book.invoiceDate);
    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < gstr2b.length; i++) {
      if (used2b.has(i)) continue;
      const g = gstr2b[i];
      if (book.gstin !== g.gstin) continue;
      if (book.invoiceNumber !== g.invoiceNumber) continue;
      const dd = dayDiff(book.invoiceDate, g.invoiceDate);
      if (dd > 1) continue;
      // Same invoice no. in another financial year is a different invoice, even
      // across the 31-Mar / 01-Apr boundary. Only applied when both FYs are known.
      const gFy = financialYear(g.invoiceDate);
      if (bookFy && gFy && bookFy !== gFy) continue;
      if (dd < bestScore) {
        bestScore = dd;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      used2b.add(bestIdx);
      const g = gstr2b[bestIdx];
      const taxDiff = Math.abs(book.totalTax - g.totalTax);
      const category: MatchCategory =
        taxDiff > TAX_TOLERANCE ? "value_mismatch" : "matched";
      results.push({
        id: makeId(["m", book.gstin, book.invoiceNumber, book.invoiceDate]),
        category,
        books: book,
        gstr2b: g,
        gstin: book.gstin,
        vendorName: book.vendorName || g.vendorName,
        invoiceNumber: book.rawInvoiceNumber || book.invoiceNumber,
        invoiceDate: book.invoiceDate || g.invoiceDate,
        booksTax: book.totalTax,
        gstr2bTax: g.totalTax,
        taxDiff,
        notes:
          category === "value_mismatch"
            ? `Tax differs by ${formatINRPrecise(taxDiff)}`
            : undefined,
      });
    } else {
      results.push({
        id: makeId(["r", book.gstin, book.invoiceNumber, book.invoiceDate]),
        category: "itc_at_risk",
        books: book,
        gstin: book.gstin,
        vendorName: book.vendorName,
        invoiceNumber: book.rawInvoiceNumber || book.invoiceNumber,
        invoiceDate: book.invoiceDate,
        booksTax: book.totalTax,
        gstr2bTax: 0,
        taxDiff: book.totalTax,
        notes: "In books but missing from GSTR-2B — ITC claim may be blocked",
      });
    }
  }

  for (const r of results) {
    if (r.books && possibleDuplicates.has(r.books)) {
      r.notes = withNote(r.notes, DUPLICATE_BOOKS_NOTE);
    }
  }

  for (let i = 0; i < gstr2b.length; i++) {
    if (used2b.has(i)) continue;
    const g = gstr2b[i];
    results.push({
      id: makeId(["u", g.gstin, g.invoiceNumber, g.invoiceDate]),
      category: "unclaimed",
      gstr2b: g,
      gstin: g.gstin,
      vendorName: g.vendorName,
      invoiceNumber: g.rawInvoiceNumber || g.invoiceNumber,
      invoiceDate: g.invoiceDate,
      booksTax: 0,
      gstr2bTax: g.totalTax,
      taxDiff: g.totalTax,
      notes: "In GSTR-2B but not in books — possible missed ITC",
    });
  }

  // UX-04: carry the vendor phone onto every result for that GSTIN (first valid
  // phone across register rows), so at-risk rows get it even if only another
  // invoice of the same vendor had the number.
  // Built from the raw register rows (before the per-invoice merge), in file order.
  const phoneByGstin = firstPhoneByGstin(booksRows);
  for (const r of results) {
    const phone = phoneByGstin.get(r.gstin) ?? normalizeIndianMobile(r.books?.phone);
    if (phone) r.phone = phone;
  }

  const summary: ReconSummary = {
    ...(unregisteredSkipped ? { unregisteredSkipped } : {}),
    totalBooks: books.length,
    totalGstr2b: gstr2b.length,
    matched: results.filter((r) => r.category === "matched").length,
    itcAtRisk: results.filter((r) => r.category === "itc_at_risk").length,
    unclaimed: results.filter((r) => r.category === "unclaimed").length,
    valueMismatch: results.filter((r) => r.category === "value_mismatch").length,
    itcAtRiskAmount: results
      .filter((r) => r.category === "itc_at_risk")
      .reduce((s, r) => s + r.booksTax, 0),
    matchedAmount: results
      .filter((r) => r.category === "matched")
      .reduce((s, r) => s + r.booksTax, 0),
  };

  return { results, summary };
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatINRPrecise(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
