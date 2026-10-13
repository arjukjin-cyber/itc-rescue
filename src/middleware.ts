import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "itc_session";

// A visitor with a valid session never sees an empty /signup or /login form:
// any reload, back-nav or pre-hydration native submit lands on /dashboard.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return NextResponse.next();
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.next();
  }
}

export const config = { matcher: ["/signup", "/login"] };
