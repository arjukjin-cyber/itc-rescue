import { NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";

function clear(res: NextResponse) {
  // Match the attributes used at login so every browser drops the cookie.
  res.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
  });
  // Production only: on previews this would also wipe Vercel's protection cookie.
  if (process.env.VERCEL_ENV === "production") res.headers.set("Clear-Site-Data", '"cookies"');
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// JSON logout (kept for API callers).
export async function POST() {
  return clear(NextResponse.json({ ok: true }));
}

// Navigation logout: the cookie is cleared on the same response that redirects,
// so the browser can never land on "/" with the session still set.
export async function GET(req: NextRequest) {
  return clear(NextResponse.redirect(new URL("/", req.url), 303));
}
