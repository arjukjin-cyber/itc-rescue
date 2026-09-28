/**
 * Importer tests for Tally / Busy / template purchase registers.
 *
 *   npx tsx scripts/test-importers.ts      (or: npm run test:importers)
 *
 * Uses fixtures/*.csv plus an in-memory .xlsx (Excel serial + Date cells).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { parseInvoiceFileDetailed } from "../src/lib/parseFile";
import {
  DUPLICATE_BOOKS_NOTE,
  deriveGstRate,
  financialYear,
  mergeInvoiceRows,
  normalizeInvoiceNumber,
  reconcile,
  rowToInvoice,
} from "../src/lib/reconcile";
import {
  detectSourceFromHeaders,
  findHeaderRow,
  normalizeHeader,
  parseImportAmount,
  parseImportDate,
} from "../src/lib/importers/tally-busy";
import { flattenHeaderRows, pickGstr2bSheet } from "../src/lib/importers/gstr2b-portal";
import type { InvoiceRecord } from "../src/lib/types";

const root = join(__dirname, "..");
let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`  FAIL ${name}\n${e instanceof Error ? e.message : String(e)}`);
  }
}

function fixtureFile(rel: string, type: string): File {
  return new File([readFileSync(join(root, rel))], rel.split("/").pop()!, { type });
}

async function rejectsWith(p: Promise<unknown>, message: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.equal(e.message, message);
    return true;
  });
}

function csvFile(rel: string): File {
  const text = readFileSync(join(root, rel), "utf8");
  return new File([text], rel.split("/").pop()!, { type: "text/csv" });
}

type Row = Pick<
  InvoiceRecord,
  "gstin" | "vendorName" | "rawInvoiceNumber" | "invoiceNumber" | "invoiceDate" | "taxableValue" | "igst" | "cgst" | "sgst" | "totalTax"
>;

function slim(inv: InvoiceRecord[]): Row[] {
  return inv.map((i) => ({
    gstin: i.gstin,
    vendorName: i.vendorName,
    rawInvoiceNumber: i.rawInvoiceNumber,
    invoiceNumber: i.invoiceNumber,
    invoiceDate: i.invoiceDate,
    taxableValue: i.taxableValue,
    igst: i.igst,
    cgst: i.cgst,
    sgst: i.sgst,
    totalTax: i.totalTax,
  }));
}

/** The pre-importer parse path, reproduced verbatim for the CSV branch. */
function legacyParseCsv(text: string, source: "books" | "gstr2b"): InvoiceRecord[] {
  const wb = XLSX.read(text, { type: "string", raw: true, cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const out: InvoiceRecord[] = [];
  for (const row of rows) {
    const inv = rowToInvoice(row, source);
    if (inv) out.push(inv);
  }
  return out;
}

// ---------- GST portal GSTR-2B workbook mimic ----------
// Layout per GSTN's B2B sheet: title rows, a merged group header row
// ("Invoice details", "Tax Amount") and a sub-header row, data from row 7.
const PORTAL_TOP = [
  "GSTIN of supplier", "Trade/Legal name", "Invoice details", "", "", "",
  "Place of supply", "Supply Attract Reverse Charge", "Rate(%)", "Taxable Value (₹)",
  "Tax Amount", "", "", "", "GSTR-1/IFF/GSTR-5 Period", "GSTR-1/IFF/GSTR-5 Filing Date",
  "ITC Availability", "Reason", "Applicable % of Tax Rate", "Source", "IRN", "IRN Date",
];
const PORTAL_SUB = [
  "", "", "Invoice number", "Invoice type", "Invoice Date", "Invoice Value(₹)",
  "", "", "", "", "Integrated Tax(₹)", "Central Tax(₹)", "State/UT Tax(₹)", "Cess(₹)",
  "", "", "", "", "", "", "", "",
];

function portalB2BSheet(): XLSX.WorkSheet {
  const row = (
    gstin: string, name: string, inv: string, date: string | number, value: number,
    pos: string, rate: number, taxable: number, igst: number, cgst: number, sgst: number,
    itc: string, reason = ""
  ) => [gstin, name, inv, "Regular", date, value, pos, "N", rate, taxable, igst, cgst, sgst, 0,
    "Apr'25", "11-05-2025", itc, reason, "", "", "", ""];
  const aoa: unknown[][] = [
    ["Goods and Services Tax  - GSTR-2B"],
    [],
    ["Taxable inward supplies received from registered persons"],
    [],
    PORTAL_TOP,
    PORTAL_SUB,
    row("27AABCT1332L1ZV", "TechParts India Pvt Ltd", "INV/24-25/001", "01-04-2025", 118000, "Maharashtra", 18, 100000, 0, 9000, 9000, "Yes"),
    row("29AADCS1234A1Z5", "Bengaluru Steel Traders", "BST0881", 45749, 295000, "Karnataka", 18, 250000, 45000, 0, 0, "Yes"),
    row("07AAACP0505B1ZQ", "Delhi Pack Solutions", "DPS-4491", "08-04-2025", 70200, "Delhi", 18, 50000, 0, 4500, 4500, "Yes"),
    row("07AAACP0505B1ZQ", "Delhi Pack Solutions", "DPS-4491", "08-04-2025", 70200, "Delhi", 12, 10000, 0, 600, 600, "Yes"),
    row("24AABCM9876C1ZX", "Gujarat Polymers Co", "GP-2026-221", "12-04-2025", 206500, "Gujarat", 18, 175000, 31500, 0, 0, "No",
      "POS and supplier state are same but recipient state is different"),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const m = (r1: number, c1: number, r2: number, c2: number) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  ws["!merges"] = [
    m(0, 0, 0, 21), m(2, 0, 2, 21),
    m(4, 2, 4, 5), m(4, 10, 4, 13), // "Invoice details", "Tax Amount"
    ...[0, 1, 6, 7, 8, 9, 14, 15, 16, 17, 18, 19, 20, 21].map((c) => m(4, c, 5, c)),
  ];
  return ws;
}

function portalWorkbookFile(): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Goods and Services Tax  - GSTR-2B"],
    ["Field name", "Help text"],
    ["GSTIN of supplier", "GSTIN of the supplier"],
    ["Invoice number", "Invoice number"],
  ]), "Read me");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["FORM SUMMARY - ITC Available"],
    ["S.no.", "Heading", "GSTR-3B table", "Integrated Tax (₹)", "Central Tax (₹)", "State/UT Tax (₹)"],
    ["Part A", "ITC Available - Credit may be claimed in relevant headings in GSTR-3B", "", 45000, 14100, 14100],
  ]), "ITC Available");
  XLSX.utils.book_append_sheet(wb, portalB2BSheet(), "B2B");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Goods and Services Tax  - GSTR-2B"],
    ["Amendments to previously filed invoices by supplier"],
    ["Invoice number", "Invoice Date", "GSTIN of supplier"],
    ["OLD-1", "01-03-2025", "27AABCT1332L1ZV"],
  ]), "B2BA");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], "042025_27AAAAA0000A1Z5_GSTR2B_11052025.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const EXPECTED_PORTAL = [
  {
    gstin: "27AABCT1332L1ZV", vendorName: "TechParts India Pvt Ltd",
    rawInvoiceNumber: "INV/24-25/001", invoiceNumber: "INV2425001", invoiceDate: "2025-04-01",
    taxableValue: 100000, igst: 0, cgst: 9000, sgst: 9000, totalTax: 18000,
    itcAvailable: true, source: "gstr2b",
  },
  {
    gstin: "29AADCS1234A1Z5", vendorName: "Bengaluru Steel Traders",
    rawInvoiceNumber: "BST0881", invoiceNumber: "BST0881", invoiceDate: "2025-04-02", // Excel serial 45749
    taxableValue: 250000, igst: 45000, cgst: 0, sgst: 0, totalTax: 45000,
    itcAvailable: true, source: "gstr2b",
  },
  {
    gstin: "07AAACP0505B1ZQ", vendorName: "Delhi Pack Solutions",
    rawInvoiceNumber: "DPS-4491", invoiceNumber: "DPS4491", invoiceDate: "2025-04-08",
    taxableValue: 60000, igst: 0, cgst: 5100, sgst: 5100, totalTax: 10200, // 18% + 12% rows merged
    itcAvailable: true, source: "gstr2b",
  },
  {
    gstin: "24AABCM9876C1ZX", vendorName: "Gujarat Polymers Co",
    rawInvoiceNumber: "GP-2026-221", invoiceNumber: "GP2026221", invoiceDate: "2025-04-12",
    taxableValue: 175000, igst: 31500, cgst: 0, sgst: 0, totalTax: 31500,
    itcAvailable: false, source: "gstr2b", // ITC Availability = No is kept, flagged
  },
];

async function main() {
  console.log("Unit helpers");

  await test("normalizeHeader handles case, punctuation, spacing", () => {
    assert.equal(normalizeHeader("Party GSTIN/UIN"), "party gstin uin");
    assert.equal(normalizeHeader("  Supplier Invoice No. "), "supplier invoice no");
    assert.equal(normalizeHeader("Taxable  Amt"), "taxable amt");
    assert.equal(normalizeHeader("CGST %"), "cgst pct");
    assert.equal(normalizeHeader("Invoice #"), "invoice");
  });

  await test("parseImportDate normalises Tally/Busy date styles", () => {
    assert.equal(parseImportDate("1-Apr-2025"), "2025-04-01");
    assert.equal(parseImportDate("1-Apr-25"), "2025-04-01");
    assert.equal(parseImportDate("01 April 2025"), "2025-04-01");
    assert.equal(parseImportDate("Apr 1, 2025"), "2025-04-01");
    assert.equal(parseImportDate("01/04/2025"), "2025-04-01");
    assert.equal(parseImportDate("01-04-25"), "2025-04-01");
    assert.equal(parseImportDate("08.04.2025"), "2025-04-08");
    assert.equal(parseImportDate("2025-04-01"), "2025-04-01");
    assert.equal(parseImportDate(45748), "2025-04-01");
    assert.equal(parseImportDate("45748"), "2025-04-01");
    assert.equal(parseImportDate(new Date(Date.UTC(2025, 3, 1))), "2025-04-01");
    // local-midnight Date in IST (as SheetJS may produce) must not slip a day
    assert.equal(parseImportDate(new Date("2025-04-01T00:00:00+05:30")), "2025-04-01");
    assert.equal(parseImportDate(""), "");
  });

  await test("parseImportAmount strips commas, currency, Dr/Cr", () => {
    assert.equal(parseImportAmount("1,23,456.50"), 123456.5);
    assert.equal(parseImportAmount("45,000.00 Dr"), 45000);
    assert.equal(parseImportAmount("1,200 Cr"), 1200);
    assert.equal(parseImportAmount("1,200.00Cr."), 1200);
    assert.equal(parseImportAmount("₹ 18,000"), 18000);
    assert.equal(parseImportAmount("Rs. 500"), 500);
    assert.equal(parseImportAmount("(1,500.00)"), -1500);
    assert.equal(parseImportAmount("-250"), -250);
    assert.equal(parseImportAmount("-"), 0);
    assert.equal(parseImportAmount("Nil"), 0);
    assert.equal(parseImportAmount(""), 0);
    assert.equal(parseImportAmount(9000), 9000);
  });

  await test("findHeaderRow skips title rows and ignores rate columns", () => {
    const rows = [
      ["ACME Pvt Ltd"],
      ["Purchase Register"],
      ["1-Apr-2025 to 30-Apr-2025"],
      [],
      ["Party Name", "GSTIN", "Bill No.", "Bill Date", "CGST %", "CGST Amt"],
      ["X", "27AABCT1332L1ZV", "1", "01/04/2025", "9", "900"],
    ];
    assert.equal(findHeaderRow(rows), 4);
    assert.equal(findHeaderRow([["just a title"], ["another"]]), -1);
  });

  await test("detectSourceFromHeaders classifies header sets", () => {
    const n = (hs: string[]) => hs.map(normalizeHeader);
    assert.equal(
      detectSourceFromHeaders(n(["Date", "Particulars", "Vch No.", "Party GSTIN/UIN", "Gross Total"])),
      "tally"
    );
    assert.equal(
      detectSourceFromHeaders(n(["Party Name", "GSTIN", "Bill No.", "Bill Date", "Taxable Amt", "Net Amt"])),
      "busy"
    );
    assert.equal(
      detectSourceFromHeaders(n(["GSTIN", "Vendor Name", "Invoice Number", "Invoice Date", "Total Tax"])),
      "template"
    );
    assert.equal(
      detectSourceFromHeaders(n(["Supplier GSTIN", "Inv No", "Inv Date", "IGST", "Remarks"])),
      "generic"
    );
  });

  console.log("Fixtures");

  await test("Tally purchase register CSV", async () => {
    const res = await parseInvoiceFileDetailed(csvFile("fixtures/tally-purchase-register.csv"), "books");
    assert.equal(res.detected, "tally");
    assert.equal(res.headerRowIndex, 5);
    assert.deepEqual(slim(res.invoices), [
      {
        gstin: "27AABCT1332L1ZV",
        vendorName: "TechParts India Pvt Ltd",
        rawInvoiceNumber: "INV/24-25/001",
        invoiceNumber: "INV2425001",
        invoiceDate: "2025-04-01",
        taxableValue: 100000,
        igst: 0,
        cgst: 9000,
        sgst: 9000,
        totalTax: 18000,
      },
      {
        gstin: "29AADCS1234A1Z5",
        vendorName: "Bengaluru Steel Traders",
        rawInvoiceNumber: "BST#0881",
        invoiceNumber: "BST0881",
        invoiceDate: "2025-04-02", // Supplier Invoice Date wins over voucher Date
        taxableValue: 250000,
        igst: 45000,
        cgst: 0,
        sgst: 0,
        totalTax: 45000,
      },
      {
        gstin: "07AAACP0505B1ZQ",
        vendorName: "Delhi Pack Solutions",
        rawInvoiceNumber: "DPS-4491",
        invoiceNumber: "DPS4491",
        invoiceDate: "2025-04-08", // Excel serial 45755
        taxableValue: 50000,
        igst: 0,
        cgst: 4500,
        sgst: 4500,
        totalTax: 9000,
      },
      {
        gstin: "UNKNOWN", // unregistered dealer
        vendorName: "Local Hardware Store",
        rawInvoiceNumber: "5", // no supplier invoice no -> falls back to Vch No.
        invoiceNumber: "5",
        invoiceDate: "2025-04-12", // no supplier invoice date -> voucher Date
        taxableValue: 10000,
        igst: 0,
        cgst: 900,
        sgst: 900,
        totalTax: 1800,
      },
    ]);
    assert.ok(res.invoices.every((i) => i.source === "books"));
  });

  await test("Busy purchase register CSV (title rows, totals, commas, Dr/Cr)", async () => {
    const res = await parseInvoiceFileDetailed(csvFile("fixtures/busy-purchase-register.csv"), "books");
    assert.equal(res.detected, "busy");
    assert.equal(res.headerRowIndex, 4);
    assert.deepEqual(slim(res.invoices), [
      {
        gstin: "27AABCT1332L1ZV",
        vendorName: "TechParts India Pvt Ltd",
        rawInvoiceNumber: "INV/24-25/001",
        invoiceNumber: "INV2425001",
        invoiceDate: "2025-04-01",
        taxableValue: 100000,
        igst: 0,
        cgst: 9000,
        sgst: 9000,
        totalTax: 18000,
      },
      {
        gstin: "29AADCS1234A1Z5",
        vendorName: "Bengaluru Steel Traders",
        rawInvoiceNumber: "BST#0881",
        invoiceNumber: "BST0881",
        invoiceDate: "2025-04-01",
        taxableValue: 250000,
        igst: 45000,
        cgst: 0,
        sgst: 0,
        totalTax: 45000,
      },
      {
        gstin: "24AABCM9876C1ZX",
        vendorName: "Gujarat Polymers Co",
        rawInvoiceNumber: "GP-2026-221",
        invoiceNumber: "GP2026221",
        invoiceDate: "2025-04-08",
        taxableValue: 175000,
        igst: 31500,
        cgst: 0,
        sgst: 0,
        totalTax: 31500,
      },
    ]);
  });

  await test("ITC Rescue template fixture parses exactly as before", async () => {
    const rel = "fixtures/template-purchase-register.csv";
    const res = await parseInvoiceFileDetailed(csvFile(rel), "books");
    assert.equal(res.detected, "template");
    assert.equal(res.headerRowIndex, 0);
    assert.deepEqual(res.invoices, legacyParseCsv(readFileSync(join(root, rel), "utf8"), "books"));
    assert.deepEqual(
      res.invoices.map((i) => [i.rawInvoiceNumber, i.invoiceNumber, i.invoiceDate, i.totalTax]),
      [
        ["INV/24-25/001", "INV2425001", "2025-04-01", 18000],
        ["BST#0881", "BST0881", "2025-04-02", 45000],
        ["DPS-4491", "DPS4491", "2025-04-07", 9000],
      ]
    );
  });

  await test("public/samples (template) parse identically to the legacy parser", async () => {
    for (const [rel, src] of [
      ["public/samples/purchase-register.csv", "books"],
      ["public/samples/gstr-2b.csv", "gstr2b"],
    ] as const) {
      const res = await parseInvoiceFileDetailed(csvFile(rel), src);
      assert.equal(res.detected, "template", rel);
      assert.ok(res.invoices.length > 0, rel);
      assert.deepEqual(res.invoices, legacyParseCsv(readFileSync(join(root, rel), "utf8"), src), rel);
    }
  });

  await test("Tally .xlsx with Excel serial + Date cells and ledger-wise tax columns", async () => {
    const aoa: unknown[][] = [
      ["Sharma Trading Co Pvt Ltd"],
      ["Purchase Register"],
      ["1-Apr-2025 to 30-Apr-2025"],
      [
        "Date",
        "Particulars",
        "Vch No.",
        "Supplier Invoice No.",
        "Supplier Invoice Date",
        "GSTIN/UIN",
        "Purchase @ 18%",
        "Purchase @ 12%",
        "Input CGST @ 9%",
        "Input CGST @ 6%",
        "Input SGST @ 9%",
        "Input SGST @ 6%",
        "Gross Total",
      ],
      [45748, "TechParts India Pvt Ltd", 1, "INV/24-25/001", 45748, "27AABCT1332L1ZV", 100000, 10000, 9000, 600, 9000, 600, 129200],
      [45750, "Delhi Pack Solutions", 2, 4491, new Date(Date.UTC(2025, 3, 3)), "07AAACP0505B1ZQ", 50000, 0, 4500, 0, 4500, 0, 59000],
      [null, "Grand Total", null, null, null, null, 150000, 10000, 13500, 600, 13500, 600, 188200],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "Purchase Register");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([buf], "PurchaseRegister.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await parseInvoiceFileDetailed(file, "books");
    assert.equal(res.detected, "tally");
    assert.equal(res.headerRowIndex, 3);
    assert.deepEqual(
      res.invoices.map((i) => [i.gstin, i.rawInvoiceNumber, i.invoiceDate, i.taxableValue, i.cgst, i.sgst, i.igst, i.totalTax]),
      [
        ["27AABCT1332L1ZV", "INV/24-25/001", "2025-04-01", 110000, 9600, 9600, 0, 19200],
        ["07AAACP0505B1ZQ", "4491", "2025-04-03", 50000, 4500, 4500, 0, 9000],
      ]
    );
  });

  console.log("Reconcile");

  await test("normalizeInvoiceNumber strips # (and / - . _ spaces)", () => {
    assert.equal(normalizeInvoiceNumber("BST#0881"), "BST0881");
    assert.equal(normalizeInvoiceNumber("BST#0881"), normalizeInvoiceNumber("BST0881"));
    assert.equal(normalizeInvoiceNumber(" inv/24-25/001 "), "INV2425001");
    assert.equal(normalizeInvoiceNumber("A.B_C #1"), "ABC1");
  });

  await test("BST#0881 in books matches BST0881 in GSTR-2B (raw number kept for display)", () => {
    const base = {
      gstin: "29AADCS1234A1Z5",
      vendorName: "Bengaluru Steel Traders",
      invoiceDate: "2025-04-02",
      taxableValue: 250000,
      igst: 45000,
      cgst: 0,
      sgst: 0,
      totalTax: 45000,
    };
    const book: InvoiceRecord = {
      ...base,
      source: "books",
      rawInvoiceNumber: "BST#0881",
      invoiceNumber: normalizeInvoiceNumber("BST#0881"),
    };
    const g2b: InvoiceRecord = {
      ...base,
      source: "gstr2b",
      rawInvoiceNumber: "BST0881",
      invoiceNumber: normalizeInvoiceNumber("BST0881"),
    };
    const { results, summary } = reconcile([book], [g2b]);
    assert.equal(results.length, 1);
    assert.equal(results[0].category, "matched");
    assert.equal(results[0].invoiceNumber, "BST#0881");
    assert.equal(summary.matched, 1);
    assert.equal(summary.itcAtRisk, 0);
    assert.equal(summary.unclaimed, 0);
  });

  await test("public/samples reconcile to 8 matched / 3 at-risk (₹86,400) / 1 mismatch / 1 unclaimed", async () => {
    const books = await parseInvoiceFileDetailed(csvFile("public/samples/purchase-register.csv"), "books");
    const g2b = await parseInvoiceFileDetailed(csvFile("public/samples/gstr-2b.csv"), "gstr2b");
    const { summary } = reconcile(books.invoices, g2b.invoices);
    assert.equal(summary.matched, 8, "matched");
    assert.equal(summary.itcAtRisk, 3, "itc_at_risk");
    assert.equal(summary.itcAtRiskAmount, 86400, "itc_at_risk amount");
    assert.equal(summary.valueMismatch, 1, "value_mismatch");
    assert.equal(summary.unclaimed, 1, "unclaimed");
    console.log(
      `       samples: matched=${summary.matched} itc_at_risk=${summary.itcAtRisk} (₹${summary.itcAtRiskAmount.toLocaleString("en-IN")}) value_mismatch=${summary.valueMismatch} unclaimed=${summary.unclaimed}`
    );
  });

  console.log("GST portal GSTR-2B");

  await test("pickGstr2bSheet picks B2B and ignores Read me / summary sheets", () => {
    assert.equal(pickGstr2bSheet(["Read me", "ITC Available", "ITC not available", "B2B", "B2BA", "B2B-CDNR"]), "B2B");
    assert.equal(pickGstr2bSheet(["Read me", " b2b "]), " b2b ");
    assert.equal(pickGstr2bSheet(["Sheet1"]), null);
  });

  await test("flattenHeaderRows merges the two-row header (group + sub, falls back to sub)", () => {
    const flat = flattenHeaderRows(PORTAL_TOP, PORTAL_SUB);
    assert.deepEqual(flat.slice(0, 14), [
      "gstin of supplier",
      "trade legal name",
      "invoice number",
      "invoice type",
      "invoice date",
      "invoice value",
      "place of supply",
      "supply attract reverse charge",
      "rate pct",
      "taxable value",
      "integrated tax",
      "central tax",
      "state ut tax",
      "cess",
    ]);
    assert.equal(flat[16], "itc availability");
  });

  await test("portal GSTR-2B .xlsx: auto-picks B2B, 2-row header, serial date, merges rate rows, keeps ITC=No", async () => {
    const res = await parseInvoiceFileDetailed(portalWorkbookFile(), "gstr2b");
    assert.equal(res.detected, "gstr2b_portal");
    assert.equal(res.headerRowIndex, 5);
    assert.deepEqual(
      res.invoices.map((i) => ({ ...slim([i])[0], itcAvailable: i.itcAvailable, source: i.source })),
      EXPECTED_PORTAL
    );
  });

  await test("portal B2B sheet saved as CSV (all text, serial as string) parses the same", async () => {
    const csv = XLSX.utils.sheet_to_csv(portalB2BSheet());
    const res = await parseInvoiceFileDetailed(new File([csv], "b2b.csv", { type: "text/csv" }), "gstr2b");
    assert.equal(res.detected, "gstr2b_portal");
    assert.deepEqual(
      res.invoices.map((i) => ({ ...slim([i])[0], itcAvailable: i.itcAvailable, source: i.source })),
      EXPECTED_PORTAL
    );
  });

  await test("template books vs portal GSTR-2B reconcile (BST#0881 = BST0881)", async () => {
    const books = await parseInvoiceFileDetailed(csvFile("fixtures/template-purchase-register.csv"), "books");
    const g2b = await parseInvoiceFileDetailed(portalWorkbookFile(), "gstr2b");
    const { results, summary } = reconcile(books.invoices, g2b.invoices);
    assert.deepEqual(
      results.map((r) => [r.invoiceNumber, r.category]),
      [
        ["INV/24-25/001", "matched"],
        ["BST#0881", "matched"],
        ["DPS-4491", "value_mismatch"], // 2B has an extra 12% line (tax 10,200 vs 9,000)
        ["GP-2026-221", "unclaimed"],
      ]
    );
    assert.equal(summary.matched, 2);
    assert.equal(summary.itcAtRisk, 0);
  });

  console.log("Invoice merge (books + 2B)");

  const inv = (
    source: "books" | "gstr2b",
    raw: string,
    date: string,
    taxable: number,
    cgst: number,
    sgst: number,
    igst = 0
  ): InvoiceRecord => ({
    gstin: "07AAACP0505B1ZQ",
    vendorName: "Delhi Pack Solutions",
    rawInvoiceNumber: raw,
    invoiceNumber: normalizeInvoiceNumber(raw),
    invoiceDate: date,
    taxableValue: taxable,
    igst,
    cgst,
    sgst,
    totalTax: igst + cgst + sgst,
    source,
  });

  await test("deriveGstRate snaps tax/taxable to a standard GST rate", () => {
    assert.equal(deriveGstRate(50000, 9000), 18);
    assert.equal(deriveGstRate(10000, 1200), 12);
    assert.equal(deriveGstRate(1000, 49.9), 5);
    assert.equal(deriveGstRate(0, 0), 0);
  });

  await test("mergeInvoiceRows keys on GSTIN + normalised invoice no, keeps first raw no + date", () => {
    const { records, possibleDuplicates } = mergeInvoiceRows([
      inv("books", "DPS/4491", "2025-04-08", 50000, 4500, 4500),
      inv("books", "DPS-4491", "2025-04-09", 10000, 600, 600), // same key, other date
      inv("books", "DPS-4492", "2025-04-08", 1000, 90, 90),
    ]);
    assert.equal(records.length, 2);
    assert.deepEqual(
      [records[0].rawInvoiceNumber, records[0].invoiceDate, records[0].taxableValue, records[0].cgst, records[0].sgst, records[0].totalTax],
      ["DPS/4491", "2025-04-08", 60000, 5100, 5100, 10200]
    );
    assert.equal(possibleDuplicates.size, 0);
  });

  await test("(a) split rates: books 18%+12% rows vs 2B 18%+12% rows -> matched, summed, no duplicate note", () => {
    const books = [
      inv("books", "DPS-4491", "2025-04-08", 50000, 4500, 4500),
      inv("books", "DPS-4491", "2025-04-08", 10000, 600, 600),
    ];
    const g2b = [
      inv("gstr2b", "DPS/4491", "2025-04-08", 50000, 4500, 4500),
      inv("gstr2b", "DPS/4491", "2025-04-08", 10000, 600, 600),
    ];
    const { results, summary } = reconcile(books, g2b);
    assert.equal(results.length, 1);
    const r = results[0];
    assert.equal(r.category, "matched");
    assert.equal(r.invoiceNumber, "DPS-4491"); // first books row's raw number
    assert.equal(r.booksTax, 10200);
    assert.equal(r.gstr2bTax, 10200);
    assert.equal(r.books?.taxableValue, 60000);
    assert.equal(r.gstr2b?.taxableValue, 60000);
    assert.equal(r.notes ?? "", "");
    assert.deepEqual([summary.matched, summary.valueMismatch, summary.unclaimed, summary.itcAtRisk], [1, 0, 0, 0]);
  });

  await test("(b) duplicate: same invoice twice in books (same rate + amounts) vs once in 2B -> value_mismatch + note", () => {
    const books = [
      inv("books", "GP-2026-221", "2025-04-12", 175000, 0, 0, 31500),
      inv("books", "GP-2026-221", "2025-04-12", 175000, 0, 0, 31500),
    ];
    const g2b = [inv("gstr2b", "GP-2026-221", "2025-04-12", 175000, 0, 0, 31500)];
    const { results, summary } = reconcile(books, g2b);
    assert.equal(results.length, 1);
    const r = results[0];
    assert.equal(r.category, "value_mismatch");
    assert.equal(r.booksTax, 63000); // summed books tax
    assert.equal(r.gstr2bTax, 31500);
    assert.equal(r.taxDiff, 31500);
    assert.ok(r.notes?.includes(DUPLICATE_BOOKS_NOTE), r.notes);
    assert.equal(r.notes, `${DUPLICATE_BOOKS_NOTE} · Tax differs by ₹31,500.00`); // main (#29) formats with formatINRPrecise
    assert.deepEqual([summary.matched, summary.valueMismatch, summary.unclaimed], [0, 1, 0]);
  });

  await test("duplicate note also lands on an ITC-at-risk invoice (books only)", () => {
    const books = [
      inv("books", "X-1", "2025-04-12", 1000, 90, 90),
      inv("books", "X-1", "2025-04-12", 1000, 90, 90),
    ];
    const { results } = reconcile(books, []);
    assert.equal(results[0].category, "itc_at_risk");
    assert.equal(results[0].booksTax, 360);
    assert.ok(results[0].notes?.startsWith(DUPLICATE_BOOKS_NOTE));
  });

  console.log("Financial year in merge + match");

  await test("financialYear: Indian April–March, boundary dates", () => {
    assert.equal(financialYear("2025-03-31"), "2024-25");
    assert.equal(financialYear("2025-04-01"), "2025-26");
    assert.equal(financialYear("2026-03-31"), "2025-26");
    assert.equal(financialYear("2000-01-15"), "1999-00");
    assert.equal(financialYear("2099-12-31"), "2099-00");
    assert.equal(financialYear(""), null);
    assert.equal(financialYear("31/03/2025"), null); // unparsed text
    assert.equal(financialYear(undefined), null);
  });

  const fyInv = (source: "books" | "gstr2b", date: string, taxable: number, gstin = "27AABCT1332L1ZV") =>
    ({ ...inv(source, "INV/001", date, taxable, taxable * 0.09, taxable * 0.09), gstin });

  await test("same invoice no. + GSTIN in FY 24-25 and FY 25-26 stays two invoices on both sides", () => {
    const books = [fyInv("books", "2024-06-10", 10000), fyInv("books", "2025-06-10", 20000)];
    const g2b = [fyInv("gstr2b", "2025-06-10", 20000), fyInv("gstr2b", "2024-06-10", 10000)];
    assert.equal(mergeInvoiceRows(books).records.length, 2);
    assert.equal(mergeInvoiceRows(g2b).records.length, 2);
    const { results, summary } = reconcile(books, g2b);
    assert.deepEqual([summary.matched, summary.valueMismatch, summary.itcAtRisk, summary.unclaimed], [2, 0, 0, 0]);
    for (const r of results) {
      assert.equal(r.books?.invoiceDate, r.gstr2b?.invoiceDate); // each paired with its own FY
      assert.equal(r.booksTax, r.gstr2bTax);
    }
    assert.deepEqual(results.map((r) => r.booksTax), [1800, 3600]);
  });

  await test("FY boundary: 31-Mar-2025 and 01-Apr-2025 rows of one invoice no. are not merged", () => {
    const { records } = mergeInvoiceRows([fyInv("books", "2025-03-31", 10000), fyInv("books", "2025-04-01", 10000)]);
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((r) => financialYear(r.invoiceDate)), ["2024-25", "2025-26"]);
  });

  await test("missing date falls back to merging on GSTIN + invoice no. (no-FY bucket)", () => {
    const { records } = mergeInvoiceRows([
      fyInv("books", "", 10000),
      fyInv("books", "", 5000),
      fyInv("books", "2025-06-10", 1000), // dated row stays in its FY bucket
    ]);
    assert.equal(records.length, 2);
    assert.equal(records[0].invoiceDate, "");
    assert.equal(records[0].taxableValue, 15000);
    assert.equal(records[0].totalTax, 2700);
    assert.equal(records[1].taxableValue, 1000);
  });

  await test("match step never pairs a FY 24-25 book row with a FY 25-26 2B row", () => {
    // a year apart
    let out = reconcile([fyInv("books", "2024-06-10", 10000)], [fyInv("gstr2b", "2025-06-10", 10000)]);
    assert.deepEqual(out.results.map((r) => r.category), ["itc_at_risk", "unclaimed"]);
    // across the boundary, even though the dates are only 1 day apart
    out = reconcile([fyInv("books", "2025-03-31", 10000)], [fyInv("gstr2b", "2025-04-01", 10000)]);
    assert.deepEqual(out.results.map((r) => r.category), ["itc_at_risk", "unclaimed"]);
    // ±1 day inside one FY still matches
    out = reconcile([fyInv("books", "2025-04-01", 10000)], [fyInv("gstr2b", "2025-04-02", 10000)]);
    assert.deepEqual(out.results.map((r) => r.category), ["matched"]);
  });

  console.log("UX-01: portal GSTR-2B JSON + file-specific errors");

  const jsonFile = (obj: unknown, name = "gstr2b.json") =>
    new File([typeof obj === "string" ? obj : JSON.stringify(obj)], name, { type: "application/json" });

  await test("JSON data.docdata.b2b[].inv[] with nested items[] (summed) and itcavl", async () => {
    const res = await parseInvoiceFileDetailed(
      jsonFile({
        chksum: "x",
        data: {
          gstin: "27ZZZZZ9999Z1Z5",
          rtnprd: "042025",
          docdata: {
            b2b: [
              {
                ctin: "07AAACP0505B1ZQ",
                trdnm: "Delhi Pack Solutions",
                inv: [
                  {
                    inum: "DPS-4491", dt: "08-04-2025", val: 70200, itcavl: "Y",
                    items: [
                      { num: 1, rt: 18, txval: 50000, igst: 0, cgst: 4500, sgst: 4500, cess: 0 },
                      { num: 2, rt: 12, txval: 10000, igst: 0, cgst: 600, sgst: 600, cess: 0 },
                    ],
                  },
                  {
                    inum: "INV/24-25/001", dt: "31-03-2025", val: 11800, itcavl: "N",
                    items: [{ num: 1, rt: 18, txval: 10000, igst: 1800, cgst: 0, sgst: 0, cess: 0 }],
                  },
                ],
              },
            ],
          },
        },
      }),
      "gstr2b"
    );
    assert.equal(res.detected, "gstr2b_portal_json");
    assert.deepEqual(
      res.invoices.map((i) => [i.gstin, i.vendorName, i.rawInvoiceNumber, i.invoiceDate, i.taxableValue, i.igst, i.cgst, i.sgst, i.totalTax, i.itcAvailable]),
      [
        ["07AAACP0505B1ZQ", "Delhi Pack Solutions", "DPS-4491", "2025-04-08", 60000, 0, 5100, 5100, 10200, true],
        ["07AAACP0505B1ZQ", "Delhi Pack Solutions", "INV/24-25/001", "2025-03-31", 10000, 1800, 0, 0, 1800, false],
      ]
    );
  });

  await test("JSON with top-level docdata and flat amounts on inv", async () => {
    const res = await parseInvoiceFileDetailed(
      jsonFile({
        docdata: {
          b2b: [
            {
              ctin: "29aadcs1234a1z5",
              trdnm: "Bengaluru Steel Traders",
              inv: [{ inum: "BST#0881", dt: "02-04-2025", val: 295000, txval: 250000, igst: 45000, cgst: 0, sgst: 0, cess: 0 }],
            },
          ],
        },
      }),
      "gstr2b"
    );
    assert.equal(res.detected, "gstr2b_portal_json");
    assert.deepEqual(slim(res.invoices), [
      {
        gstin: "29AADCS1234A1Z5", vendorName: "Bengaluru Steel Traders", rawInvoiceNumber: "BST#0881",
        invoiceNumber: "BST0881", invoiceDate: "2025-04-02", taxableValue: 250000,
        igst: 45000, cgst: 0, sgst: 0, totalTax: 45000,
      },
    ]);
  });

  await test("JSON errors: invalid JSON and missing b2b section name the file", async () => {
    await rejectsWith(
      parseInvoiceFileDetailed(jsonFile("{not json"), "gstr2b"),
      "gstr2b.json: not valid JSON (download the GSTR-2B JSON again from the GST portal)"
    );
    await rejectsWith(
      parseInvoiceFileDetailed(jsonFile({ data: { docdata: { cdnr: [] } } }), "gstr2b"),
      "gstr2b.json: no B2B invoices found (expected docdata.b2b)"
    );
    await rejectsWith(
      parseInvoiceFileDetailed(jsonFile({ data: { docdata: { b2b: [] } } }, "aug-2b.json"), "gstr2b"),
      "aug-2b.json: no B2B invoices found (expected docdata.b2b)"
    );
  });

  await test("missing columns: message names the file, the missing columns and up to 6 found headers", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Goods and Services Tax  - GSTR-2B"],
      [],
      ["GSTIN of supplier", "Trade/Legal name", "Place of supply", "Taxable Value (₹)", "Integrated Tax(₹)", "Central Tax(₹)", "State/UT Tax(₹)", "Cess(₹)"],
      ["27AABCT1332L1ZV", "TechParts India Pvt Ltd", "Maharashtra", 100000, 0, 9000, 9000, 0],
    ]), "B2B");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    await rejectsWith(
      parseInvoiceFileDetailed(new File([buf], "gstr2b-aug.xlsx"), "gstr2b"),
      "gstr2b-aug.xlsx: couldn't find columns: Invoice number, Invoice date. Found: GSTIN of supplier, Trade/Legal name, Place of supply, Taxable Value (₹), Integrated Tax(₹), Central Tax(₹), …"
    );
    await rejectsWith(
      parseInvoiceFileDetailed(csvFile("fixtures/ux-audit-broken-2b-no-invoice-no-date.csv"), "gstr2b"),
      "ux-audit-broken-2b-no-invoice-no-date.csv: couldn't find columns: Invoice number, Invoice date. Found: GSTIN of supplier, Trade/Legal name, Taxable Value, IGST"
    );
    await rejectsWith(
      parseInvoiceFileDetailed(new File(["Invoice Number,Invoice Date,Taxable Value\nX-1,01/04/2025,100\n"], "reg.csv", { type: "text/csv" }), "books"),
      "reg.csv: couldn't find columns: GSTIN. Found: Invoice Number, Invoice Date, Taxable Value"
    );
  });

  const UX_2B = [
    ["27AAAAA1111A1ZW", "UXA-001", "2026-08-03", 100000, 18000],
    ["27AAAAA1111A1ZW", "UXA-002", "2026-08-11", 50000, 9000],
    ["29BBBBB2222B1ZD", "UXB-26-101", "2026-08-05", 200000, 36000],
    ["24DDDDD4444D1ZT", "UXD-55", "2026-08-14", 60000, 9000],
    ["09FFFFF6666F1ZR", "UXF-3001", "2026-08-22", 40000, 7200],
    ["29BBBBB2222B1ZD", "UXB/26/140", "2026-08-28", 30000, 5400],
  ];
  const ux = (list: InvoiceRecord[]) =>
    list
      .map((i) => [i.gstin, i.rawInvoiceNumber, i.invoiceDate, i.taxableValue, i.totalTax] as const)
      .sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  const sortedUx = [...UX_2B].sort((a, b) => String(a[2]).localeCompare(String(b[2])));

  await test("audit fixture ux-audit-gstr-2b-portal-style.xlsx -> 6 invoices (gstr2b_portal)", async () => {
    const res = await parseInvoiceFileDetailed(
      fixtureFile("fixtures/ux-audit-gstr-2b-portal-style.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      "gstr2b"
    );
    assert.equal(res.detected, "gstr2b_portal");
    assert.equal(res.headerRowIndex, 2);
    assert.equal(res.invoices.length, 6);
    assert.deepEqual(ux(res.invoices), sortedUx);
  });

  await test("audit fixture ux-audit-gstr-2b-portal.json -> 6 invoices (gstr2b_portal_json)", async () => {
    const res = await parseInvoiceFileDetailed(fixtureFile("fixtures/ux-audit-gstr-2b-portal.json", "application/json"), "gstr2b");
    assert.equal(res.detected, "gstr2b_portal_json");
    assert.equal(res.invoices.length, 6);
    assert.deepEqual(ux(res.invoices), sortedUx);
  });

  await test("audit purchase register vs audit 2B (xlsx and json) -> 4 matched / 2 at-risk / 1 mismatch / 1 unclaimed", async () => {
    const books = await parseInvoiceFileDetailed(
      fixtureFile("fixtures/ux-audit-purchase-register.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      "books"
    );
    assert.equal(books.invoices.length, 7);
    for (const g of [
      fixtureFile("fixtures/ux-audit-gstr-2b-portal-style.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      fixtureFile("fixtures/ux-audit-gstr-2b-portal.json", "application/json"),
    ]) {
      const g2b = await parseInvoiceFileDetailed(g, "gstr2b");
      const { summary } = reconcile(books.invoices, g2b.invoices);
      assert.deepEqual(
        [summary.matched, summary.itcAtRisk, summary.valueMismatch, summary.unclaimed, summary.itcAtRiskAmount],
        [4, 2, 1, 1, 36000],
        g.name
      );
    }
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
