import { getSession } from "./auth";
import { getUserByEmail, hasDatabase } from "./db";

export async function requireDbUser() {
  if (!hasDatabase()) return null;
  const session = await getSession();
  if (!session?.email) return null;
  const user = await getUserByEmail(String(session.email).trim().toLowerCase());
  if (!user) return null;
  return user;
}
