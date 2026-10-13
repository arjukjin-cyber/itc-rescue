/**
 * Per-GSTIN scoping (pure): which company_gstin values a ?gstin= covers (legacy '' rows only
 * under the PRIMARY), the client query helper, per-GSTIN offender counts, menu label.
 *   npm run test:scope
 */
import assert from "node:assert/strict";
import {
  companyGstinScope,
  gstinMenuLabel,
  inGstinScope,
  withGstinQuery,
} from "../src/lib/gstin-scope";
import { buildVendorSummaries, offenderPeriodCounts } from "../src/lib/vendors";
import { normalizeGstin } from "../src/lib/gstin";
import type { MatchResult } from "../src/lib/types";

const KA = "29AAGCB7383J1Z4"; // primary
const MH = "27AAPFU0939F1ZV";
const items = [
  { gstin: KA, isPrimary: true },
  { gstin: MH, isPrimary: false },
];
let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("ok -", name);
};

ok("no gstin = unscoped", () => {
  assert.equal(companyGstinScope(null, items), null);
  assert.equal(companyGstinScope("", items), null);
  assert.ok(inGstinScope(MH, null) && inGstinScope("", null));
});
ok("primary covers its own + legacy '' / NULL runs", () => {
  const s = companyGstinScope(KA, items);
  assert.deepEqual(s, [KA, ""]);
  assert.ok(inGstinScope(KA, s) && inGstinScope("", s) && inGstinScope(null, s));
  assert.ok(!inGstinScope(MH, s));
});
ok("non-primary sees only its own runs (CPO bug: KA run hidden under MH)", () => {
  const s = companyGstinScope(MH, items);
  assert.deepEqual(s, [MH]);
  assert.ok(!inGstinScope(KA, s) && !inGstinScope("", s) && !inGstinScope(null, s));
});
ok("query param normalised value round-trips; helper appends correctly", () => {
  assert.equal(normalizeGstin(" 27aapfu0939f1zv "), MH);
  assert.equal(withGstinQuery("/api/recon", MH), `/api/recon?gstin=${MH}`);
  assert.equal(withGstinQuery("/api/x?a=1", MH), `/api/x?a=1&gstin=${MH}`);
  assert.equal(withGstinQuery("/api/recon", null), "/api/recon");
});

const V = "33AAACV1234A1Z5";
const row = (category: MatchResult["category"]): MatchResult =>
  ({ id: "r" + Math.random(), gstin: V, vendorName: "Vendor", category, booksTax: 100, taxDiff: 0 }) as unknown as MatchResult;
const runs = [
  { companyGstin: KA, returnPeriod: "2026-06", results: [row("itc_at_risk")] },
  { companyGstin: KA, returnPeriod: "2026-07", results: [row("itc_at_risk")] },
  { companyGstin: MH, returnPeriod: "2026-07", results: [row("value_mismatch")] },
  { companyGstin: "", returnPeriod: "2026-05", results: [row("itc_at_risk")] },
];
const countsFor = (g: string) => {
  const s = companyGstinScope(g, items);
  return offenderPeriodCounts(runs.filter((r) => inGstinScope(r.companyGstin, s)));
};
ok("offender counts are per vendor within the active GSTIN", () => {
  assert.equal(countsFor(KA).get(V), 3); // 06, 07 + legacy 05 under primary
  assert.equal(countsFor(MH).get(V), 1);
  const ka = buildVendorSummaries({ latestResults: runs[1].results, stored: [], chase: [], byDistinctPeriod: true, periodCounts: countsFor(KA), scoped: true });
  const mh = buildVendorSummaries({ latestResults: runs[2].results, stored: [], chase: [], byDistinctPeriod: true, periodCounts: countsFor(MH), scoped: true });
  assert.equal(ka[0].offenderCount, 3);
  assert.equal(ka[0].repeatOffender, true);
  assert.equal(mh[0].offenderCount, 1);
  assert.equal(mh[0].repeatOffender, false);
});
ok("scoped vendor list drops stored vendors not seen under this GSTIN", () => {
  const stored = [{ gstin: "07AAACX9999X1Z1", name: null, phone: "+919800000000", offenderCount: 0, updatedAt: null }];
  const scoped = buildVendorSummaries({ latestResults: runs[2].results, stored, chase: [], byDistinctPeriod: true, periodCounts: new Map(), scoped: true });
  assert.deepEqual(scoped.map((v) => v.gstin), [V]);
  const all = buildVendorSummaries({ latestResults: runs[2].results, stored, chase: [], byDistinctPeriod: true, periodCounts: new Map() });
  assert.equal(all.length, 2);
});
ok("GSTIN menu shows the saved label, else the state name", () => {
  assert.equal(gstinMenuLabel("Karnataka branch", "Karnataka"), "Karnataka branch");
  assert.equal(gstinMenuLabel("  ", "Karnataka"), "Karnataka");
  assert.equal(gstinMenuLabel("", undefined), "");
});
console.log(`\n${n} passed`);
