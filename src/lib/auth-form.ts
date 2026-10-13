/** Helpers for native (pre-hydration) form posts to /api/auth/login. */
export type AuthErrorCode =
  | "invalid_email"
  | "password_required"
  | "password_short"
  | "exists"
  | "invalid_credentials"
  | "server";

export function isFormContentType(ct: string | null): boolean {
  const v = (ct || "").toLowerCase();
  return v.includes("application/x-www-form-urlencoded") || v.includes("multipart/form-data");
}

export function formDataToBody(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  const s = String(out.isSignup ?? "").toLowerCase();
  out.isSignup = s === "true" || s === "1" || s === "on";
  return out;
}

/** Error code from an API error message/status; never includes user input. */
export function errorCodeFor(message: string, status: number): AuthErrorCode {
  const m = message.toLowerCase();
  if (status === 409 || m.includes("already exists")) return "exists";
  if (status === 401) return "invalid_credentials";
  if (m.includes("valid email")) return "invalid_email";
  if (m.includes("at least 6")) return "password_short";
  if (m.includes("password required")) return "password_required";
  if (status === 409 || m.includes("already exists")) return "exists";
  if (status === 401 || m.includes("invalid")) return "invalid_credentials";
  return "server";
}

export function errorRedirectPath(isSignup: boolean, code: AuthErrorCode): string {
  return `${isSignup ? "/signup" : "/login"}?error=${encodeURIComponent(code)}`;
}

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_email: "Please enter a valid email address.",
  password_required: "Please enter your password.",
  password_short: "Password must be at least 6 characters.",
  exists: "An account with this email already exists. Log in instead.",
  invalid_credentials: "Invalid email or password.",
  server: "Something went wrong. Please try again.",
};

export function messageForErrorCode(code: string | null | undefined): string {
  if (!code) return "";
  return (AUTH_ERROR_MESSAGES as Record<string, string>)[code] || AUTH_ERROR_MESSAGES.server;
}
