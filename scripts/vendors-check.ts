/**
 * Pure unit check for vendor logic (no DB). Run:
 *   npx tsx scripts/vendors-check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcile, rowToInvoice } from "../src/lib/reconcile";
import type { InvoiceRecord, MatchResult } from "../src/lib/types";
import {
  QA_FAIL_VENDORS_MESSAGE,
  isPreviewQa,
  shouldBypassTrial,
  shouldForceVendorsFail,
} from "../src/lib/qa-flags";
import {
  VendorValidationError,
  applyOffenseBump,
  runBestEffortOffenseBump,
  withBestEffortOffenseBump,
  buildVendorSummaries,
  isRepeatOffender,
  normalizeIndianMobile,
  normalizeVendorGstin,
  offenderGstinsForRun,
  type OffenseState,
} from "../src/lib/vendors";

let passed = 0;
const pending: { name: string; fn: () => void | Promise<void> }[] = [];
function test(name: string, fn: () => void | Promise<void>) {
  pending.push({ name, fn });
}

// ---------- phone normalisation ----------
test("valid Indian mobiles normalise to +91XXXXXXXXXX", () => {
  const cases: [string, string][] = [
    ["9876543210", "+919876543210"],
    ["+919876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["(+91) 98765-43210", "+919876543210"],
    ["6000000000", "+916000000000"],
    ["  7012345678 ", "+917012345678"],
  ];
  for (const [input, want] of cases) assert.equal(normalizeIndianMobile(input), want, input);
});

test("invalid mobiles are rejected with VendorValidationError (400)", () => {
  const bad: unknown[] = [
    "",
    "12345",
    "5876543210", // starts with 5
    "0123456789",
    "98765432101", // 11 digits
    "+929876543210", // wrong country code
    "+91 5876543210",
    "98765abcde",
    "+1 9876543210",
    null,
    undefined,
    {},
  ];
  for (const b of bad) {
    assert.throws(
      () => normalizeIndianMobile(b),
      (e: unknown) => e instanceof VendorValidationError && e.status === 400,
      String(b)
    );
  }
});

test("GSTIN normalisation/validation", () => {
  assert.equal(normalizeVendorGstin(" 27aabct1332l1zv "), "27AABCT1332L1ZV");
  assert.throws(() => normalizeVendorGstin("UNKNOWN"), VendorValidationError);
  assert.throws(() => normalizeVendorGstin("27AABCT1332L1Z"), VendorValidationError);
  assert.throws(() => normalizeVendorGstin("27AABCT1332L1ZV/../x"), VendorValidationError);
});

// ---------- idempotent offense bump (mirror of VENDOR_OFFENSE_BUMP_SQL) ----------
test("bump is idempotent per run id and counts distinct runs", () => {
  let s = new Map<string, OffenseState>();
  s = applyOffenseBump(s, "recon_A", ["G1", "G2", "G1"]); // dup in same run counts once
  assert.deepEqual(s.get("G1"), { offenderCount: 1, lastOffenseRunId: "recon_A" });
  assert.deepEqual(s.get("G2"), { offenderCount: 1, lastOffenseRunId: "recon_A" });

  const retry = applyOffenseBump(s, "recon_A", ["G1", "G2"]); // retry same run
  assert.deepEqual(retry, s, "retrying the same run must not change counts");

  s = applyOffenseBump(s, "recon_B", ["G1"]);
  assert.equal(s.get("G1")!.offenderCount, 2);
  assert.equal(s.get("G2")!.offenderCount, 1, "GSTIN absent from run B is untouched");
  assert.equal(isRepeatOffender(s.get("G1")!.offenderCount), true);
  assert.equal(isRepeatOffender(s.get("G2")!.offenderCount), false);

  s = applyOffenseBump(applyOffenseBump(s, "recon_B", ["G1"]), "recon_B", ["G1"]);
  assert.equal(s.get("G1")!.offenderCount, 2, "double retry of run B is still a no-op");

  const before = new Map(s);
  applyOffenseBump(s, "recon_C", ["G1"]);
  assert.deepEqual(s, before, "input map is not mutated");
});

// ---------- sample data: at-risk ₹86,400 consistency ----------
function loadCsv(file: string, source: "books" | "gstr2b"): InvoiceRecord[] {
  const text = readFileSync(join(__dirname, "..", "public", "samples", file), "utf8").trim();
  const [header, ...lines] = text.split(/\r?\n/);
  const cols = header.split(",");
  return lines
    .map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])))
    .map((row) => rowToInvoice(row, source))
    .filter((x): x is InvoiceRecord => Boolean(x));
}

const books = loadCsv("purchase-register.csv", "books");
const gstr2b = loadCsv("gstr-2b.csv", "gstr2b");
const { results, summary } = reconcile(books, gstr2b);

test("sample recon: vendor at-risk ₹ sums to summary.itcAtRiskAmount (₹86,400)", () => {
  assert.equal(summary.itcAtRiskAmount, 86400);
  const vendors = buildVendorSummaries({ latestResults: results, stored: [], chase: [] });
  const total = vendors.reduce((s, v) => s + v.atRiskAmount, 0);
  assert.equal(total, 86400);
  // mismatch reported separately, not folded into at-risk
  const gp = vendors.find((v) => v.gstin === "24AABCM9876C1ZX")!;
  assert.equal(gp.atRiskAmount, 0);
  assert.equal(gp.mismatchCount, 1);
  assert.equal(gp.mismatchAmount, 3500);
  // sorted by at-risk desc
  assert.equal(vendors[0].gstin, "29AADCS1234A1Z5"); // Bengaluru Steel ₹54,000
  assert.equal(vendors[0].atRiskAmount, 54000);
  for (let i = 1; i < vendors.length; i++) {
    assert.ok(vendors[i - 1].atRiskAmount >= vendors[i].atRiskAmount);
  }
});

test("sample recon: offender GSTINs = at-risk ∪ mismatch, distinct", () => {
  assert.deepEqual(offenderGstinsForRun(results), [
    "24AABCM9876C1ZX", // Gujarat Polymers (value_mismatch)
    "27AAECS4455P1ZA", // Mumbai Logistics (at risk)
    "29AADCS1234A1Z5", // Bengaluru Steel (1 matched + 1 at risk → counts once)
    "33AAACR5055K1Z2", // Chennai Auto (at risk)
  ]);
  const withUnknown: MatchResult[] = [
    ...results,
    { ...results[0], id: "r|UNKNOWN|X|", gstin: "UNKNOWN", category: "itc_at_risk" },
  ];
  assert.ok(!offenderGstinsForRun(withUnknown).includes("UNKNOWN"));
});

test("two runs over the sample → repeatOffender for re-offending GSTINs only", () => {
  let s = new Map<string, OffenseState>();
  const offenders = offenderGstinsForRun(results);
  s = applyOffenseBump(s, "recon_1", offenders);
  s = applyOffenseBump(s, "recon_1", offenders); // retried save
  // second month: only Bengaluru Steel still has at-risk rows
  s = applyOffenseBump(s, "recon_2", ["29AADCS1234A1Z5"]);

  const stored = Array.from(s.entries()).map(([gstin, st]) => ({
    gstin,
    name: gstin === "29AADCS1234A1Z5" ? "BST (override)" : null,
    phone: gstin === "29AADCS1234A1Z5" ? "+919876543210" : null,
    offenderCount: st.offenderCount,
    updatedAt: null,
  }));
  const vendors = buildVendorSummaries({
    latestResults: results,
    stored,
    chase: [
      { gstin: "29AADCS1234A1Z5", status: "pending" },
      { gstin: "29AADCS1234A1Z5", status: "fixed" },
      { gstin: "33AAACR5055K1Z2", status: "still_blocked" },
    ],
  });
  const bst = vendors.find((v) => v.gstin === "29AADCS1234A1Z5")!;
  assert.equal(bst.offenderCount, 2);
  assert.equal(bst.repeatOffender, true);
  assert.equal(bst.name, "BST (override)");
  assert.equal(bst.phone, "+919876543210");
  assert.equal(bst.openChaseCount, 1);
  const chennai = vendors.find((v) => v.gstin === "33AAACR5055K1Z2")!;
  assert.equal(chennai.offenderCount, 1);
  assert.equal(chennai.repeatOffender, false);
  assert.equal(chennai.name, "Chennai Auto Components"); // falls back to recon name
  assert.equal(chennai.openChaseCount, 1);
  const tp = vendors.find((v) => v.gstin === "27AABCT1332L1ZV")!; // matched-only vendor
  assert.equal(tp.offenderCount, 0);
  assert.equal(tp.inLatestRecon, true);
});

test("stored vendor not in latest recon is still listed (phone saved)", () => {
  const vendors = buildVendorSummaries({
    latestResults: results,
    stored: [{ gstin: "32AAACX1234A1Z9", name: null, phone: "+917012345678", offenderCount: 3, updatedAt: null }],
    chase: [],
  });
  const v = vendors.find((x) => x.gstin === "32AAACX1234A1Z9")!;
  assert.equal(v.inLatestRecon, false);
  assert.equal(v.atRiskAmount, 0);
  assert.equal(v.repeatOffender, true);
  assert.equal(v.name, "");
});

// ---------- guard: same run id vs new run id (explicit) ----------
test("re-saving the same run id does not change offender_count", () => {
  const s0 = new Map<string, OffenseState>([
    ["G1", { offenderCount: 1, lastOffenseRunId: "recon_1" }],
  ]);
  let s = s0;
  for (let i = 0; i < 5; i++) s = applyOffenseBump(s, "recon_1", ["G1"]);
  assert.deepEqual(s.get("G1"), { offenderCount: 1, lastOffenseRunId: "recon_1" });
});

test("a new run id bumps offender_count exactly once", () => {
  const s0 = new Map<string, OffenseState>([
    ["G1", { offenderCount: 1, lastOffenseRunId: "recon_1" }],
  ]);
  const s1 = applyOffenseBump(s0, "recon_2", ["G1", "G1"]);
  assert.deepEqual(s1.get("G1"), { offenderCount: 2, lastOffenseRunId: "recon_2" });
  const s2 = applyOffenseBump(s1, "recon_2", ["G1"]);
  assert.equal(s2.get("G1")!.offenderCount, 2);
});

// ---------- best-effort wrapper ----------
test("best-effort bump swallows a thrown error; recon result is returned unchanged", async () => {
  const saved = { reconId: "recon_abc", chase: [{ id: "r|G|1|2026-03-01" }] };
  const logs: string[] = [];
  const log = (...a: unknown[]) => logs.push(a.map(String).join(" "));

  // sync throw (the QA forced failure throws before any DB access)
  const r1 = await withBestEffortOffenseBump(saved, { userId: "usr_1", runId: "recon_abc" }, () => {
    throw new Error(QA_FAIL_VENDORS_MESSAGE);
  }, log);
  assert.equal(r1, saved, "same object back");
  assert.deepEqual(r1, { reconId: "recon_abc", chase: [{ id: "r|G|1|2026-03-01" }] });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /offender bump failed/);
  assert.match(logs[0], /user=usr_1/);
  assert.match(logs[0], /run=recon_abc/);
  assert.match(logs[0], /qa_fail_vendors: forced failure/);

  // async rejection (e.g. relation "vendors" does not exist)
  const r2 = await withBestEffortOffenseBump(saved, { userId: "usr_1", runId: "recon_abc" },
    async () => { throw new Error('relation "vendors" does not exist'); }, log);
  assert.equal(r2, saved);
  assert.match(logs[1], /relation "vendors" does not exist/);

  // even a throwing logger can't break the save
  const r3 = await withBestEffortOffenseBump(saved, { userId: "u", runId: "r" },
    () => { throw new Error("x"); }, () => { throw new Error("logger down"); });
  assert.equal(r3, saved);

  const out = await runBestEffortOffenseBump({ userId: "u", runId: "r" }, () => { throw "str"; }, () => {});
  assert.deepEqual(out, { ok: false, error: "str" });
  const ok = await runBestEffortOffenseBump({ userId: "u", runId: "r" }, async () => 4, log);
  assert.deepEqual(ok, { ok: true });
  assert.equal(logs.length, 2, "success does not log");
});

// ---------- PREVIEW-ONLY QA switches ----------
type Env = Record<string, string | undefined>;
const OFF_ENVS: [string, Env][] = [
  ["production + QA_HOOKS=1", { VERCEL_ENV: "production", QA_HOOKS: "1" }],
  ["production, no QA_HOOKS", { VERCEL_ENV: "production" }],
  ["VERCEL_ENV undefined + QA_HOOKS=1 (local dev)", { QA_HOOKS: "1" }],
  ["VERCEL_ENV undefined, no QA_HOOKS", {}],
  ["development + QA_HOOKS=1", { VERCEL_ENV: "development", QA_HOOKS: "1" }],
  ["preview without QA_HOOKS", { VERCEL_ENV: "preview" }],
  ["preview + QA_HOOKS=0", { VERCEL_ENV: "preview", QA_HOOKS: "0" }],
  ["preview + QA_HOOKS=true", { VERCEL_ENV: "preview", QA_HOOKS: "true" }],
  ["Preview (wrong case) + QA_HOOKS=1", { VERCEL_ENV: "Preview", QA_HOOKS: "1" }],
];
const ON_ENV: Env = { VERCEL_ENV: "preview", QA_HOOKS: "1" };

test("isPreviewQa: true only for VERCEL_ENV=preview AND QA_HOOKS=1", () => {
  for (const [label, env] of OFF_ENVS) assert.equal(isPreviewQa(env), false, label);
  assert.equal(isPreviewQa(ON_ENV), true);
});

test("isPreviewQa reads process.env by default", () => {
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, QA_HOOKS: process.env.QA_HOOKS };
  try {
    process.env.QA_HOOKS = "1";
    process.env.VERCEL_ENV = "production";
    assert.equal(isPreviewQa(), false);
    assert.equal(shouldBypassTrial("qa.tester@itcrescue.in"), false);
    assert.equal(shouldForceVendorsFail("1"), false);
    delete process.env.VERCEL_ENV;
    assert.equal(isPreviewQa(), false);
    process.env.VERCEL_ENV = "preview";
    delete process.env.QA_HOOKS;
    assert.equal(isPreviewQa(), false);
    process.env.QA_HOOKS = "1";
    assert.equal(isPreviewQa(), true);
    assert.equal(shouldBypassTrial("qa.tester@itcrescue.in"), true);
    assert.equal(shouldForceVendorsFail("1"), true);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("shouldBypassTrial (qa. trial gate): OFF outside preview+QA_HOOKS, even for qa. emails", () => {
  for (const [label, env] of OFF_ENVS) {
    assert.equal(shouldBypassTrial("qa.tester@itcrescue.in", env), false, label);
    assert.equal(shouldBypassTrial("QA.Tester@itcrescue.in", env), false, label);
  }
  assert.equal(shouldBypassTrial("qa.tester@itcrescue.in", ON_ENV), true);
  assert.equal(shouldBypassTrial("  QA.Tester@ItcRescue.in ", ON_ENV), true);
  for (const e of ["tester@itcrescue.in", "aqa.x@y.in", "qa@itcrescue.in", "qatester@x.in", "", null, undefined]) {
    assert.equal(shouldBypassTrial(e, ON_ENV), false, String(e));
  }
});

test("shouldForceVendorsFail (qa_fail_vendors cookie): OFF outside preview+QA_HOOKS", () => {
  for (const [label, env] of OFF_ENVS) {
    assert.equal(shouldForceVendorsFail("1", env), false, label);
  }
  assert.equal(shouldForceVendorsFail("1", ON_ENV), true);
  for (const v of ["0", "", "true", "yes", " 1", undefined, null]) {
    assert.equal(shouldForceVendorsFail(v, ON_ENV), false, String(v));
  }
});

(async () => {
  for (const t of pending) {
    await t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  }
  console.log(`\n${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
