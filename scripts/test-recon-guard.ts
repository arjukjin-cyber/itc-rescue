import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMixedSampleRecon, isSampleRecon, validateReconResults } from "../src/lib/recon-guard";
import { parseInvoiceFile } from "../src/lib/parseFile";
import { reconcile } from "../src/lib/reconcile";
import type { MatchResult } from "../src/lib/types";

const r = (gstin: string, inv = "INV-1", date = "2026-04-02") =>
  ({ id: gstin + inv, category: "matched", gstin, invoiceNumber: inv, invoiceDate: date, vendorName: "V" }) as unknown as MatchResult;
const file = (p: string) => new File([readFileSync(join(__dirname, "..", p))], p.split("/").pop()!, { type: "text/csv" });

(async () => {
  // Sample files end to end: whole run is sample
  const sb = await parseInvoiceFile(file("public/samples/purchase-register.csv"), "books");
  const sg = await parseInvoiceFile(file("public/samples/gstr-2b.csv"), "gstr2b");
  const sample = reconcile(sb, sg).results;
  assert.equal(isSampleRecon(sample), true, "sample run detected");
  assert.equal(isMixedSampleRecon(sample), false);

  // Sample register + a real 2B: mixed
  const real2b = Array.from({ length: 5 }, (_, i) => r("32AAAAA0000A1Z1", `REAL-${i}`));
  assert.equal(isMixedSampleRecon([...sample.filter((x) => x.category !== "unclaimed"), ...real2b]), true);

  // A real file that shares one or two sample vendors/invoices is NOT sample or mixed
  const coincide = [r("07AAACP0505B1ZQ", "DPS-4491"), r("27AABCT1332L1ZV", "INV/24-25/001"), r("29AADCS1234A1Z5", "BST#0881")];
  assert.equal(isSampleRecon(coincide), false);
  assert.equal(isMixedSampleRecon(coincide), false);
  assert.equal(isSampleRecon([]), false);

  // Parse validation
  assert.equal(validateReconResults([]).ok, false);
  assert.equal(validateReconResults([r("UNKNOWN", "UNKNOWN")]).ok, false);
  assert.equal(validateReconResults([r("32AAAAA0000A1Z1", "INV-1", "")]).ok, false);
  const good = Array.from({ length: 4 }, (_, i) => r("32AAAAA0000A1Z1", `INV-${i}`));
  assert.equal(validateReconResults(good).ok, true);
  assert.equal(validateReconResults([...good, r("32AAAAA0000A1Z1", "UNKNOWN")]).ok, true);
  assert.equal(validateReconResults([r("32AAAAA0000A1Z1", "UNKNOWN"), r("32AAAAA0000A1Z1", "UNKNOWN"), good[0]]).ok, false);

  // Unregistered-dealer rows are dropped by reconcile(), not counted as bad rows
  const books = [
    { gstin: "27AABCT1332L1ZV", invoiceNumber: "INV1", rawInvoiceNumber: "INV1", invoiceDate: "2025-04-01", vendorName: "A", totalTax: 18000, taxableValue: 100000 },
    { gstin: "UNKNOWN", invoiceNumber: "5", rawInvoiceNumber: "5", invoiceDate: "2025-04-12", vendorName: "Local Hardware Store", totalTax: 1800, taxableValue: 10000 },
  ] as never[];
  const rec = reconcile(books, []);
  assert.equal(rec.summary.unregisteredSkipped, 1);
  assert.equal(rec.results.length, 1);
  assert.equal(rec.results.some((x) => x.vendorName === "Local Hardware Store"), false);
  assert.equal(validateReconResults(rec.results).ok, true);

  console.log("recon-guard: all tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
