/**
 * Pure checks for the reconcile return-period picker (default month, label, mismatch rule),
 * plus fixture checks: sample data numbers unchanged, CPO dod27 files when present.
 *   npm run test:period
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInvoiceFileDetailed } from "../src/lib/parseFile";
import { reconcile } from "../src/lib/reconcile";
import {
  defaultReturnPeriod,
  formatReturnPeriod,
  isReturnPeriod,
  lastMonthIST,
  needsPeriodConfirm,
} from "../src/lib/return-period";
import { normalizeReturnPeriod } from "../src/lib/gstin";
import { getGstr3bDue } from "../src/lib/filing";
import { buildReconPostBody } from "../src/lib/return-period";
import { pickedGstinKey, resolveSelectedGstin } from "../src/lib/selected-gstin";

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(() => {
    n++;
    console.log("ok -", name);
  });

function file(abs: string, type = "") {
  return new File([readFileSync(abs)], abs.split("/").pop()!, { type });
}

async function run(books: string, gstr: string) {
  const b = await parseInvoiceFileDetailed(file(books), "books");
  const g = await parseInvoiceFileDetailed(file(gstr), "gstr2b");
  return { g, ...reconcile(b.invoices, g.invoices) };
}

(async () => {
  await ok("lastMonthIST uses IST calendar", () => {
    assert.equal(lastMonthIST(new Date("2026-10-13T12:00:00Z")), "2026-09");
    // 2026-10-31 19:00Z is already 1 Nov 00:30 IST
    assert.equal(lastMonthIST(new Date("2026-10-31T19:00:00Z")), "2026-10");
    assert.equal(lastMonthIST(new Date("2026-01-05T00:00:00Z")), "2025-12");
    assert.equal(lastMonthIST(new Date("2025-12-31T18:30:00Z")), "2025-12"); // 1 Jan 00:00 IST
  });
  await ok("default = detected, else last month", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    assert.equal(defaultReturnPeriod("2026-08", now), "2026-08");
    assert.equal(defaultReturnPeriod(null, now), "2026-09");
    assert.equal(defaultReturnPeriod("082026", now), "2026-09");
  });
  await ok("labels", () => {
    assert.equal(formatReturnPeriod("2026-07"), "July 2026");
    assert.equal(formatReturnPeriod("2026-08"), "August 2026");
    assert.equal(formatReturnPeriod(null), "");
  });
  await ok("mismatch rule", () => {
    assert.equal(needsPeriodConfirm("2026-08", "2026-08"), false);
    assert.equal(needsPeriodConfirm("2026-09", "2026-08"), true);
    assert.equal(needsPeriodConfirm("2026-09", null), false); // CSV: never warns
  });
  await ok("picker values pass the server validator unchanged", () => {
    for (const p of ["2026-01", "2026-12", lastMonthIST()]) {
      assert.ok(isReturnPeriod(p));
      assert.equal(normalizeReturnPeriod(p), p);
    }
  });

  await ok("switcher selection: pick if in list, else primary, else first, else null", () => {
    const A = { gstin: "27AAAAA1111A1Z5", isPrimary: true };
    const B = { gstin: "29BBBBB2222B1ZD", isPrimary: false };
    assert.equal(resolveSelectedGstin([A, B], "29BBBBB2222B1ZD"), B.gstin); // picked B → B, not primary
    assert.equal(resolveSelectedGstin([A, B], null), A.gstin);
    assert.equal(resolveSelectedGstin([A, B], "33ZZZZZ9999Z1Z1"), A.gstin); // stale / other user's pick
    assert.equal(resolveSelectedGstin([{ ...B }, { ...A, isPrimary: false }], null), B.gstin); // no primary → first
    assert.equal(resolveSelectedGstin([], "29BBBBB2222B1ZD"), null); // empty list → omit gstin
    assert.notEqual(pickedGstinKey("a@x.in"), pickedGstinKey("b@x.in"));
    assert.equal(pickedGstinKey("A@X.in"), pickedGstinKey("a@x.in"));
  });

  // CEO bar: the saved/displayed period is exactly the picked (confirmed) month.
  const julyRows = [
    { id: "1", category: "matched", gstin: "x", vendorName: "v", invoiceNumber: "1", invoiceDate: "2026-07-03",
      booksTax: 1, gstr2bTax: 1, taxDiff: 0, gstr2b: { invoiceDate: "2026-07-03" } },
  ] as unknown as Parameters<typeof getGstr3bDue>[0];
  const now = new Date("2026-10-13T12:00:00Z");
  await ok("JSON/xlsx detects 2026-07, user picks 2026-08 + confirms → sends, saves, shows Aug 2026", () => {
    const detected = "2026-07";
    const picked = "2026-08";
    assert.equal(needsPeriodConfirm(picked, detected), true);
    const body = buildReconPostBody([], {}, { returnPeriod: picked, gstin: "29AAACD1234F1Z5" });
    assert.equal(body.returnPeriod, "2026-08");
    assert.equal(body.gstin, "29AAACD1234F1Z5");
    const saved = normalizeReturnPeriod(body.returnPeriod); // server route: saved unchanged
    assert.equal(saved, "2026-08");
    const due = getGstr3bDue(julyRows, now, saved);
    assert.ok(due.kind !== "none" && due.period === "Aug 2026", JSON.stringify(due));
  });
  await ok("plain CSV, picker on 2026-09 → sends, saves, shows Sep 2026 (July invoice dates ignored)", () => {
    const body = buildReconPostBody([], {}, { returnPeriod: "2026-09", gstin: null });
    assert.equal(body.returnPeriod, "2026-09");
    assert.ok(!("gstin" in body));
    const saved = normalizeReturnPeriod(body.returnPeriod);
    assert.equal(saved, "2026-09");
    const due = getGstr3bDue(julyRows, now, saved);
    assert.ok(due.kind !== "none" && due.period === "Sep 2026", JSON.stringify(due));
  });
  await ok("older run with empty return_period falls back to invoice dates", () => {
    const due = getGstr3bDue(julyRows, now, "");
    assert.ok(due.kind !== "none" && due.period === "Jul 2026");
    const d2 = getGstr3bDue(julyRows, now);
    assert.ok(d2.kind !== "none" && d2.period === "Jul 2026");
  });

  const root = join(__dirname, "..");
  await ok("sample data: 8 / 3 (₹86,400) / 1 / 1, no detected month", async () => {
    const r = await run(join(root, "public/samples/purchase-register.csv"), join(root, "public/samples/gstr-2b.csv"));
    assert.equal(r.g.returnPeriod, null);
    assert.equal(r.summary.matched, 8);
    assert.equal(r.summary.itcAtRisk, 3);
    assert.equal(r.summary.itcAtRiskAmount, 86400);
    assert.equal(r.summary.valueMismatch, 1);
    assert.equal(r.summary.unclaimed, 1);
  });

  const d = "/workspace/dod27";
  if (existsSync(join(d, "gstr2b-portal.json"))) {
    for (const g of ["gstr2b.csv", "gstr2b-portal.json", "gstr2b-portal.xlsx"]) {
      await ok(`dod27 ${g}: 4 matched, ₹25,992 at risk, ₹3,600 mismatch, 0 unclaimed`, async () => {
        const r = await run(join(d, "purchase-register.csv"), join(d, g));
        assert.equal(r.g.returnPeriod, g.endsWith(".csv") ? null : "2026-07");
        if (r.g.returnPeriod) assert.equal(formatReturnPeriod(r.g.returnPeriod), "July 2026");
        assert.equal(r.summary.matched, 4);
        assert.equal(r.summary.itcAtRiskAmount, 25992);
        assert.equal(r.summary.valueMismatch, 1);
        const mm = r.results.find((x) => x.category === "value_mismatch")!;
        assert.equal(Math.abs(mm.taxDiff), 3600);
        assert.equal(r.summary.unclaimed, 0);
      });
    }
  } else console.log("skip - dod27 fixtures not on this machine");
  console.log(`\n${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
