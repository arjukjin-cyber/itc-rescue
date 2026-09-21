import { NextResponse } from "next/server";
import { COOKIE, getSession } from "@/lib/auth";
import { getUserByEmail, hasDatabase } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  if (hasDatabase()) {
    try {
      const dbUser = await getUserByEmail(session.email);
      if (dbUser) {
        return NextResponse.json({
          user: {
            email: dbUser.email,
            name: dbUser.name,
            companyName: dbUser.companyName,
            gstin: dbUser.gstin,
            plan: dbUser.plan,
            reconCount: dbUser.reconCount,
            createdAt: dbUser.createdAt,
          },
          persistence: "postgres",
        });
      }
      // Orphan JWT — force re-login; never pretend demo auth
      const res = NextResponse.json(
        {
          user: null,
          error: "Account not found. Please sign up or log in again.",
          persistence: "postgres",
        },
        { status: 401 }
      );
      res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
      return res;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Database error";
      return NextResponse.json({ error: message, user: null }, { status: 500 });
    }
  }

  return NextResponse.json({ user: session, persistence: "demo" });
}
