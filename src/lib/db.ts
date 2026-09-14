import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

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
  const password = String(input.password || "");
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length) {
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
  await sql`
    INSERT INTO users (id, email, name, company_id, password_hash, recon_count, invoice_count)
    VALUES (${userId}, ${email}, ${input.name}, ${companyId}, ${passwordHash}, 0, 0)
  `;

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
  const password = String(input.password || "");

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
  const hash = row.password_hash as string | null;
  if (!hash) {
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
