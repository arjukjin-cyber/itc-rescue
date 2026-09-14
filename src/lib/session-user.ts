import { getSession } from "./auth";
import { getUserByEmail, hasDatabase } from "./db";

export async function requireDbUser() {
  if (!hasDatabase()) return null;
  const session = await getSession();
  if (!session) return null;
  const user = await getUserByEmail(session.email);
  if (!user) return null;
  return user;
}
