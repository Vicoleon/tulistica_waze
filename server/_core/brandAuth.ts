/**
 * Brand portal auth (Fase 3).
 *
 * Separate from the user OAuth flow:
 *  - Brands authenticate via email + password (no OAuth portal).
 *  - Session lives in a different cookie (BRAND_COOKIE) so user and brand
 *    sessions never collide on the same browser.
 *  - Passwords are stored as scrypt(N=16384, r=8, p=1) hashes with a 16-byte
 *    salt per brand. No external crypto deps.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { ENV } from "./env";

export const BRAND_COOKIE = "tulistica_brand_session";
export const BRAND_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// ============ Password hashing ============

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(plain: string): {
  hash: string;
  salt: string;
} {
  const saltBuf = randomBytes(16);
  const derived = scryptSync(plain, saltBuf, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return {
    hash: derived.toString("hex"),
    salt: saltBuf.toString("hex"),
  };
}

export function verifyPassword(
  plain: string,
  hash: string,
  salt: string
): boolean {
  try {
    const saltBuf = Buffer.from(salt, "hex");
    const derived = scryptSync(plain, saltBuf, SCRYPT_KEYLEN, SCRYPT_OPTS);
    const stored = Buffer.from(hash, "hex");
    if (derived.length !== stored.length) return false;
    return timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

// ============ Session JWT ============

interface BrandSessionClaims {
  brandId: number;
  slug: string;
}

function sessionSecret(): Uint8Array {
  // Reuse JWT_SECRET — brand and user JWTs are signed with the same secret
  // but cookies are namespaced, so confusion is impossible.
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signBrandSession(
  claims: BrandSessionClaims
): Promise<string> {
  const expSeconds = Math.floor((Date.now() + BRAND_SESSION_TTL_MS) / 1000);
  return new SignJWT({ ...claims, kind: "brand" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expSeconds)
    .sign(sessionSecret());
}

export async function verifyBrandSession(
  cookieValue: string | undefined | null
): Promise<BrandSessionClaims | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, sessionSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.kind !== "brand") return null;
    const brandId = Number(payload.brandId);
    const slug = String(payload.slug);
    if (!Number.isFinite(brandId) || !slug) return null;
    return { brandId, slug };
  } catch {
    return null;
  }
}

export function getBrandSessionFromRequest(
  req: Request
): Promise<BrandSessionClaims | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return verifyBrandSession(cookies[BRAND_COOKIE]);
}

// ============ Slug helper ============

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
