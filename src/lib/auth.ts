import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserSession } from "./types";
import { hasDatabase } from "./db";

const COOKIE = "itc_session";

function getSecret(): Uint8Array {
  const fromEnv = process.env.AUTH_SECRET;
  if (hasDatabase() || process.env.NODE_ENV === "production") {
    if (!fromEnv) {
      throw new Error("AUTH_SECRET is required when DATABASE_URL is set or in production");
    }
    return new TextEncoder().encode(fromEnv);
  }
  return new TextEncoder().encode(fromEnv || "itc-rescue-demo-secret-change-in-prod");
}

export async function createSessionToken(user: UserSession): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
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
