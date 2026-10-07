/**
 * Pure unit check for vendor logic (no DB). Run:
 *   npx tsx scripts/vendors-check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcile, rowToInvoice } from "../src/lib/reconcile";
import { normalizeReturnPeriod } from "../src/lib/gstin";
import type { InvoiceRecord, MatchResult } from "../src/lib/types";
import {
  QA_FAIL_VENDORS_MESSAGE,
  isPreviewQa,
  shouldBypassTrial,
  shouldForceVendorsFail,
} from "../src/lib/qa-flags";
import {
  OFFENDER_COUNT_BY_DISTINCT_PERIOD,
  RETURN_PERIOD_RE,
  offenderPeriodCounts,
  vendorsResponseMeta,
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

test("switch off: raw per-run offenderCount kept, label hidden", () => {
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
    byDistinctPeriod: false,
  });
  const bst = vendors.find((v) => v.gstin === "29AADCS1234A1Z5")!;
  assert.equal(bst.offenderCount, 2); // internal per-run counter still computed
  assert.equal(bst.repeatOffender, null); // CPO condition: label hidden while switch is off
  assert.equal(bst.name, "BST (override)");
  assert.equal(bst.phone, "+919876543210");
  assert.equal(bst.openChaseCount, 1);
  const chennai = vendors.find((v) => v.gstin === "33AAACR5055K1Z2")!;
  assert.equal(chennai.offenderCount, 1);
  assert.equal(chennai.repeatOffender, null);
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
    byDistinctPeriod: false,
  });
  const v = vendors.find((x) => x.gstin === "32AAACX1234A1Z9")!;
  assert.equal(v.inLatestRecon, false);
  assert.equal(v.atRiskAmount, 0);
  assert.equal(v.offenderCount, 3);
  assert.equal(v.repeatOffender, null); // hidden, even with offenderCount 3
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

// ---------- CPO condition: repeat-offender label hidden until DISTINCT return_period ----------
test("switch OFFENDER_COUNT_BY_DISTINCT_PERIOD is ON (#33 merged): label shown by default", () => {
  assert.equal(OFFENDER_COUNT_BY_DISTINCT_PERIOD, true);
  assert.deepEqual(vendorsResponseMeta(), {
    repeatOffenderLabel: "shown",
    offenderCountBasis: "distinct_return_period",
  });
  assert.deepEqual(vendorsResponseMeta(false), { repeatOffenderLabel: "hidden", offenderCountBasis: "runs" });
});

test("default (switch on): repeatOffender is a boolean from distinct periods, stored per-run count ignored", () => {
  const stored = [
    { gstin: "29AADCS1234A1Z5", name: null, phone: null, offenderCount: 7, updatedAt: null }, // 7 re-runs
    { gstin: "33AAACR5055K1Z2", name: null, phone: null, offenderCount: 1, updatedAt: null },
  ];
  const periodCounts = new Map([["29AADCS1234A1Z5", 1], ["33AAACR5055K1Z2", 2]]);
  const vendors = buildVendorSummaries({ latestResults: results, stored, chase: [], periodCounts });
  for (const v of vendors) assert.equal(typeof v.repeatOffender, "boolean", v.gstin);
  const bst = vendors.find((v) => v.gstin === "29AADCS1234A1Z5")!;
  assert.deepEqual([bst.offenderCount, bst.repeatOffender], [1, false]);
  const chennai = vendors.find((v) => v.gstin === "33AAACR5055K1Z2")!;
  assert.deepEqual([chennai.offenderCount, chennai.repeatOffender], [2, true]);
  // no period data (e.g. pre-#33 account) → 0 / false for everyone, no error
  const none = buildVendorSummaries({ latestResults: results, stored, chase: [] });
  for (const v of none) assert.deepEqual([v.offenderCount, v.repeatOffender], [0, false], v.gstin);
  const json = JSON.stringify({ persistence: "postgres", vendors: none, ...vendorsResponseMeta() });
  assert.ok(json.includes('"repeatOffenderLabel":"shown"'));
  assert.ok(!json.includes('"repeatOffender":null'));
});

test("pre-#33 / blank / null return_period runs are ignored without error (existing accounts)", () => {
  const atRiskRows = results.filter((r) => r.category === "itc_at_risk");
  const counts = offenderPeriodCounts([
    { returnPeriod: "", results: atRiskRows }, // pre-#33 rows (column default '')
    { returnPeriod: "", results: atRiskRows },
    { returnPeriod: null, results: atRiskRows },
    { returnPeriod: undefined, results: atRiskRows },
    { returnPeriod: "   ", results: atRiskRows },
  ]);
  assert.equal(counts.size, 0);
  // one valid month on top of many blank runs → 1, not a repeat offender
  const mixed = offenderPeriodCounts([
    { returnPeriod: "", results: atRiskRows },
    { returnPeriod: "", results: atRiskRows },
    { returnPeriod: "2026-09", results: atRiskRows },
  ]);
  for (const g of offenderGstinsForRun(atRiskRows)) assert.equal(mixed.get(g), 1, g);
});

test("YYYY-MM rule agrees across vendors.ts, #33's normalizeReturnPeriod and the SQL regex", () => {
  const dbSrc = readFileSync(join(__dirname, "..", "src", "lib", "db.ts"), "utf8");
  const sqlText = dbSrc.match(/export const DISTINCT_PERIOD_OFFENDER_SQL = `([\s\S]*?)`;/)![1];
  const sqlRe = new RegExp(sqlText.match(/r\.return_period ~ '([^']+)'/)![1]);
  const samples = [
    "2026-09", "2026-01", "2026-12", "2099-12", "2000-01",
    "2026-00", "2026-13", "2026-9", "26-09", "092026", "2026/09", "1999-12", "2026-09-01", "", " 2026-09",
  ];
  for (const p of samples) {
    const stored = normalizeReturnPeriod(p) === p; // what #33 would store verbatim
    assert.equal(RETURN_PERIOD_RE.test(p), stored, `vendors.ts vs gstin.ts: ${JSON.stringify(p)}`);
    assert.equal(sqlRe.test(p), stored, `SQL vs gstin.ts: ${JSON.stringify(p)}`);
  }
  // #33 normalises the portal's MMYYYY to YYYY-MM before saving, so it counts as that month
  assert.equal(normalizeReturnPeriod("092026"), "2026-09");
});

test("switch off (rollback path): repeatOffender is null for every vendor, any count", () => {
  const stored = [
    { gstin: "29AADCS1234A1Z5", name: null, phone: null, offenderCount: 9, updatedAt: null },
    { gstin: "33AAACR5055K1Z2", name: null, phone: null, offenderCount: 2, updatedAt: null },
    { gstin: "27AAECS4455P1ZA", name: null, phone: null, offenderCount: 1, updatedAt: null },
  ];
  // default (uses the switch) and explicit false
  for (const opts of [{ byDistinctPeriod: false }]) {
    const vendors = buildVendorSummaries({ latestResults: results, stored, chase: [], ...opts });
    assert.ok(vendors.length > 0);
    for (const v of vendors) assert.equal(v.repeatOffender, null, v.gstin);
    // no truthy label anywhere in the serialised payload
    const json = JSON.stringify({ persistence: "postgres", vendors, ...vendorsResponseMeta(false) });
    assert.ok(!json.includes('"repeatOffender":true'));
    assert.ok(!json.includes('"repeatOffender":false'));
    assert.ok(json.includes('"repeatOffenderLabel":"hidden"'));
    // periodCounts are ignored while off
    const withCounts = buildVendorSummaries({
      latestResults: results, stored, chase: [], ...opts,
      periodCounts: new Map([["29AADCS1234A1Z5", 5]]),
    });
    assert.equal(withCounts.find((v) => v.gstin === "29AADCS1234A1Z5")!.offenderCount, 9);
  }
});

test("offenderPeriodCounts: DISTINCT return_period (same month re-run counts once)", () => {
  const atRisk = (gstin: string): MatchResult => ({ ...results[0], id: `r|${gstin}|X|`, gstin, category: "itc_at_risk" });
  const mismatch = (gstin: string): MatchResult => ({ ...results[0], id: `m|${gstin}|Y|`, gstin, category: "value_mismatch" });
  const matched = (gstin: string): MatchResult => ({ ...results[0], id: `m|${gstin}|Z|`, gstin, category: "matched" });
  const counts = offenderPeriodCounts([
    { returnPeriod: "2026-08", results: [atRisk("G_A"), atRisk("G_A"), mismatch("G_B")] },
    { returnPeriod: "2026-08", results: [atRisk("G_A")] }, // same month re-run → still 1
    { returnPeriod: "2026-08", results: [atRisk("G_A")] }, // and again
    { returnPeriod: "2026-09", results: [mismatch("G_A"), matched("G_C")] },
    { returnPeriod: "", results: [atRisk("G_A"), atRisk("G_B")] }, // #33 default '' → ignored
    { returnPeriod: "092026", results: [atRisk("G_B")] }, // not YYYY-MM → ignored
    { returnPeriod: "2026-13", results: [atRisk("G_B")] }, // invalid month → ignored
    { returnPeriod: null, results: [atRisk("G_B")] },
    { returnPeriod: "2026-10", results: [atRisk("UNKNOWN"), matched("G_B")] },
  ]);
  assert.equal(counts.get("G_A"), 2); // 2026-08 (x3 runs) + 2026-09
  assert.equal(counts.get("G_B"), 1); // 2026-08 only
  assert.equal(counts.has("G_C"), false); // matched-only never counts
  assert.equal(counts.has("UNKNOWN"), false);
  assert.ok(RETURN_PERIOD_RE.test("2026-09") && !RETURN_PERIOD_RE.test("2026-9"));
});

test("switch on: label shown, based on distinct periods not runs (re-runs of one month count once)", () => {
  // Stored per-run counter says 4 (four re-runs of one month) → must NOT be a repeat offender.
  const stored = [
    { gstin: "29AADCS1234A1Z5", name: null, phone: null, offenderCount: 4, updatedAt: null },
    { gstin: "33AAACR5055K1Z2", name: null, phone: null, offenderCount: 2, updatedAt: null },
  ];
  const periodCounts = offenderPeriodCounts([
    { returnPeriod: "2026-08", results },
    { returnPeriod: "2026-08", results },
    { returnPeriod: "2026-08", results },
    { returnPeriod: "2026-08", results },
    { returnPeriod: "2026-09", results: results.filter((r) => r.gstin === "33AAACR5055K1Z2") },
  ]);
  const vendors = buildVendorSummaries({
    latestResults: results, stored, chase: [], byDistinctPeriod: true, periodCounts,
  });
  const bst = vendors.find((v) => v.gstin === "29AADCS1234A1Z5")!;
  assert.equal(bst.offenderCount, 1);
  assert.equal(bst.repeatOffender, false);
  const chennai = vendors.find((v) => v.gstin === "33AAACR5055K1Z2")!;
  assert.equal(chennai.offenderCount, 2);
  assert.equal(chennai.repeatOffender, true);
  const delhi = vendors.find((v) => v.gstin === "07AAACP0505B1ZQ")!; // matched-only
  assert.equal(delhi.offenderCount, 0);
  assert.equal(delhi.repeatOffender, false);
});

test("DISTINCT_PERIOD_OFFENDER_SQL counts DISTINCT return_period and ignores blank/invalid periods", () => {
  // Read from db.ts source so this check stays pure (no DB driver import).
  const dbSrc = readFileSync(join(__dirname, "..", "src", "lib", "db.ts"), "utf8");
  const q = dbSrc.match(/export const DISTINCT_PERIOD_OFFENDER_SQL = `([\s\S]*?)`;/)![1];
  // ...and it only runs behind the switch
  assert.match(dbSrc, /if \(OFFENDER_COUNT_BY_DISTINCT_PERIOD\) \{\s*const pr = await sql\.query\(DISTINCT_PERIOD_OFFENDER_SQL/);
  assert.match(q, /COUNT\(DISTINCT r\.return_period\)/);
  assert.match(q, /r\.return_period ~ '\^20\[0-9\]\{2\}-\(0\[1-9\]\|1\[0-2\]\)\$'/);
  assert.match(q, /'itc_at_risk', 'value_mismatch'/);
  assert.match(q, /WHERE r\.user_id = \$1/);
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
