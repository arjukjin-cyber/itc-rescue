import type {
  InvoiceRecord,
  MatchCategory,
  MatchResult,
  ReconSummary,
} from "./types";

/** Normalize invoice numbers: strip spaces, dashes, slashes; uppercase */
export function normalizeInvoiceNumber(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-\/\._]/g, "");
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
  };
}

function makeId(parts: string[]): string {
  return parts.join("|");
}

const TAX_TOLERANCE = 1; // ₹1 tolerance for rounding

/**
 * Match books vs GSTR-2B:
 * - Key: GSTIN + normalized invoice# + date (±1 day)
 * - Categories: matched, itc_at_risk (books only), unclaimed (2B only), value_mismatch
 */
export function reconcile(
  books: InvoiceRecord[],
  gstr2b: InvoiceRecord[]
): { results: MatchResult[]; summary: ReconSummary } {
  const used2b = new Set<number>();
  const results: MatchResult[] = [];

  for (const book of books) {
    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < gstr2b.length; i++) {
      if (used2b.has(i)) continue;
      const g = gstr2b[i];
      if (book.gstin !== g.gstin) continue;
      if (book.invoiceNumber !== g.invoiceNumber) continue;
      const dd = dayDiff(book.invoiceDate, g.invoiceDate);
      if (dd > 1) continue;
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
            ? `Tax differs by ₹${taxDiff.toFixed(2)}`
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

  const summary: ReconSummary = {
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
