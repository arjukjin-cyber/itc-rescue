import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import type { ChaseItem, ChaseStatus, MatchResult, ReconSummary } from "./types";

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
  summary: ReconSummary
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

  return { reconId, chase: verified.length ? verified : chase };
}

export async function getLatestReconForUser(userId: string): Promise<{
  results: MatchResult[];
  summary: ReconSummary;
} | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT summary, results FROM recon_runs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
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

  return items;
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

  const trialReason =
    "Free trial allows 1 reconciliation. Upgrade to Starter (₹999/mo) or Growth (₹2,499/mo) to continue.";

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
