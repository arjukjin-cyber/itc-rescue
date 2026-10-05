/**
 * UX-04 vendor phone checks (pure, no DB):
 *   npx tsx scripts/test-phone.ts      (or: npm run check:phone)
 *
 * fixtures/ux-audit-purchase-register.xlsx + fixtures/ux-audit-gstr-2b.csv are the
 * UX audit's synthetic test files (every vendor is "(FAKE)", phones 99999000xx).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { parseInvoiceFileDetailed } from "../src/lib/parseFile";
import { reconcile, rowToInvoice } from "../src/lib/reconcile";
import {
  PHONE_ALIASES,
  attachPhones,
  firstPhoneByGstin,
  formatIndianMobile,
  normalizeIndianMobile,
  waLink,
} from "../src/lib/phone";
import type { ChaseItem, InvoiceRecord, MatchResult } from "../src/lib/types";

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
    console.error(`  FAIL ${name}\n${e instanceof Error ? e.stack : String(e)}`);
  }
}

function fileFrom(rel: string, type: string): File {
  return new File([readFileSync(join(root, rel))], rel.split("/").pop()!, { type });
}

function chaseFrom(results: MatchResult[]): ChaseItem[] {
  // mirrors storage.saveRecon / db.saveReconForUser chase seeding
  return results
    .filter((r) => r.category === "itc_at_risk" || r.category === "value_mismatch")
    .map((r) => ({
      id: r.id,
      gstin: r.gstin,
      vendorName: r.vendorName,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      amount: r.booksTax || r.gstr2bTax,
      category: r.category,
      status: "pending" as const,
      lastUpdated: "2026-09-29T00:00:00.000Z",
      ...(r.phone ? { phone: r.phone } : {}),
    }));
}

(async () => {
  // ---------- normalisation ----------
  await test("normalises valid Indian mobiles to 91XXXXXXXXXX", () => {
    const ok: [unknown, string][] = [
      ["9999900001", "919999900001"],
      [9999900001, "919999900001"],
      ["+919876543210", "919876543210"],
      ["+91 98765 43210", "919876543210"],
      ["+91-98765-43210", "919876543210"],
      ["919876543210", "919876543210"],
      ["09876543210", "919876543210"],
      ["098765 43210", "919876543210"],
      ["(+91) 98765.43210", "919876543210"],
      ["  6000000000  ", "916000000000"],
      ["7012345678", "917012345678"],
      ["8123456789", "918123456789"],
      ["98765 43210 / 91234 56789", "919876543210"], // several numbers: first valid
      ["022-2345678, 9876543210", "919876543210"], // landline then mobile
    ];
    for (const [input, want] of ok) assert.equal(normalizeIndianMobile(input), want, String(input));
  });

  await test("invalid input → no phone (null)", () => {
    const bad: unknown[] = [
      "", "   ", null, undefined, {}, [], true,
      "5876543210", // starts with 5
      "0123456789",
      "12345",
      "98765432101", // 11 digits
      "987654321", // 9 digits
      "+929876543210", // other country code
      "+1 9876543210",
      "00919876543210",
      "022 23456789", // landline
      "98765abcde",
      "N/A",
      "9.8765E+09",
    ];
    for (const b of bad) assert.equal(normalizeIndianMobile(b), null, JSON.stringify(b));
  });

  await test("formatIndianMobile for display", () => {
    assert.equal(formatIndianMobile("919999900005"), "+91 99999 00005");
    assert.equal(formatIndianMobile("bad"), "");
    assert.equal(formatIndianMobile(undefined), "");
  });

  // ---------- wa.me links ----------
  await test("waLink: wa.me/91XXXXXXXXXX?text=… with a phone, wa.me/?text=… without", () => {
    const text = "Hi Echo Mock Electricals (FAKE),\n\nInvoice UXE-9001 · ₹21,600.00 & more?";
    const enc = encodeURIComponent(text);
    assert.equal(waLink(text, "919999900005"), `https://wa.me/919999900005?text=${enc}`);
    assert.equal(waLink(text, "+91 99999 00005"), `https://wa.me/919999900005?text=${enc}`);
    assert.equal(waLink(text), `https://wa.me/?text=${enc}`);
    assert.equal(waLink(text, undefined), `https://wa.me/?text=${enc}`);
    assert.equal(waLink(text, null), `https://wa.me/?text=${enc}`);
    assert.equal(waLink(text, ""), `https://wa.me/?text=${enc}`);
    // an invalid or hostile stored value can't change the URL
    assert.equal(waLink(text, "evil.example/x"), `https://wa.me/?text=${enc}`);
    assert.equal(waLink(text, "12345"), `https://wa.me/?text=${enc}`);
    assert.equal(waLink("", "919999900005"), "https://wa.me/919999900005?text=");
    const u = new URL(waLink(text, "919999900005"));
    assert.equal(u.host, "wa.me");
    assert.equal(u.pathname, "/919999900005");
    assert.equal(u.searchParams.get("text"), text);
  });

  // ---------- alias pickup ----------
  await test("rowToInvoice picks the phone from every alias (pick-style key normalising)", () => {
    const headers = [
      "Vendor Phone", "Phone", "Mobile", "Contact No", "Contact Number", "WhatsApp", "Mobile No", "Phone No",
      "vendor_phone", "  PHONE ", "contact_number",
    ];
    for (const h of headers) {
      const inv = rowToInvoice(
        { GSTIN: "33EEEEE5555E1ZF", "Vendor Name": "Echo (FAKE)", "Invoice Number": "UXE-9001", "Invoice Date": "20/08/2026", [h]: "99999 00005" },
        "books"
      );
      assert.equal(inv?.phone, "919999900005", h);
    }
    assert.deepEqual([...PHONE_ALIASES], [
      "vendor_phone", "phone", "mobile", "contact_no", "contact_number", "whatsapp", "mobile_no", "phone_no",
    ]);
  });

  await test("rowToInvoice: no phone column / invalid phone → no phone key", () => {
    const base = { GSTIN: "33EEEEE5555E1ZF", "Invoice Number": "X1", "Invoice Date": "2026-08-20" };
    const none = rowToInvoice(base, "books")!;
    assert.equal("phone" in none, false);
    const invalid = rowToInvoice({ ...base, "Vendor Phone": "022 2345 6789" }, "books")!;
    assert.equal("phone" in invalid, false);
    // invalid first alias, valid later alias → valid one wins
    const mixed = rowToInvoice({ ...base, "Vendor Phone": "N/A", Mobile: "+91 70123 45678" }, "books")!;
    assert.equal(mixed.phone, "917012345678");
  });

  // ---------- UX audit register (Vendor Phone column) end to end ----------
  const reg = await parseInvoiceFileDetailed(
    fileFrom("fixtures/ux-audit-purchase-register.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "books"
  );
  const twoB = await parseInvoiceFileDetailed(fileFrom("fixtures/ux-audit-gstr-2b.csv", "text/csv"), "gstr2b");
  const audit = reconcile(reg.invoices, twoB.invoices);

  await test("audit register: 'Vendor Phone' column parsed on every row", () => {
    assert.equal(reg.invoices.length, 7);
    assert.deepEqual(
      reg.invoices.map((i) => [i.gstin, i.phone]),
      [
        ["27AAAAA1111A1ZW", "919999900001"],
        ["27AAAAA1111A1ZW", "919999900001"],
        ["29BBBBB2222B1ZD", "919999900002"],
        ["07CCCCC3333C1Z4", "919999900003"],
        ["24DDDDD4444D1ZT", "919999900004"],
        ["33EEEEE5555E1ZF", "919999900005"],
        ["09FFFFF6666F1ZR", "919999900006"],
      ]
    );
  });

  await test("audit recon: phone rides on results and chase items; Open WhatsApp targets the vendor", () => {
    const { summary, results } = audit;
    assert.deepEqual(
      [summary.matched, summary.itcAtRisk, summary.valueMismatch, summary.unclaimed],
      [4, 2, 1, 1]
    );
    for (const r of results) assert.match(r.phone ?? "", /^91[6-9]\d{9}$/, r.id);
    const chase = chaseFrom(results);
    assert.deepEqual(
      chase.map((c) => [c.vendorName, c.category, c.phone]),
      [
        ["Charlie Sample Metals (FAKE)", "itc_at_risk", "919999900003"],
        ["Delta Placeholder Packaging (FAKE)", "value_mismatch", "919999900004"],
        ["Echo Mock Electricals (FAKE)", "itc_at_risk", "919999900005"],
      ]
    );
    // the audit's captured link was https://wa.me/?text=Hi%20Echo%20Mock… (no recipient)
    const echo = chase.find((c) => c.gstin === "33EEEEE5555E1ZF")!;
    assert.ok(waLink("Hi Echo Mock Electricals (FAKE),", echo.phone).startsWith("https://wa.me/919999900005?text=Hi%20Echo%20Mock"));
    // unclaimed 2B-only row still gets the vendor's register phone by GSTIN
    const unclaimed = results.find((r) => r.category === "unclaimed")!;
    assert.equal(unclaimed.phone, "919999900002");
    // phone survives the JSON round trip (recon_runs.results / localStorage)
    const back = JSON.parse(JSON.stringify(results)) as MatchResult[];
    assert.equal(back.find((r) => r.gstin === "33EEEEE5555E1ZF")!.phone, "919999900005");
  });

  // ---------- first valid phone per GSTIN ----------
  await test("multiple phones for one GSTIN → first valid one (register order) on every row", () => {
    const mk = (inv: string, phone: string | undefined, gstin = "33EEEEE5555E1ZF"): InvoiceRecord =>
      rowToInvoice(
        { GSTIN: gstin, "Vendor Name": "Echo (FAKE)", "Invoice Number": inv, "Invoice Date": "2026-08-20", "Total Tax": 100, ...(phone ? { "Vendor Phone": phone } : {}) },
        "books"
      )!;
    const books = [
      mk("A1", undefined),
      mk("A2", "12345"), // invalid
      mk("A3", "98888 00001"), // first valid
      mk("A4", "97777 00002"), // later, different
      mk("B1", "96666 00003", "27AAAAA1111A1ZW"),
      mk("U1", "95555 00004", "UNKNOWN"),
      mk("U2", "94444 00005", "UNKNOWN"),
    ];
    const { results } = reconcile(books, []);
    const byInv = Object.fromEntries(results.map((r) => [r.invoiceNumber, r.phone]));
    assert.equal(byInv.A1, "919888800001");
    assert.equal(byInv.A2, "919888800001");
    assert.equal(byInv.A3, "919888800001");
    assert.equal(byInv.A4, "919888800001");
    assert.equal(byInv.B1, "919666600003");
    // UNKNOWN GSTIN rows (unregistered dealers) are left out of the recon entirely
    assert.equal("U1" in byInv, false);
    assert.equal("U2" in byInv, false);
    const map = firstPhoneByGstin(books);
    assert.equal(map.get("33EEEEE5555E1ZF"), "919888800001");
    assert.equal(map.has("UNKNOWN"), false);
  });

  await test("attachPhones (chase list lookup by GSTIN, as in listChaseForUser)", () => {
    const items = [
      { id: "1", gstin: "33EEEEE5555E1ZF" },
      { id: "2", gstin: "33eeeee5555e1zf" },
      { id: "3", gstin: "07CCCCC3333C1Z4", phone: "919999900003" },
      { id: "4", gstin: "09FFFFF6666F1ZR" },
      { id: "5", gstin: "24DDDDD4444D1ZT", phone: "garbage" },
    ];
    const out = attachPhones(items, new Map([["33EEEEE5555E1ZF", "919999900005"]]));
    assert.deepEqual(out, [
      { id: "1", gstin: "33EEEEE5555E1ZF", phone: "919999900005" },
      { id: "2", gstin: "33eeeee5555e1zf", phone: "919999900005" },
      { id: "3", gstin: "07CCCCC3333C1Z4", phone: "919999900003" },
      { id: "4", gstin: "09FFFFF6666F1ZR" },
      { id: "5", gstin: "24DDDDD4444D1ZT" },
    ]);
    assert.equal("phone" in items[0], false, "input not mutated");
  });

  // ---------- Tally/Busy importer path ----------
  await test("Tally-style export with a 'Mobile No.' column carries the phone", async () => {
    const aoa = [
      ["UX Audit Test Co (FAKE)"],
      ["Purchase Register"],
      ["1-Aug-2026 to 31-Aug-2026"],
      [],
      ["Date", "Particulars", "Vch Type", "Vch No.", "GSTIN/UIN", "Mobile No.", "Supplier Invoice No.", "Supplier Invoice Date", "Taxable Value", "Integrated Tax Amount", "Central Tax Amount", "State Tax Amount", "Gross Total"],
      ["20-Aug-2026", "Echo Mock Electricals (FAKE)", "Purchase", "7", "33EEEEE5555E1ZF", "+91 99999-00005", "UXE-9001", "20-Aug-2026", 120000, 21600, 0, 0, 141600],
      ["22-Aug-2026", "Foxtrot Demo Logistics (FAKE)", "Purchase", "8", "09FFFFF6666F1ZR", "not known", "UXF 3001", "22-Aug-2026", 40000, 0, 3600, 3600, 47200],
      ["", "Grand Total", "", "", "", "", "", "", 160000, 21600, 3600, 3600, 188800],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Register");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parsed = await parseInvoiceFileDetailed(new File([buf], "tally.xlsx"), "books");
    assert.equal(parsed.detected, "tally");
    assert.deepEqual(parsed.invoices.map((i) => [i.gstin, i.phone]), [
      ["33EEEEE5555E1ZF", "919999900005"],
      ["09FFFFF6666F1ZR", undefined],
    ]);
  });

  // ---------- samples unchanged ----------
  await test("public/samples still reconcile to 8/3/1/1 and ₹86,400 (no phone column → no phones)", async () => {
    const b = await parseInvoiceFileDetailed(fileFrom("public/samples/purchase-register.csv", "text/csv"), "books");
    const g = await parseInvoiceFileDetailed(fileFrom("public/samples/gstr-2b.csv", "text/csv"), "gstr2b");
    const { summary, results } = reconcile(b.invoices, g.invoices);
    assert.deepEqual(
      [summary.matched, summary.itcAtRisk, summary.valueMismatch, summary.unclaimed, summary.itcAtRiskAmount],
      [8, 3, 1, 1, 86400]
    );
    assert.ok(results.every((r) => !("phone" in r)));
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
})();
