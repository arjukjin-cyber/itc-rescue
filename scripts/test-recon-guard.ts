import assert from "node:assert/strict";
import { isSampleRecon, validateReconResults } from "../src/lib/recon-guard";
import type { MatchResult } from "../src/lib/types";

const r = (gstin: string, inv = "INV-1", date = "2026-04-02") =>
  ({ id: gstin + inv, category: "matched", gstin, invoiceNumber: inv, invoiceDate: date, vendorName: "V" }) as unknown as MatchResult;

assert.equal(isSampleRecon([r("27AABCT1332L1ZV"), r("36AABCT6677G1ZV")]), true);
assert.equal(isSampleRecon([r("27AABCT1332L1ZV"), r("32AAAAA0000A1Z1")]), false);
assert.equal(isSampleRecon([]), false);

assert.equal(validateReconResults([]).ok, false);
assert.equal(validateReconResults([r("UNKNOWN", "UNKNOWN")]).ok, false);
assert.equal(validateReconResults([r("32AAAAA0000A1Z1", "INV-1", "")]).ok, false);
const good = Array.from({ length: 10 }, (_, i) => r("32AAAAA0000A1Z1", `INV-${i}`));
assert.equal(validateReconResults(good).ok, true);
assert.equal(validateReconResults([...good, r("UNKNOWN", "INV-X")]).ok, true); // 1/11 ≈ 9%
assert.equal(validateReconResults([...good, r("UNKNOWN", "X"), r("32AAAAA0000A1Z1", "UNKNOWN")]).ok, false);
console.log("recon-guard: all tests passed");
