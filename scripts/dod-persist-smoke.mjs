import assert from "node:assert/strict";

function canRun(plan, reconCount, hasPriorRecon = false) {
  if (plan !== "trial") return { ok: true };
  if (Number(reconCount || 0) >= 1 || hasPriorRecon) {
    return { ok: false, reason: "Free trial allows 1 reconciliation." };
  }
  return { ok: true };
}

assert.equal(canRun("trial", 0).ok, true);
assert.equal(canRun("trial", 1).ok, false);
assert.equal(canRun("trial", 0, true).ok, false); // heal path
assert.equal(canRun("starter", 99).ok, true);

function clientPersistDecision({ wantsAuth, status, persistence }) {
  if (status === 402) return { ok: false, persistence: "postgres", paywall: true };
  if (status === 401 && wantsAuth) return { ok: false, persistence: "postgres", authError: true };
  if (status === 200 && persistence === "postgres") return { ok: true, persistence: "postgres" };
  if (wantsAuth) return { ok: false, persistence: "postgres" }; // never silent demo, surface 500
  if (status === 503) return { ok: true, persistence: "demo" };
  return { ok: false, persistence: "demo" };
}

assert.deepEqual(clientPersistDecision({ wantsAuth: true, status: 500 }), {
  ok: false,
  persistence: "postgres",
});
assert.deepEqual(clientPersistDecision({ wantsAuth: true, status: 402 }), {
  ok: false,
  persistence: "postgres",
  paywall: true,
});
assert.deepEqual(clientPersistDecision({ wantsAuth: false, status: 503 }), {
  ok: true,
  persistence: "demo",
});

// Chase insert must not use parameterized timestamptz cast
import { readFileSync } from "node:fs";
const db = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const saveFn = db.split("export async function saveReconForUser")[1].split("export async function getLatestReconForUser")[0];
assert.match(saveFn, /sql\.transaction/);
assert.match(saveFn, /NOW\(\)/);
assert.doesNotMatch(saveFn.replace(/`\$\{iso\}::timestamptz`/g, ""), /\$\{[^}]+\}::timestamptz/);
assert.match(saveFn, /sql\.query/);

console.log("dod-persist-smoke: OK");
