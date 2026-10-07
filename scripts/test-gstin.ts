/** GSTIN + return-period checks (pure, no DB): npm run check:gstin */
import assert from "node:assert/strict";
import { gstinChecksum, normalizeGstin, normalizeReturnPeriod, validateGstin } from "../src/lib/gstin";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failures.push(name); console.error(`  FAIL ${name}\n${e instanceof Error ? e.message : e}`); }
}

// Widely published GSTN example GSTIN with a correct check digit.
const KNOWN = "27AAPFU0939F1ZV";

test("checksum of published example", () => assert.equal(gstinChecksum(KNOWN.slice(0, 14)), "V"));
test("valid GSTIN passes + state code", () => {
  const r = validateGstin(KNOWN);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.gstin, KNOWN); assert.equal(r.stateCode, "27"); }
});
test("lowercase + spaces normalised", () => {
  assert.equal(normalizeGstin(" 27aapfu0939f1zv "), KNOWN);
  assert.ok(validateGstin("27aapfu 0939f1zv").ok);
});
test("wrong check digit rejected", () => {
  const r = validateGstin(KNOWN.slice(0, 14) + "A");
  assert.ok(!r.ok);
  if (!r.ok) assert.match(r.reason, /check digit/);
});
test("wrong length rejected", () => assert.ok(!validateGstin("27AAPFU0939F1Z").ok));
test("bad shape rejected (no Z)", () => assert.ok(!validateGstin("27AAPFU0939F1XV").ok));
test("state 00 rejected", () => {
  const body = "00AAPFU0939F1Z";
  assert.ok(!validateGstin(body + gstinChecksum(body)).ok);
});
test("empty rejected", () => assert.ok(!validateGstin("").ok));
test("every self-checksummed GSTIN validates", () => {
  for (const body of ["29AAACR4849R1Z", "07AAACI1681G1Z", "33AABCT1332L1Z"]) {
    assert.ok(validateGstin(body + gstinChecksum(body)).ok, body);
  }
});
test("return period YYYY-MM", () => assert.equal(normalizeReturnPeriod("2026-09"), "2026-09"));
test("return period portal MMYYYY", () => assert.equal(normalizeReturnPeriod("092026"), "2026-09"));
test("return period bad month", () => assert.equal(normalizeReturnPeriod("2026-13"), null));
test("return period junk", () => assert.equal(normalizeReturnPeriod("Sept"), null));
test("return period empty -> null", () => assert.equal(normalizeReturnPeriod(""), null));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
