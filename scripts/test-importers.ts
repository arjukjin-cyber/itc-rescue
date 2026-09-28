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
import { rowToInvoice } from "../src/lib/reconcile";
import {
  detectSourceFromHeaders,
  findHeaderRow,
  normalizeHeader,
  parseImportAmount,
  parseImportDate,
} from "../src/lib/importers/tally-busy";
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
        invoiceNumber: "BST#0881",
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
        invoiceNumber: "BST#0881",
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
        ["BST#0881", "BST#0881", "2025-04-02", 45000],
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

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
