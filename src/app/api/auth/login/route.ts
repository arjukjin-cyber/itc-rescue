import { NextRequest, NextResponse } from "next/server";
import { COOKIE, createSessionToken } from "@/lib/auth";
import type { UserSession } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || email.split("@")[0] || "User");
    const companyName = String(body.companyName || "").trim();
    const gstin = String(body.gstin || "").trim().toUpperCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    // Demo auth: any password accepted
    const user: UserSession = {
      email,
      name,
      companyName: companyName || undefined,
      gstin: gstin || undefined,
      plan: "trial",
      reconCount: 0,
      createdAt: new Date().toISOString(),
    };

    const token = await createSessionToken(user);
    const res = NextResponse.json({ user });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
