/**
 * Shared-password gate with an HMAC-signed session cookie.
 *
 * Deliberately dependency-free and Edge-runtime safe (Web Crypto only) so it
 * runs in middleware. Two passwords, two roles:
 *   admin    — sees everything, including the Sources panel and raw exports
 *   investor — sees the curated metric view
 */

export type Role = "admin" | "investor";

export const SESSION_COOKIE = "pyrotree_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function secret(): string {
  const s = process.env.PYROTREE_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "PYROTREE_SESSION_SECRET must be set to a random string of at least 16 characters.",
    );
  }
  return s;
}

const enc = new TextEncoder();

async function hmac(payload: string): Promise<string> {
  const keyData = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", keyData, enc.encode(payload));
  return base64url(new Uint8Array(sig));
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Length-independent equality, so a bad guess can't be timed. */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function createSession(role: Role): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${role}.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(
  token: string | undefined,
): Promise<Role | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, expRaw, sig] = parts;
  if (role !== "admin" && role !== "investor") return null;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;

  const expected = await hmac(`${role}.${expRaw}`);
  return safeEqual(sig, expected) ? role : null;
}

/** Which role, if any, this password unlocks. Admin is checked first. */
export function roleForPassword(password: string): Role | null {
  const admin = process.env.PYROTREE_ADMIN_PASSWORD;
  const investor = process.env.PYROTREE_INVESTOR_PASSWORD;
  if (admin && safeEqual(password, admin)) return "admin";
  if (investor && safeEqual(password, investor)) return "investor";
  return null;
}

export function cookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
