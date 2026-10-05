import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import type { ChaseItem, ChaseStatus, MatchResult, ReconSummary } from "./types";
import {
  VendorValidationError,
  buildVendorSummaries,
  normalizeIndianMobile,
  normalizeVendorGstin,
  offenderGstinsForRun,
  withBestEffortOffenseBump,
  type StoredVendor,
  type VendorSummary,
} from "./vendors";
import { QA_FAIL_VENDORS_MESSAGE } from "./qa-flags";
import { attachPhones, firstPhoneByGstin } from "./phone";

let _sql: NeonQueryFunction<false, false> | null = null;
let _schemaReady = false;
let _vendorsSchemaReady = false;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!_sql) {
    _sql = neon(url);
  }
  return _sql;
}

export async function ensureSchema() {
  if (_schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gstin TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'trial',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      company_id TEXT REFERENCES companies(id),
      password_hash TEXT,
      recon_count INT NOT NULL DEFAULT 0,
      invoice_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Upgrade older schemas that lack password_hash
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS recon_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      summary JSONB NOT NULL,
      results JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS chase_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recon_id TEXT REFERENCES recon_runs(id) ON DELETE CASCADE,
      gstin TEXT NOT NULL DEFAULT '',
      vendor_name TEXT NOT NULL DEFAULT '',
      invoice_number TEXT NOT NULL DEFAULT '',
      invoice_date TEXT NOT NULL DEFAULT '',
      amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS chase_items_user_idx ON chase_items(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS recon_runs_user_idx ON recon_runs(user_id)`;
  // Sample MatchResult ids collide across users if chase PK is global `id`.
  // Prefer composite PK (user_id, id). Best-effort migrate; ignore if already done.
  try {
    await sql.query(`ALTER TABLE chase_items DROP CONSTRAINT IF EXISTS chase_items_pkey`);
  } catch {
    /* ignore */
  }
  try {
    await sql.query(
      `ALTER TABLE chase_items ADD CONSTRAINT chase_items_user_id_pkey PRIMARY KEY (user_id, id)`
    );
  } catch {
    /* already composite or duplicates — unique index fallback below */
  }
  try {
    await sql.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS chase_items_user_id_uidx ON chase_items (user_id, id)`
    );
  } catch {
    /* ignore */
  }
  _schemaReady = true;
}

/**
 * Vendor view (#2) schema, bootstrapped separately from ensureSchema() so a
 * vendors DDL problem can never block auth / recon / chase. Only called from
 * vendor helpers and the best-effort offender bump.
 *
 * Stored: user-owned fields (name override, phone) + the idempotent
 * repeat-offender counter. At-risk ₹ / mismatch are computed from the latest
 * recon at read time (see listVendorsForUser).
 */
export async function ensureVendorsSchema() {
  if (_vendorsSchemaReady) return;
  await ensureSchema(); // users + recon_runs must exist for the FKs
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS vendors (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gstin TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      offender_count INT NOT NULL DEFAULT 0,
      last_offense_run_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, gstin),
      CONSTRAINT vendors_last_offense_run_id_fkey FOREIGN KEY (last_offense_run_id)
        REFERENCES recon_runs(id) ON DELETE SET NULL
    )
  `;
  // A vendors table created by an earlier preview build (before the FK) is not
  // altered by CREATE TABLE IF NOT EXISTS, so add the FK idempotently. Orphaned
  // run ids are nulled first (the guard only compares against real runs).
  try {
    await sql.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'vendors_last_offense_run_id_fkey'
            AND conrelid = 'vendors'::regclass
        ) THEN
          UPDATE vendors v SET last_offense_run_id = NULL
          WHERE v.last_offense_run_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM recon_runs r WHERE r.id = v.last_offense_run_id);
          ALTER TABLE vendors
            ADD CONSTRAINT vendors_last_offense_run_id_fkey
            FOREIGN KEY (last_offense_run_id) REFERENCES recon_runs(id) ON DELETE SET NULL;
        END IF;
      END $$`);
  } catch (err) {
    console.error(
      "[vendors] could not ensure vendors_last_offense_run_id_fkey:",
      err instanceof Error ? err.message : err
    );
  }
  _vendorsSchemaReady = true;
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export type DbUser = {
  id: string;
  email: string;
  name: string;
  companyName?: string;
  gstin?: string;
  plan: "trial" | "starter" | "growth";
  reconCount: number;
  invoiceCount: number;
  createdAt: string;
};

function rowToUser(row: Record<string, unknown>): DbUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    companyName: (row.company_name as string) || undefined,
    gstin: (row.gstin as string) || undefined,
    plan: ((row.plan as string) || "trial") as DbUser["plan"],
    reconCount: Number(row.recon_count || 0),
    invoiceCount: Number(row.invoice_count || 0),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
  companyName?: string;
  gstin?: string;
}): Promise<DbUser> {
  await ensureSchema();
  const sql = getSql();
  const email = input.email.trim().toLowerCase();
  const password = String(input.password || "").trim();
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const existing = await sql`
    SELECT id, password_hash FROM users WHERE email = ${email} LIMIT 1
  `;
  if (existing.length) {
    const ex = existing[0] as Record<string, unknown>;
    const prev = ex.password_hash == null ? "" : String(ex.password_hash);
    // Heal pre-password / broken-hash accounts so DoD second-session login works
    if (!prev || !prev.startsWith("$2")) {
      const passwordHash = await bcrypt.hash(password, 10);
      await sql.query(`UPDATE users SET password_hash = $1, name = $2 WHERE email = $3`, [
        passwordHash,
        input.name,
        email,
      ]);
      const healedRows = await sql`
        SELECT u.id, u.email, u.name, u.recon_count, u.invoice_count, u.created_at,
               c.name AS company_name, c.gstin, c.plan
        FROM users u
        LEFT JOIN companies c ON c.id = u.company_id
        WHERE u.email = ${email}
        LIMIT 1
      `;
      if (!healedRows.length) throw new Error("Account repair failed");
      return rowToUser(healedRows[0] as Record<string, unknown>);
    }
    throw new Error("An account with this email already exists. Log in instead.");
  }

  const companyId = id("co");
  const userId = id("usr");
  const companyName = input.companyName || input.name || "My Company";
  const gstin = input.gstin || "";
  const passwordHash = await bcrypt.hash(password, 10);

  await sql`
    INSERT INTO companies (id, name, gstin, plan)
    VALUES (${companyId}, ${companyName}, ${gstin}, 'trial')
  `;
  // sql.query avoids any neon tagged-template edge cases with bcrypt `$` hashes
  await sql.query(
    `INSERT INTO users (id, email, name, company_id, password_hash, recon_count, invoice_count)
     VALUES ($1, $2, $3, $4, $5, 0, 0)`,
    [userId, email, input.name, companyId, passwordHash]
  );

  return {
    id: userId,
    email,
    name: input.name,
    companyName,
    gstin: gstin || undefined,
    plan: "trial",
    reconCount: 0,
    invoiceCount: 0,
    createdAt: new Date().toISOString(),
  };
}

export async function authenticateUser(input: {
  email: string;
  password: string;
}): Promise<DbUser> {
  await ensureSchema();
  const sql = getSql();
  const email = input.email.trim().toLowerCase();
  const password = String(input.password || "").trim();

  const rows = await sql`
    SELECT u.id, u.email, u.name, u.password_hash, u.recon_count, u.invoice_count, u.created_at,
           c.name AS company_name, c.gstin, c.plan
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.email = ${email}
    LIMIT 1
  `;
  if (!rows.length) {
    throw new Error("Invalid email or password");
  }
  const row = rows[0] as Record<string, unknown>;
  const rawHash = row.password_hash;
  const hash =
    rawHash == null || rawHash === ""
      ? null
      : typeof rawHash === "string"
        ? rawHash
        : String(rawHash);
  if (!hash || !hash.startsWith("$2")) {
    throw new Error("This account needs a password reset. Sign up again with a new email, or contact support.");
  }
  const ok = await bcrypt.compare(password, hash);
  if (!ok) {
    throw new Error("Invalid email or password");
  }
  return rowToUser(row);
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.email, u.name, u.recon_count, u.invoice_count, u.created_at,
           c.name AS company_name, c.gstin, c.plan
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.email = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  if (!rows.length) return null;
  return rowToUser(rows[0] as Record<string, unknown>);
}


export async function saveReconForUser(
  userId: string,
  results: MatchResult[],
  summary: ReconSummary,
  opts: { forceVendorsFail?: boolean } = {}
): Promise<{ reconId: string; chase: ChaseItem[] }> {
  await ensureSchema();
  const sql = getSql();
  const reconId = id("recon");
  const lastUpdated = new Date().toISOString();

  const existing = await sql`
    SELECT id, status FROM chase_items WHERE user_id = ${userId}
  `;
  const statusMap = new Map(
    (existing as Record<string, unknown>[]).map((r) => [r.id as string, r.status as string])
  );

  const chaseById = new Map<string, ChaseItem>();
  for (const r of results) {
    if (r.category !== "itc_at_risk" && r.category !== "value_mismatch") continue;
    if (!r.id || chaseById.has(r.id)) continue;
    const status = (statusMap.get(r.id) as ChaseStatus) || "pending";
    const rawAmount = Number(r.booksTax || r.gstr2bTax || 0);
    const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
    chaseById.set(r.id, {
      id: r.id,
      gstin: r.gstin || "",
      vendorName: r.vendorName || "",
      invoiceNumber: r.invoiceNumber || "",
      invoiceDate: r.invoiceDate || "",
      amount,
      category: r.category,
      status,
      lastUpdated,
      ...(r.phone ? { phone: r.phone } : {}), // UX-04 (in-memory only; no chase_items column)
    });
  }
  const chase = Array.from(chaseById.values());

  const atRisk = results.filter(
    (r) => r.category === "itc_at_risk" || r.category === "value_mismatch"
  ).length;
  if (atRisk > 0 && chase.length === 0) {
    throw new Error("Chase build produced 0 rows from at-risk results");
  }

  const summaryJson = JSON.stringify(summary);
  const resultsJson = JSON.stringify(results);

  // Sequential writes (neon HTTP). Avoid fragile multi-style transaction batches.
  await sql.query(
    `INSERT INTO recon_runs (id, user_id, summary, results)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [reconId, userId, summaryJson, resultsJson]
  );

  await sql`DELETE FROM chase_items WHERE user_id = ${userId}`;

  for (const c of chase) {
    await sql.query(
      `INSERT INTO chase_items (
        id, user_id, recon_id, gstin, vendor_name, invoice_number, invoice_date,
        amount, category, status, last_updated
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
      )
      ON CONFLICT (user_id, id) DO UPDATE SET
        recon_id = EXCLUDED.recon_id,
        gstin = EXCLUDED.gstin,
        vendor_name = EXCLUDED.vendor_name,
        invoice_number = EXCLUDED.invoice_number,
        invoice_date = EXCLUDED.invoice_date,
        amount = EXCLUDED.amount,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        last_updated = NOW()`,
      [
        c.id,
        userId,
        reconId,
        c.gstin,
        c.vendorName,
        c.invoiceNumber,
        c.invoiceDate,
        c.amount,
        c.category,
        c.status,
      ]
    );
  }

  await sql`
    UPDATE users
    SET recon_count = recon_count + 1,
        invoice_count = invoice_count + ${results.length}
    WHERE id = ${userId}
  `;

  const verified = await listChaseForUser(userId);
  if (chase.length > 0 && verified.length === 0) {
    throw new Error("Chase rows failed to persist after recon save");
  }

  const saved = { reconId, chase: verified.length ? verified : chase };

  // Vendor repeat-offender bump: best-effort, AFTER recon + chase writes have
  // succeeded, outside any transaction. A failure (vendors table missing, DB
  // error, QA forced failure) is logged and swallowed; `saved` is returned
  // unchanged so the recon/chase result and HTTP response are unaffected.
  return withBestEffortOffenseBump(saved, { userId, runId: reconId }, () =>
    recordVendorOffensesForRun(userId, reconId, results, {
      forceFail: opts.forceVendorsFail,
    })
  );
}

/**
 * Idempotent repeat-offender bump, keyed on the recon run id.
 * $1 user_id, $2 run id, $3 JSON array of distinct offender GSTINs.
 * - New GSTIN → row inserted with offender_count = 1, last_offense_run_id = run.
 * - Existing GSTIN → +1 only if last_offense_run_id IS DISTINCT FROM this run,
 *   so re-applying the same run (retry) matches 0 rows and changes nothing.
 * Does not touch name/phone (user-owned).
 */
export const VENDOR_OFFENSE_BUMP_SQL = `
INSERT INTO vendors (user_id, gstin, offender_count, last_offense_run_id)
SELECT DISTINCT $1::text, g.gstin, 1, $2::text
FROM jsonb_array_elements_text($3::jsonb) AS g(gstin)
ON CONFLICT (user_id, gstin) DO UPDATE SET
  offender_count = vendors.offender_count + 1,
  last_offense_run_id = EXCLUDED.last_offense_run_id,
  updated_at = NOW()
WHERE vendors.last_offense_run_id IS DISTINCT FROM EXCLUDED.last_offense_run_id`;

/**
 * Apply the offense bump for an already-saved run (single upsert statement, no
 * transaction). Safe to call repeatedly for the same runId. Throws on failure;
 * saveReconForUser wraps it with withBestEffortOffenseBump.
 */
export async function recordVendorOffensesForRun(
  userId: string,
  runId: string,
  results: MatchResult[],
  opts: { forceFail?: boolean } = {}
): Promise<number> {
  // PREVIEW-ONLY QA switch; ignored in production. The route only sets
  // forceFail when shouldForceVendorsFail() (VERCEL_ENV=preview && QA_HOOKS=1).
  // Throws before touching the DB.
  if (opts.forceFail) throw new Error(QA_FAIL_VENDORS_MESSAGE);
  await ensureVendorsSchema();
  const offenders = offenderGstinsForRun(results);
  if (!offenders.length) return 0;
  const sql = getSql();
  await sql.query(VENDOR_OFFENSE_BUMP_SQL, [userId, runId, JSON.stringify(offenders)]);
  return offenders.length;
}

export async function getLatestReconForUser(userId: string): Promise<{
  id: string;
  createdAt: string;
  results: MatchResult[];
  summary: ReconSummary;
} | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, created_at, summary, results FROM recon_runs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    createdAt: new Date(row.created_at as string).toISOString(),
    summary: row.summary as ReconSummary,
    results: row.results as MatchResult[],
  };
}

export async function listChaseForUser(userId: string): Promise<ChaseItem[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, gstin, vendor_name, invoice_number, invoice_date, amount, category, status, last_updated
    FROM chase_items
    WHERE user_id = ${userId}
    ORDER BY last_updated DESC
  `;
  let items = (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    gstin: (r.gstin as string) || "",
    vendorName: (r.vendor_name as string) || "",
    invoiceNumber: (r.invoice_number as string) || "",
    invoiceDate: (r.invoice_date as string) || "",
    amount: Number(r.amount || 0),
    category: r.category as ChaseItem["category"],
    status: r.status as ChaseStatus,
    lastUpdated: new Date(r.last_updated as string).toISOString(),
  }));

  // Soft-launch heal: recon exists with at-risk rows but chase table empty
  if (items.length === 0) {
    const latest = await getLatestReconForUser(userId);
    if (latest) {
      const need = latest.results.filter(
        (r) => r.category === "itc_at_risk" || r.category === "value_mismatch"
      );
      if (need.length) {
        await rebuildChaseFromResults(userId, latest.results, null);
        const again = await sql`
          SELECT id, gstin, vendor_name, invoice_number, invoice_date, amount, category, status, last_updated
          FROM chase_items
          WHERE user_id = ${userId}
          ORDER BY last_updated DESC
        `;
        items = (again as Record<string, unknown>[]).map((r) => ({
          id: r.id as string,
          gstin: (r.gstin as string) || "",
          vendorName: (r.vendor_name as string) || "",
          invoiceNumber: (r.invoice_number as string) || "",
          invoiceDate: (r.invoice_date as string) || "",
          amount: Number(r.amount || 0),
          category: r.category as ChaseItem["category"],
          status: r.status as ChaseStatus,
          lastUpdated: new Date(r.last_updated as string).toISOString(),
        }));
      }
    }
  }

  // UX-04: chase_items has no phone column (no schema change). Look the vendor
  // phone up by GSTIN from the latest recon's results JSON instead.
  if (items.length) {
    items = attachPhones(items, await latestPhoneByGstin(userId));
  }

  return items;
}

/**
 * GSTIN -> vendor phone ("91XXXXXXXXXX") from the latest recon_runs.results JSON,
 * first valid phone in result order. Best-effort: any error -> empty map, so the
 * chase list still loads (WhatsApp then opens without a recipient, as before).
 */
async function latestPhoneByGstin(userId: string): Promise<Map<string, string>> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT t.e->>'gstin' AS gstin, t.e->>'phone' AS phone
      FROM (
        SELECT results FROM recon_runs
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1
      ) r
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.results) = 'array' THEN r.results ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS t(e, ord)
      WHERE COALESCE(t.e->>'phone', '') <> ''
      ORDER BY t.ord
    `;
    return firstPhoneByGstin(
      (rows as Record<string, unknown>[]).map((r) => ({
        gstin: String(r.gstin || ""),
        phone: r.phone == null ? null : String(r.phone),
      }))
    );
  } catch (err) {
    console.error("[chase] vendor phone lookup failed:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

async function rebuildChaseFromResults(
  userId: string,
  results: MatchResult[],
  reconId: string | null
) {
  const sql = getSql();
  let rid = reconId;
  if (!rid) {
    const rows = await sql`
      SELECT id FROM recon_runs WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
    `;
    rid = rows.length ? (rows[0] as { id: string }).id : null;
  }
  await sql`DELETE FROM chase_items WHERE user_id = ${userId}`;
  const seen = new Set<string>();
  for (const r of results) {
    if (r.category !== "itc_at_risk" && r.category !== "value_mismatch") continue;
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    const rawAmount = Number(r.booksTax || r.gstr2bTax || 0);
    const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
    await sql.query(
      `INSERT INTO chase_items (
        id, user_id, recon_id, gstin, vendor_name, invoice_number, invoice_date,
        amount, category, status, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
      ON CONFLICT (user_id, id) DO NOTHING`,
      [
        r.id,
        userId,
        rid,
        r.gstin || "",
        r.vendorName || "",
        r.invoiceNumber || "",
        r.invoiceDate || "",
        amount,
        r.category,
      ]
    );
  }
}

export async function updateChaseStatusForUser(
  userId: string,
  chaseId: string,
  status: ChaseStatus
): Promise<ChaseItem[]> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE chase_items
    SET status = ${status}, last_updated = NOW()
    WHERE user_id = ${userId} AND id = ${chaseId}
  `;
  return listChaseForUser(userId);
}

export async function canUserRunRecon(
  userId: string,
  opts: { bypassTrial?: boolean } = {}
): Promise<{ ok: boolean; reason?: string }> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT u.recon_count, c.plan
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  if (!rows.length) return { ok: false, reason: "Account not found" };
  const row = rows[0] as Record<string, unknown>;
  const plan = (row.plan as string) || "trial";
  if (plan !== "trial") return { ok: true };
  // PREVIEW-ONLY QA switch; ignored in production. Routes only set bypassTrial
  // when shouldBypassTrial(email) (VERCEL_ENV=preview && QA_HOOKS=1 && "qa." email).
  if (opts.bypassTrial) return { ok: true };

  const trialReason = "Free trial used. We'll email you when more runs open.";

  if (Number(row.recon_count || 0) >= 1) {
    return { ok: false, reason: trialReason };
  }

  // Heal mid-flight failures: recon_runs exists but recon_count never incremented
  const prior = await sql`
    SELECT 1 FROM recon_runs WHERE user_id = ${userId} LIMIT 1
  `;
  if (prior.length) {
    await sql`
      UPDATE users SET recon_count = GREATEST(recon_count, 1) WHERE id = ${userId}
    `;
    return { ok: false, reason: trialReason };
  }

  return { ok: true };
}

/**
 * Vendor view (#2): one row per GSTIN in the latest recon ∪ stored vendors.
 * At-risk ₹ / mismatch come from the latest recon_runs row (computed, never
 * stored); phone/name/offender_count come from `vendors`; open chase count
 * from chase_items (pending | still_blocked). Sorted by atRiskAmount desc.
 * Read-only: does not trigger the chase self-heal in listChaseForUser.
 */
export async function listVendorsForUser(userId: string): Promise<VendorSummary[]> {
  await ensureVendorsSchema();
  const sql = getSql();
  const latest = await getLatestReconForUser(userId);
  const vendorRows = await sql`
    SELECT gstin, name, phone, offender_count, updated_at
    FROM vendors
    WHERE user_id = ${userId}
  `;
  const chaseRows = await sql`
    SELECT gstin, status FROM chase_items WHERE user_id = ${userId}
  `;
  const stored: StoredVendor[] = (vendorRows as Record<string, unknown>[]).map((r) => ({
    gstin: String(r.gstin || ""),
    name: r.name == null ? null : String(r.name),
    phone: r.phone == null ? null : String(r.phone),
    offenderCount: Number(r.offender_count || 0),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  }));
  const chase = (chaseRows as Record<string, unknown>[]).map((r) => ({
    gstin: String(r.gstin || ""),
    status: r.status as ChaseStatus,
  }));
  return buildVendorSummaries({ latestResults: latest?.results, stored, chase });
}

/**
 * Save a vendor's phone (and optionally a display-name override).
 * - gstin: normalised (uppercase, no spaces) and must be a valid 15-char GSTIN.
 * - phone: Indian mobile → stored as +91XXXXXXXXXX; `null` clears it.
 * - name: omitted/undefined leaves the stored name unchanged; "" clears the override.
 * Throws VendorValidationError (status 400) on invalid input.
 */
export async function upsertVendorPhone(
  userId: string,
  gstin: string,
  phone: string | null,
  name?: string | null
): Promise<{ vendor: VendorSummary | null; vendors: VendorSummary[] }> {
  const g = normalizeVendorGstin(gstin);
  const normalizedPhone = phone === null ? null : normalizeIndianMobile(phone);
  const nameProvided = name !== undefined;
  let normalizedName: string | null = null;
  if (nameProvided && name !== null) {
    if (typeof name !== "string") throw new VendorValidationError("name must be a string");
    const trimmed = name.trim();
    if (trimmed.length > 200) throw new VendorValidationError("name is too long (max 200)");
    normalizedName = trimmed || null;
  }

  await ensureVendorsSchema();
  const sql = getSql();
  await sql.query(
    `INSERT INTO vendors (user_id, gstin, name, phone)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, gstin) DO UPDATE SET
       phone = EXCLUDED.phone,
       name = CASE WHEN $5::boolean THEN EXCLUDED.name ELSE vendors.name END,
       updated_at = NOW()`,
    [userId, g, normalizedName, normalizedPhone, nameProvided]
  );
  const vendors = await listVendorsForUser(userId);
  return { vendor: vendors.find((v) => v.gstin === g) || null, vendors };
}
