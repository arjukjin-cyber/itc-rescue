import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
    } catch (e) {
      const message = e instanceof Error ? e.message : "Database error";
      return NextResponse.json({ error: message, user: session }, { status: 500 });
    }
  }

  return NextResponse.json({ user: session, persistence: "demo" });
}
