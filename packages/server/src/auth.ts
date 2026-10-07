import { randomBytes } from "node:crypto";

/**
 * Generate a random token for authentication.
 */
export function generateToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Verify the Origin header of an incoming request.
 * Allows requests with no Origin (e.g. direct browser navigation),
 * but strictly checks provided Origins against the expected host.
 */
export function isAllowedOrigin(origin: string | undefined, expectedHost: string): boolean {
  if (!origin) return true;
  return origin === `http://${expectedHost}` || origin === `https://${expectedHost}`;
}

/**
 * Verify a token provided in the URL query string.
 */
export function isValidToken(url: string | undefined, expectedToken: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("token") === expectedToken;
  } catch {
    return false;
  }
}
