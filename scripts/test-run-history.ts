/** Run history (pure): period/legacy labels, paging params, GSTIN scope + page.  npm run test:history */
import assert from "node:assert/strict";
import { companyGstinScope } from "../src/lib/gstin-scope";
import { historyPeriodLabel, isLegacyPeriod, pageRuns, parseHistoryPaging, toHistoryRow } from "../src/lib/run-history";

const KA = "29AAGCB7383J1Z4"; // primary
const MH = "27AAPFU0939F1ZV";
const items = [{ gstin: KA, isPrimary: true }, { gstin: MH, isPrimary: false }];
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };

ok("period label", () => {
  assert.equal(historyPeriodLabel("2026-08", "2026-10-01T00:00:00Z"), "Aug 2026");
  assert.equal(historyPeriodLabel("2026-09", "2026-10-01T00:00:00Z"), "Sep 2026");
});
ok("legacy falls back to created date in IST", () => {
  assert.equal(historyPeriodLabel("", "2026-09-30T20:00:00Z"), "1 Oct 2026"); // 01:30 IST next day
  assert.equal(historyPeriodLabel(null, "2026-03-05T06:00:00Z"), "5 Mar 2026");
  assert.equal(historyPeriodLabel("2026-13", "2026-03-05T06:00:00Z"), "5 Mar 2026");
  assert.equal(historyPeriodLabel("", "bad"), "—");
  assert.ok(isLegacyPeriod("") && !isLegacyPeriod("2026-08"));
});
ok("paging params", () => {
  assert.deepEqual(parseHistoryPaging(new URLSearchParams("")), { limit: 20, offset: 0 });
  assert.deepEqual(parseHistoryPaging(new URLSearchParams("limit=500&offset=40")), { limit: 50, offset: 40 });
  assert.deepEqual(parseHistoryPaging(new URLSearchParams("limit=-1&offset=x")), { limit: 20, offset: 0 });
});

const rows = [
  { id: "a", companyGstin: "", createdAt: "2026-07-01T00:00:00Z" },
  { id: "b", companyGstin: KA, createdAt: "2026-08-01T00:00:00Z" },
  { id: "c", companyGstin: MH, createdAt: "2026-09-01T00:00:00Z" },
  { id: "d", companyGstin: KA, createdAt: "2026-10-01T00:00:00Z" },
];
ok("primary scope includes legacy, newest first", () => {
  const p = pageRuns(rows, companyGstinScope(KA, items), 20, 0);
  assert.deepEqual(p.runs.map((r) => r.id), ["d", "b", "a"]);
  assert.equal(p.nextOffset, null);
});
ok("non-primary scope excludes legacy", () => {
  assert.deepEqual(pageRuns(rows, companyGstinScope(MH, items), 20, 0).runs.map((r) => r.id), ["c"]);
});
ok("unscoped = all", () => {
  assert.equal(pageRuns(rows, null, 20, 0).runs.length, 4);
});
ok("pagination", () => {
  const p1 = pageRuns(rows, null, 3, 0);
  assert.deepEqual(p1.runs.map((r) => r.id), ["d", "c", "b"]);
  assert.equal(p1.nextOffset, 3);
  const p2 = pageRuns(rows, null, 3, 3);
  assert.deepEqual(p2.runs.map((r) => r.id), ["a"]);
  assert.equal(p2.nextOffset, null);
});
ok("db row mapping", () => {
  const r = toHistoryRow({ id: "x", created_at: "2026-10-01T00:00:00Z", return_period: null, company_gstin: null, matched: "4", itc_at_risk_amount: "1200.5", mismatch_amount: null, unclaimed: 2 });
  assert.deepEqual(r, { id: "x", createdAt: "2026-10-01T00:00:00.000Z", returnPeriod: "", companyGstin: "", fileName: null, matched: 4, itcAtRiskAmount: 1200.5, mismatchAmount: 0, unclaimed: 2 });
});
console.log(`\n${n} run-history tests passed`);
