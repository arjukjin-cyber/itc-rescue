import assert from "node:assert/strict";
import { getGstr3bDue } from "../src/lib/filing";
const r = (cat: string, d2b: string | null, dBooks = "2026-03-10", tax = 100) => ({ id: Math.random() + "", category: cat, gstin: "X", vendorName: "V", invoiceNumber: "1", invoiceDate: dBooks, booksTax: tax, gstr2bTax: tax, taxDiff: 0, books: { invoiceDate: dBooks }, gstr2b: d2b ? { invoiceDate: d2b } : undefined }) as any;
const now = new Date("2026-09-28T23:30:00Z"); // 29 Sep 05:00 IST
assert.deepEqual(getGstr3bDue([], now), { kind: "none" });
const past = getGstr3bDue([r("matched", "2026-03-12"), r("itc_at_risk", null, "2026-03-28")], now);
assert.equal(past.kind, "past"); assert.equal((past as any).dueLabel, "20 Apr 2026"); assert.equal((past as any).period, "Mar 2026");
const open = getGstr3bDue([r("matched", "2026-09-02"), r("itc_at_risk", null, "2026-09-05", 500)], now);
assert.equal(open.kind, "open"); assert.equal((open as any).daysLeft, 21); assert.equal((open as any).dueLabel, "20 Oct"); assert.equal((open as any).blocked, 500);
const today = getGstr3bDue([r("matched", "2026-08-02")], new Date("2026-09-20T10:00:00+05:30"));
assert.equal(today.kind, "open"); assert.equal((today as any).daysLeft, 0);
const dec = getGstr3bDue([r("matched", "2026-12-02")], now); assert.equal((dec as any).dueDate, "2027-01-20");
// IST boundary: 19 Sep 23:00 UTC = 20 Sep 04:30 IST → due 20 Sep is today
assert.equal((getGstr3bDue([r("matched", "2026-08-02")], new Date("2026-09-19T23:00:00Z")) as any).daysLeft, 0);
console.log("filing: ok");
