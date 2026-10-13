import { NextRequest, NextResponse } from "next/server";
import { COOKIE, createSessionToken } from "@/lib/auth";
import { authenticateUser, hasDatabase, registerUser } from "@/lib/db";
import type { UserSession } from "@/lib/types";
import { errorCodeFor, errorRedirectPath, formDataToBody, isFormContentType } from "@/lib/auth-form";

function toSession(u: {
  email: string;
  name: string;
  companyName?: string;
  gstin?: string;
  plan: UserSession["plan"];
  reconCount: number;
  createdAt: string;
}): UserSession {
  return {
    email: u.email,
    name: u.name,
    companyName: u.companyName,
    gstin: u.gstin,
    plan: u.plan,
    reconCount: u.reconCount,
    createdAt: u.createdAt,
  };
}

export async function POST(req: NextRequest) {
  if (!isFormContentType(req.headers.get("content-type"))) return handle(req.json());
  // Native (pre-hydration) form submit: same logic, answer with 303 redirects.
  let body: Record<string, unknown> = {};
  try {
    body = formDataToBody(await req.formData());
  } catch {
    /* empty body -> validation fails below */
  }
  const isSignup = Boolean(body.isSignup);
  let res = await handle(body);
  // Mirror the client flow: signup on an existing email retries as login with the same password.
  if (isSignup && res.status === 409) res = await handle({ ...body, isSignup: false });
  const base = req.nextUrl.clone();
  base.search = "";
  if (res.ok) {
    base.pathname = "/dashboard";
    const out = NextResponse.redirect(base, 303);
    for (const c of res.cookies.getAll()) out.cookies.set(c);
    return out;
  }
  const data = await res.json().catch(() => ({}));
  const code = errorCodeFor(String(data?.error || ""), res.status);
  const target = new URL(errorRedirectPath(isSignup, code), base);
  return NextResponse.redirect(target, 303);
}

async function handle(input: unknown | Promise<unknown>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await input;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const name = String(body.name || email.split("@")[0] || "User");
    const companyName = String(body.companyName || "").trim();
    const gstin = String(body.gstin || "").trim().toUpperCase();
    const isSignup = Boolean(body.isSignup);

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }
    if (isSignup && password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    let user: UserSession;

    if (hasDatabase()) {
      // Never mint a cookie without a real DB user + password_hash
      const dbUser = isSignup
        ? await registerUser({
            email,
            name,
            password,
            companyName: companyName || undefined,
            gstin: gstin || undefined,
          })
        : await authenticateUser({ email, password });
      user = toSession(dbUser);
    } else {
      user = {
        email,
        name,
        companyName: companyName || undefined,
        gstin: gstin || undefined,
        plan: "trial",
        reconCount: 0,
        createdAt: new Date().toISOString(),
      };
    }

    const token = await createSessionToken(user);
    const res = NextResponse.json({
      user,
      persistence: hasDatabase() ? "postgres" : "demo",
    });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    const isExists = message.toLowerCase().includes("already exists");
    const isInvalid = message.toLowerCase().includes("invalid");
    const status = isExists ? 409 : isInvalid ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
