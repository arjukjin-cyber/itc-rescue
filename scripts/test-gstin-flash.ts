/**
 * No cross-GSTIN flash: cache/request scope key + stale-response guard (pure).
 *   npm run test:flash
 */
import assert from "node:assert/strict";
import { createRequestGuard, dataScopeKey, isCurrentScope } from "../src/lib/client-scope";
import { clearSampleRun, getSampleRun, setSampleRun, setSampleRunScope } from "../src/lib/sample-run";
import { pickedGstinKey, resolveSelectedGstin } from "../src/lib/selected-gstin";

const KA = "29AAGCB7383J1Z4";
const MH = "27AAPFU0939F1ZV";
let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("ok -", name);
};

ok("scope key = lowercased email + GSTIN", () => {
  assert.equal(dataScopeKey("A@B.com", true, MH), `a@b.com|${MH}`);
  assert.equal(dataScopeKey(" a@b.COM ", true, MH.toLowerCase()), `a@b.com|${MH}`);
  assert.notEqual(dataScopeKey("a@b.com", true, MH), dataScopeKey("a@b.com", true, KA));
  assert.notEqual(dataScopeKey("a@b.com", true, MH), dataScopeKey("c@d.com", true, MH));
});
ok("no scope until user and GSTIN list are resolved", () => {
  assert.equal(dataScopeKey(null, true, MH), null);
  assert.equal(dataScopeKey("", true, MH), null);
  assert.equal(dataScopeKey("a@b.com", false, null), null);
  assert.equal(dataScopeKey("a@b.com", false, KA), null);
  assert.equal(dataScopeKey("a@b.com", true, null), "a@b.com|"); // ready, empty list
});
ok("isCurrentScope", () => {
  assert.equal(isCurrentScope("x|1", "x|1"), true);
  assert.equal(isCurrentScope("x|1", "x|2"), false);
  assert.equal(isCurrentScope(null, null), false);
  assert.equal(isCurrentScope("x|1", null), false);
});
ok("guard: response for old GSTIN dropped after switch (login 29 -> 27 race)", () => {
  let cur: string | null = dataScopeKey("a@b.com", true, KA);
  const g = createRequestGuard(() => cur);
  const r29 = g.begin(cur);
  cur = dataScopeKey("a@b.com", true, MH);
  g.invalidate();
  const r27 = g.begin(cur);
  assert.equal(g.accept(r29), false);
  assert.equal(g.accept(r27), true);
});
ok("guard: only latest request accepted, even same scope", () => {
  const cur = "a@b.com|" + MH;
  const g = createRequestGuard(() => cur);
  const a = g.begin(cur);
  const b = g.begin(cur);
  assert.equal(g.accept(a), false);
  assert.equal(g.accept(b), true);
});
ok("guard: unresolved scope never accepted; logout drops in-flight", () => {
  let cur: string | null = null;
  const g = createRequestGuard(() => cur);
  assert.equal(g.accept(g.begin(null)), false);
  cur = "a@b.com|" + MH;
  const r = g.begin(cur);
  cur = null;
  assert.equal(g.accept(r), false);
});
ok("sample-run cache keyed by scope", () => {
  const run = { results: [], summary: {} as never, files: ["a", "b"] as [string, string] };
  setSampleRunScope("a@b.com|" + KA);
  setSampleRun(run);
  assert.equal(getSampleRun(), run);
  setSampleRunScope("a@b.com|" + MH);
  assert.equal(getSampleRun(), null);
  setSampleRunScope("a@b.com|" + KA);
  assert.equal(getSampleRun(), null); // dropped, not resurrected
  setSampleRunScope(null);
  setSampleRun(run);
  assert.equal(getSampleRun(), null);
  clearSampleRun();
});
ok("picked GSTIN key per lowercased email; stale pick falls back", () => {
  assert.equal(pickedGstinKey("A@B.com"), "itc-rescue:gstin:a@b.com");
  const items = [{ gstin: KA, isPrimary: true }];
  assert.equal(resolveSelectedGstin(items, MH), KA);
});
console.log(`\n${n} passed`);
