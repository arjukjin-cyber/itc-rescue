import { NextRequest, NextResponse } from "next/server";
import { COOKIE, createSessionToken } from "@/lib/auth";
import { hasDatabase, upsertUser } from "@/lib/db";
import type { UserSession } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || email.split("@")[0] || "User");
    const companyName = String(body.companyName || "").trim();
    const gstin = String(body.gstin || "").trim().toUpperCase();
    const isSignup = Boolean(body.isSignup || body.companyName || body.gstin);

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    let user: UserSession;

    if (hasDatabase()) {
      const dbUser = await upsertUser({
        email,
        name,
        companyName: companyName || undefined,
        gstin: gstin || undefined,
        isSignup,
      });
      user = {
        email: dbUser.email,
        name: dbUser.name,
        companyName: dbUser.companyName,
        gstin: dbUser.gstin,
        plan: dbUser.plan,
        reconCount: dbUser.reconCount,
        createdAt: dbUser.createdAt,
      };
    } else {
      // Local/demo fallback when DATABASE_URL is absent
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
