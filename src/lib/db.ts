import { neon, NeonQueryFunction } from "@neondatabase/serverless";

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
      recon_count INT NOT NULL DEFAULT 0,
      invoice_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
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

export async function upsertUser(input: {
  email: string;
  name: string;
  companyName?: string;
  gstin?: string;
  isSignup?: boolean;
}): Promise<DbUser> {
  await ensureSchema();
  const sql = getSql();
  const email = input.email.trim().toLowerCase();

  const existing = await sql`
    SELECT u.id, u.email, u.name, u.recon_count, u.invoice_count, u.created_at,
           c.id AS company_id, c.name AS company_name, c.gstin, c.plan
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.email = ${email}
    LIMIT 1
  `;

  if (existing.length) {
    const row = existing[0] as Record<string, unknown>;
    if (input.isSignup) {
      // Fresh signup: reset trial counters
      await sql`
        UPDATE users SET recon_count = 0, invoice_count = 0, name = ${input.name}
        WHERE email = ${email}
      `;
      if (row.company_id) {
        await sql`
          UPDATE companies
          SET name = ${input.companyName || (row.company_name as string) || input.name},
              gstin = ${input.gstin || (row.gstin as string) || ""},
              plan = 'trial'
          WHERE id = ${row.company_id as string}
        `;
      }
      return {
        id: row.id as string,
        email,
        name: input.name,
        companyName: input.companyName || (row.company_name as string) || undefined,
        gstin: input.gstin || (row.gstin as string) || undefined,
        plan: "trial",
        reconCount: 0,
        invoiceCount: 0,
        createdAt: new Date(row.created_at as string).toISOString(),
      };
    }
    return {
      id: row.id as string,
      email,
      name: (row.name as string) || input.name,
      companyName: (row.company_name as string) || undefined,
      gstin: (row.gstin as string) || undefined,
      plan: ((row.plan as string) || "trial") as DbUser["plan"],
      reconCount: Number(row.recon_count || 0),
      invoiceCount: Number(row.invoice_count || 0),
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }

  const companyId = id("co");
  const userId = id("usr");
  const companyName = input.companyName || input.name || "My Company";
  const gstin = input.gstin || "";

  await sql`
    INSERT INTO companies (id, name, gstin, plan)
    VALUES (${companyId}, ${companyName}, ${gstin}, 'trial')
  `;
  await sql`
    INSERT INTO users (id, email, name, company_id, recon_count, invoice_count)
    VALUES (${userId}, ${email}, ${input.name}, ${companyId}, 0, 0)
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
  const row = rows[0] as Record<string, unknown>;
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
