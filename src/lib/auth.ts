import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserSession } from "./types";

const COOKIE = "itc_session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "itc-rescue-demo-secret-change-in-prod"
);

export async function createSessionToken(user: UserSession): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifySessionToken(
  token: string
): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as UserSession;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<UserSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export { COOKIE };
