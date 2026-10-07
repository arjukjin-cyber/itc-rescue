import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import type { ChaseItem, ChaseStatus, MatchResult, ReconSummary } from "./types";
import { attachPhones, firstPhoneByGstin } from "./phone";

let _sql: NeonQueryFunction<false, false> | null = null;
let _schemaReady = false;

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
  // GSTINs (multi-GSTIN per company) + per-run GSTIN / return period.
  // chase_items.gstin is the VENDOR's GSTIN, so the company's GSTIN lives in company_gstin.
  await sql`
    CREATE TABLE IF NOT EXISTS gstins (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      gstin TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      state_code TEXT NOT NULL DEFAULT '',
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, gstin)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS gstins_company_idx ON gstins(company_id)`;
  await sql`ALTER TABLE recon_runs ADD COLUMN IF NOT EXISTS company_gstin TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE recon_runs ADD COLUMN IF NOT EXISTS return_period TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE chase_items ADD COLUMN IF NOT EXISTS company_gstin TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE chase_items ADD COLUMN IF NOT EXISTS return_period TEXT NOT NULL DEFAULT ''`;
  // Backfill: the signup GSTIN becomes the company's primary GSTIN (idempotent).
  try {
    await sql.query(
      `INSERT INTO gstins (id, company_id, gstin, state_code, is_primary)
       SELECT 'gst_' || substr(md5(c.id || c.gstin), 1, 16), c.id, upper(c.gstin), substr(upper(c.gstin), 1, 2), TRUE
       FROM companies c
       WHERE length(c.gstin) = 15
       ON CONFLICT DO NOTHING`
    );
  } catch (err) {
    console.error("[schema] gstins backfill skipped:", err instanceof Error ? err.message : err);
  }
  _schemaReady = true;
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
  meta: { companyGstin?: string; returnPeriod?: string } = {}
): Promise<{ reconId: string; chase: ChaseItem[] }> {
  const companyGstin = meta.companyGstin || "";
  const returnPeriod = meta.returnPeriod || "";
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
    `INSERT INTO recon_runs (id, user_id, summary, results, company_gstin, return_period)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
    [reconId, userId, summaryJson, resultsJson, companyGstin, returnPeriod]
  );

  await sql`DELETE FROM chase_items WHERE user_id = ${userId}`;

  for (const c of chase) {
    await sql.query(
      `INSERT INTO chase_items (
        id, user_id, recon_id, gstin, vendor_name, invoice_number, invoice_date,
        amount, category, status, company_gstin, return_period, last_updated
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
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
        company_gstin = EXCLUDED.company_gstin,
        return_period = EXCLUDED.return_period,
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
        companyGstin,
        returnPeriod,
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

  return { reconId, chase: verified.length ? verified : chase };
}

export async function getLatestReconForUser(userId: string): Promise<{
  id: string;
  createdAt: string;
  results: MatchResult[];
  summary: ReconSummary;
  companyGstin: string;
  returnPeriod: string;
} | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, created_at, summary, results, company_gstin, return_period FROM recon_runs
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
    companyGstin: String(row.company_gstin || ""),
    returnPeriod: String(row.return_period || ""),
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

export async function canUserRunRecon(userId: string): Promise<{ ok: boolean; reason?: string }> {
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

// ---------- Company: GSTINs + settings ----------

export type DbGstin = {
  id: string;
  gstin: string;
  label: string;
  stateCode: string;
  isPrimary: boolean;
  createdAt: string;
};

export const MAX_GSTINS_PER_COMPANY = 20;

async function companyIdForUser(userId: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`SELECT company_id FROM users WHERE id = ${userId} LIMIT 1`;
  if (!rows.length) return null;
  return ((rows[0] as Record<string, unknown>).company_id as string) || null;
}

function rowToGstin(r: Record<string, unknown>): DbGstin {
  return {
    id: String(r.id),
    gstin: String(r.gstin),
    label: String(r.label || ""),
    stateCode: String(r.state_code || ""),
    isPrimary: Boolean(r.is_primary),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/**
 * The schema backfill only runs once per server process, so a company that signed up
 * later may have companies.gstin set but no gstins row. Heal it on read (idempotent).
 */
async function ensurePrimaryGstinRow(companyId: string) {
  const sql = getSql();
  await sql.query(
    `INSERT INTO gstins (id, company_id, gstin, state_code, is_primary)
     SELECT 'gst_' || substr(md5(c.id || c.gstin), 1, 16), c.id, upper(c.gstin), substr(upper(c.gstin), 1, 2),
            NOT EXISTS (SELECT 1 FROM gstins g WHERE g.company_id = c.id)
     FROM companies c
     WHERE c.id = $1 AND length(c.gstin) = 15
     ON CONFLICT DO NOTHING`,
    [companyId]
  );
}

export async function listGstinsForUser(userId: string): Promise<DbGstin[]> {
  await ensureSchema();
  const sql = getSql();
  const companyId = await companyIdForUser(userId);
  if (!companyId) return [];
  await ensurePrimaryGstinRow(companyId);
  const rows = await sql`
    SELECT id, gstin, label, state_code, is_primary, created_at
    FROM gstins WHERE company_id = ${companyId}
    ORDER BY is_primary DESC, created_at ASC
  `;
  return (rows as Record<string, unknown>[]).map(rowToGstin);
}

export class GstinError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

/** Adds a validated GSTIN. The first GSTIN of a company becomes primary and is mirrored to companies.gstin. */
export async function addGstinForUser(
  userId: string,
  input: { gstin: string; stateCode: string; label?: string }
): Promise<DbGstin> {
  await ensureSchema();
  const sql = getSql();
  const companyId = await companyIdForUser(userId);
  if (!companyId) throw new GstinError("Account has no company", 404, "no_company");
  await ensurePrimaryGstinRow(companyId);
  const existing = await sql`SELECT gstin FROM gstins WHERE company_id = ${companyId}`;
  if ((existing as Record<string, unknown>[]).some((r) => r.gstin === input.gstin)) {
    throw new GstinError("This GSTIN is already added", 409, "duplicate");
  }
  if (existing.length >= MAX_GSTINS_PER_COMPANY) {
    throw new GstinError(`You can add up to ${MAX_GSTINS_PER_COMPANY} GSTINs`, 422, "limit");
  }
  const isPrimary = existing.length === 0;
  const gid = id("gst");
  const label = String(input.label || "").trim().slice(0, 60);
  await sql.query(
    `INSERT INTO gstins (id, company_id, gstin, label, state_code, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, gstin) DO NOTHING`,
    [gid, companyId, input.gstin, label, input.stateCode, isPrimary]
  );
  if (isPrimary) {
    await sql`UPDATE companies SET gstin = ${input.gstin} WHERE id = ${companyId}`;
  }
  const rows = await sql`
    SELECT id, gstin, label, state_code, is_primary, created_at
    FROM gstins WHERE company_id = ${companyId} AND gstin = ${input.gstin} LIMIT 1
  `;
  if (!rows.length) throw new GstinError("GSTIN save failed", 500, "save_failed");
  return rowToGstin(rows[0] as Record<string, unknown>);
}

/** True when the GSTIN belongs to the user's company (used to scope recon runs). */
export async function userOwnsGstin(userId: string, gstin: string): Promise<boolean> {
  const list = await listGstinsForUser(userId);
  return list.some((g) => g.gstin === gstin);
}

/** PATCH /api/settings scope: company name only. */
export async function updateCompanyNameForUser(userId: string, name: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const companyId = await companyIdForUser(userId);
  if (!companyId) throw new GstinError("Account has no company", 404, "no_company");
  await sql`UPDATE companies SET name = ${name} WHERE id = ${companyId}`;
  return name;
}
